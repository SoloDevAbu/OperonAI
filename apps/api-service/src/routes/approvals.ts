import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import {
  findPendingApprovalsByOrgId,
  findPendingApprovalById,
  updateApprovalStatus,
} from "@operonai/db";
import { investigationQueue } from "../lib/queue";
import { publish } from "../lib/sse";
import { createLogger } from "@operonai/lib";

const logger = createLogger({ service: "api-service:approvals" });

export const approvalsRouter = new Hono<{ Variables: { orgId: string } }>();

approvalsRouter.get("/pending", async (c) => {
  const orgId = c.get("orgId") as string;

  const pending = await findPendingApprovalsByOrgId(db, orgId);

  return c.json({ approvals: pending });
});

approvalsRouter.post("/:id/approve", async (c) => {
  const orgId = c.get("orgId") as string;
  const id = c.req.param("id");

  const approval = await findPendingApprovalById(db, id, orgId);

  if (!approval) {
    return c.json(
      { error: "Approval request not found or already resolved" },
      404
    );
  }

  if (new Date() > approval.expiresAt) {
    await updateApprovalStatus(db, id, "timed_out");

    return c.json({ error: "Approval request has expired" }, 410);
  }

  await updateApprovalStatus(db, id, "approved");

  // Promote the delayed BullMQ job immediately
  // The agent re-enqueued itself as a delayed job when it hit this approval gate.
  // Job ID convention: "incident-{incidentId}" — see agent-service approval gate.
  await promoteAgentJob(approval.incidentId, id, "approved");

  // SSE — notify dashboard
  publish(`approvals:${orgId}`, "approval_resolved", {
    approvalId: id,
    incidentId: approval.incidentId,
    status: "approved",
  });

  logger.info(
    { approvalId: id, incidentId: approval.incidentId },
    "approval granted"
  );

  return c.json({ success: true, status: "approved" });
});

const rejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

approvalsRouter.post(
  "/:id/reject",
  zValidator("json", rejectSchema),
  async (c) => {
    const orgId = c.get("orgId") as string;
    const id = c.req.param("id");
    const { reason } = c.req.valid("json");

    const approval = await findPendingApprovalById(db, id, orgId);

    if (!approval) {
      return c.json(
        { error: "Approval request not found or already resolved" },
        404
      );
    }

    await updateApprovalStatus(db, id, "rejected", { rejectionReason: reason });

    // Resume agent — it will see status=rejected and skip the action
    await promoteAgentJob(approval.incidentId, id, "rejected");

    publish(`approvals:${orgId}`, "approval_resolved", {
      approvalId: id,
      incidentId: approval.incidentId,
      status: "rejected",
      reason,
    });

    logger.info(
      { approvalId: id, incidentId: approval.incidentId, reason },
      "approval rejected"
    );

    return c.json({ success: true, status: "rejected" });
  }
);

const promoteAgentJob = async (
  incidentId: string,
  approvalId: string,
  decision: "approved" | "rejected"
): Promise<void> => {
  try {
    // Job was enqueued by agent with id: "incident-{incidentId}"
    const jobId = `incident-${incidentId}`;
    const job = await investigationQueue.getJob(jobId);

    if (!job) {
      logger.warn(
        { jobId, approvalId },
        "agent job not found for approval resume — may have already run"
      );
      return;
    }

    // Update job data so agent knows which approval was resolved
    await job.updateData({
      ...job.data,
      resolvedApprovalId: approvalId,
    });

    // Promote from delayed to active immediately
    await job.promote();

    logger.info(
      { jobId, decision },
      "agent job promoted after approval decision"
    );
  } catch (err) {
    // Log but don't fail the approval — the delayed job will fire on its own eventually
    logger.error(
      { err, incidentId, approvalId },
      "failed to promote agent job"
    );
  }
};
