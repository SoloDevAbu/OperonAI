import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import {
  findIncidents,
  findIncidentById,
  findIncidentIdOnly,
  findStepsByIncidentId,
  findWorkflowStatesByIncidentId,
} from "@operonai/db";

export const incidentsRouter = new Hono<{ Variables: { orgId: string } }>();

const listQuerySchema = z.object({
  status: z.string().optional(),
  severity: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

incidentsRouter.get("/", zValidator("query", listQuerySchema), async (c) => {
  const orgId = c.get("orgId") as string;
  const { status, severity, limit, offset } = c.req.valid("query");

  const rows = await findIncidents(db, {
    orgId,
    status,
    severity,
    limit,
    offset,
  });

  return c.json({ incidents: rows, limit, offset });
});

incidentsRouter.get("/:id", async (c) => {
  const orgId = c.get("orgId") as string;
  const id = c.req.param("id");

  const incident = await findIncidentById(db, id, orgId);

  if (!incident) return c.json({ error: "Incident not found" }, 404);

  return c.json({ incident });
});

incidentsRouter.get("/:id/steps", async (c) => {
  const orgId = c.get("orgId") as string;
  const id = c.req.param("id");

  const incident = await findIncidentIdOnly(db, id, orgId);

  if (!incident) return c.json({ error: "Incident not found" }, 404);

  const steps = await findStepsByIncidentId(db, id);

  return c.json({ steps });
});

incidentsRouter.get("/:id/timeline", async (c) => {
  const orgId = c.get("orgId") as string;
  const id = c.req.param("id");

  const incident = await findIncidentIdOnly(db, id, orgId);

  if (!incident) return c.json({ error: "Incident not found" }, 404);

  const timeline = await findWorkflowStatesByIncidentId(db, id);

  return c.json({ timeline });
});
