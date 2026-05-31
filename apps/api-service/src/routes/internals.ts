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
import type { Logger } from "@operonai/lib";
import {
  JOB_PREFIX_INCIDENT,
  SSE_CHANNEL_INCIDENTS,
  SSE_CHANNEL_APPROVALS,
  INCIDENT_STATUS,
  APPROVAL_STATUS,
} from "@operonai/lib";
import type { InvestigationJobData } from "@operonai/queue";

// Internal routes — only called by other services via X-Internal-Secret header
// These are NOT exposed publicly through nginx

export const internalRouter = new Hono<{ Variables: { orgId: string; logger: Logger } }>();

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
    const logger = c.get("logger") as Logger | undefined;
    const body = c.req.valid("json");

    const incident = await createIncident(db, {
      orgId: body.orgId,
      status: INCIDENT_STATUS.DETECTED,
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
      currentState: INCIDENT_STATUS.DETECTED,
      previousState: null,
      stateData: { anomalyScore: body.score },
    });

    // Enqueue investigation job
    const jobData: InvestigationJobData = {
      incidentId: incident.id,
      orgId: body.orgId,
      severity: body.severity,
    };

    const jobId = `${JOB_PREFIX_INCIDENT}${incident.id}`;

    try {
      await investigationQueue.add("investigate", jobData, {
        jobId,
        priority:
          body.severity === "critical" ? 1 : body.severity === "high" ? 2 : 3,
      });
    } catch (err) {
      logger?.error({ err, incidentId: incident.id }, "failed to enqueue investigation job");
      return c.json({ error: "Failed to enqueue investigation job" }, 500);
    }

    // Update status to queued
    await updateIncidentStatus(db, incident.id, INCIDENT_STATUS.QUEUED);

    await createWorkflowState(db, {
      orgId: body.orgId,
      incidentId: incident.id,
      currentState: INCIDENT_STATUS.QUEUED,
      previousState: INCIDENT_STATUS.DETECTED,
      stateData: { jobId },
    });

    // SSE — notify dashboard
    publish(`${SSE_CHANNEL_INCIDENTS}:${body.orgId}`, "incident_created", {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      detectedAt: incident.detectedAt,
    }, logger);

    logger?.info(
      { incidentId: incident.id, orgId: body.orgId, severity: body.severity },
      "incident created and queued"
    );

    return c.json({ incidentId: incident.id }, 201);
  }
);

// Called by agent-service after an approval decision, if promote() fails.
// Fallback path — normally the approval route handles job promotion directly.

internalRouter.post("/internal/incidents/:id/resume", async (c) => {
  const logger = c.get("logger") as Logger | undefined;
  const id = c.req.param("id");

  const jobId = `${JOB_PREFIX_INCIDENT}${id}`;
  const job = await investigationQueue.getJob(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  try {
    await job.promote();
    return c.json({ success: true });
  } catch (err) {
    logger?.error({ err, jobId }, "failed to promote job on resume");
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
    const logger = c.get("logger") as Logger | undefined;
    const body = c.req.valid("json");

    const expiresAt = new Date(Date.now() + body.timeoutMs);

    const approval = await createApprovalRequest(db, {
      orgId: body.orgId,
      incidentId: body.incidentId,
      actionType: body.actionType,
      actionDescription: body.actionDescription,
      actionPayload: body.actionPayload,
      status: APPROVAL_STATUS.PENDING,
      expiresAt,
    });

    await updateIncidentStatus(db, body.incidentId, INCIDENT_STATUS.AWAITING_APPROVAL);

    await createWorkflowState(db, {
      orgId: body.orgId,
      incidentId: body.incidentId,
      currentState: INCIDENT_STATUS.AWAITING_APPROVAL,
      previousState: INCIDENT_STATUS.INVESTIGATING,
      stateData: { approvalId: approval.id, actionType: body.actionType },
    });

    // Notify dashboard — new approval pending
    publish(`${SSE_CHANNEL_APPROVALS}:${body.orgId}`, "approval_requested", {
      approvalId: approval.id,
      incidentId: body.incidentId,
      actionType: body.actionType,
      actionDescription: body.actionDescription,
      expiresAt: expiresAt.toISOString(),
    }, logger);

    logger?.info(
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
