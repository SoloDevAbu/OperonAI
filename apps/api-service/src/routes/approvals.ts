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
import type { Logger } from "@operonai/lib";
import {
  JOB_PREFIX_INCIDENT,
  SSE_CHANNEL_APPROVALS,
  APPROVAL_STATUS,
} from "@operonai/lib";

export const approvalsRouter = new Hono<{
  Variables: { orgId: string; logger: Logger };
}>();

const idParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

approvalsRouter.get("/pending", async (c) => {
  const orgId = c.get("orgId") as string;

  const pending = await findPendingApprovalsByOrgId(db, orgId);

  return c.json({ approvals: pending });
});

approvalsRouter.post(
  "/:id/approve",
  zValidator("param", idParamSchema),
  async (c) => {
    const logger = c.get("logger") as Logger | undefined;
    const orgId = c.get("orgId") as string;
    const { id } = c.req.valid("param");

    const approval = await findPendingApprovalById(db, id, orgId);

    if (!approval) {
      logger?.warn(
        { approvalId: id, orgId },
        "approval request not found or already resolved"
      );
      return c.json(
        { error: "Approval request not found or already resolved" },
        404
      );
    }

    if (new Date() > approval.expiresAt) {
      await updateApprovalStatus(db, id, APPROVAL_STATUS.TIMED_OUT);

      logger?.warn({ approvalId: id }, "approval request timed out");
      return c.json({ error: "Approval request has expired" }, 410);
    }

    await updateApprovalStatus(db, id, APPROVAL_STATUS.APPROVED);

    // Promote the delayed BullMQ job immediately
    // The agent re-enqueued itself as a delayed job when it hit this approval gate.
    // Job ID convention: "incident-{incidentId}" — see agent-service approval gate.
    await promoteAgentJob(
      approval.incidentId,
      id,
      APPROVAL_STATUS.APPROVED,
      logger
    );

    // SSE — notify dashboard
    publish(
      `${SSE_CHANNEL_APPROVALS}:${orgId}`,
      "approval_resolved",
      {
        approvalId: id,
        incidentId: approval.incidentId,
        status: APPROVAL_STATUS.APPROVED,
      },
      logger
    );

    logger?.info(
      { approvalId: id, incidentId: approval.incidentId },
      "approval granted"
    );

    return c.json({ success: true, status: "approved" });
  }
);

const rejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

approvalsRouter.post(
  "/:id/reject",
  zValidator("param", idParamSchema),
  zValidator("json", rejectSchema),
  async (c) => {
    const logger = c.get("logger") as Logger | undefined;
    const orgId = c.get("orgId") as string;
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");

    const approval = await findPendingApprovalById(db, id, orgId);

    if (!approval) {
      logger?.warn(
        { approvalId: id, orgId },
        "approval request not found or already resolved on reject"
      );
      return c.json(
        { error: "Approval request not found or already resolved" },
        404
      );
    }

    await updateApprovalStatus(db, id, APPROVAL_STATUS.REJECTED, {
      rejectionReason: reason,
    });

    await promoteAgentJob(
      approval.incidentId,
      id,
      APPROVAL_STATUS.REJECTED,
      logger
    );

    publish(
      `${SSE_CHANNEL_APPROVALS}:${orgId}`,
      "approval_resolved",
      {
        approvalId: id,
        incidentId: approval.incidentId,
        status: APPROVAL_STATUS.REJECTED,
        reason,
      },
      logger
    );

    logger?.info(
      { approvalId: id, incidentId: approval.incidentId, reason },
      "approval rejected"
    );

    return c.json({ success: true, status: "rejected" });
  }
);

const promoteAgentJob = async (
  incidentId: string,
  approvalId: string,
  decision: string,
  logger?: Logger
): Promise<void> => {
  try {
    // Job was enqueued by agent with id: "incident-{incidentId}"
    const jobId = `${JOB_PREFIX_INCIDENT}${incidentId}`;
    const job = await investigationQueue.getJob(jobId);

    if (!job) {
      logger?.warn(
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

    logger?.info(
      { jobId, decision },
      "agent job promoted after approval decision"
    );
  } catch (err) {
    logger?.error(
      { err, incidentId, approvalId },
      "failed to promote agent job"
    );
  }
};
