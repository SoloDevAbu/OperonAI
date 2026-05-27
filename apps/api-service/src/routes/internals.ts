import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import {
  createIncident,
  createWorkflowState,
  updateIncidentStatus,
  createApprovalRequest,
} from "@operonai/db";
import { investigationQueue } from "../lib/queue";
import { publish } from "../lib/sse";
import { createLogger } from "@operonai/lib";
import type { InvestigationJobData } from "@operonai/queue";

const logger = createLogger({ service: "api-service:internal" });

// Internal routes — only called by other services via X-Internal-Secret header
// These are NOT exposed publicly through nginx

export const internalRouter = new Hono<{ Variables: { orgId: string } }>();

// Called by anomaly-service when it detects an anomaly.
// Creates the incident, records the initial workflow state, enqueues the job.

const createIncidentSchema = z.object({
  orgId: z.string().uuid(),
  rawEventIds: z.array(z.string()),
  title: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  affectedServices: z.array(z.string()),
  initialContext: z.record(z.unknown()),
  score: z.number(),
});

internalRouter.post(
  "/internal/incidents",
  zValidator("json", createIncidentSchema),
  async (c) => {
    const body = c.req.valid("json");

    const incident = await createIncident(db, {
      orgId: body.orgId,
      status: "detected",
      severity: body.severity,
      title: body.title,
      affectedServices: body.affectedServices,
      initialContext: body.initialContext,
      rawEventIds: body.rawEventIds,
    });

    // Record initial workflow state
    await createWorkflowState(db, {
      orgId: body.orgId,
      incidentId: incident.id,
      currentState: "detected",
      previousState: null,
      stateData: { anomalyScore: body.score },
    });

    // Enqueue investigation job
    const jobData: InvestigationJobData = {
      incidentId: incident.id,
      orgId: body.orgId,
      severity: body.severity,
    };

    await investigationQueue.add("investigate", jobData, {
      // Use incident ID as job ID so we can look it up later for approval resume
      jobId: `incident-${incident.id}`,
      priority:
        body.severity === "critical" ? 1 : body.severity === "high" ? 2 : 3,
    });

    // Update status to queued
    await updateIncidentStatus(db, incident.id, "queued");

    await createWorkflowState(db, {
      orgId: body.orgId,
      incidentId: incident.id,
      currentState: "queued",
      previousState: "detected",
      stateData: { jobId: `incident-${incident.id}` },
    });

    // SSE — notify dashboard
    publish(`incidents:${body.orgId}`, "incident_created", {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      detectedAt: incident.detectedAt,
    });

    logger.info(
      { incidentId: incident.id, orgId: body.orgId, severity: body.severity },
      "incident created and queued"
    );

    return c.json({ incidentId: incident.id }, 201);
  }
);

// Called by agent-service after an approval decision, if promote() fails.
// Fallback path — normally the approval route handles job promotion directly.

internalRouter.post("/internal/incidents/:id/resume", async (c) => {
  const id = c.req.param("id");

  const jobId = `incident-${id}`;
  const job = await investigationQueue.getJob(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  try {
    await job.promote();
    return c.json({ success: true });
  } catch (err) {
    logger.error({ err, jobId }, "failed to promote job on resume");
    return c.json({ error: "Failed to promote job" }, 500);
  }
});

// Called by agent-service when it needs human approval before executing an action.
// Creates the approval request and pauses the agent.

const createApprovalSchema = z.object({
  orgId: z.string().uuid(),
  incidentId: z.string().uuid(),
  actionType: z.enum([
    "restart_worker",
    "clear_failed_jobs",
    "rollback_deployment",
    "scale_service",
    "custom",
  ]),
  actionDescription: z.string().min(1),
  actionPayload: z.record(z.unknown()),
  timeoutMs: z.number().default(3_600_000), // 1 hour default
});

internalRouter.post(
  "/internal/approvals",
  zValidator("json", createApprovalSchema),
  async (c) => {
    const body = c.req.valid("json");

    const expiresAt = new Date(Date.now() + body.timeoutMs);

    const approval = await createApprovalRequest(db, {
      orgId: body.orgId,
      incidentId: body.incidentId,
      actionType: body.actionType,
      actionDescription: body.actionDescription,
      actionPayload: body.actionPayload,
      status: "pending",
      expiresAt,
    });

    await updateIncidentStatus(db, body.incidentId, "awaiting_approval");

    await createWorkflowState(db, {
      orgId: body.orgId,
      incidentId: body.incidentId,
      currentState: "awaiting_approval",
      previousState: "investigating",
      stateData: { approvalId: approval.id, actionType: body.actionType },
    });

    // Notify dashboard — new approval pending
    publish(`approvals:${body.orgId}`, "approval_requested", {
      approvalId: approval.id,
      incidentId: body.incidentId,
      actionType: body.actionType,
      actionDescription: body.actionDescription,
      expiresAt: expiresAt.toISOString(),
    });

    logger.info(
      {
        approvalId: approval.id,
        incidentId: body.incidentId,
        actionType: body.actionType,
      },
      "approval request created"
    );

    return c.json({ approvalId: approval.id, expiresAt }, 201);
  }
);
