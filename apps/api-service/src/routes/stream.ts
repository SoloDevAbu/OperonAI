import { Hono } from "hono";
import { createSSEStream } from "../lib/sse";

export const streamRouter = new Hono<{ Variables: { orgId: string } }>();

// SSE stream — dashboard subscribes to get live incident updates

streamRouter.get("/incidents", (c) => {
  const orgId = c.get("orgId") as string;
  // Channel per org — orgs never see each other's events
  return createSSEStream(c, `incidents:${orgId}`);
});

// SSE stream — dashboard subscribes to get live approval notifications

streamRouter.get("/approvals", (c) => {
  const orgId = c.get("orgId") as string;
  return createSSEStream(c, `approvals:${orgId}`);
});
