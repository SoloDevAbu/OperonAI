import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createLogger,
  HEADER_AUTHORIZATION,
  HEADER_INTERNAL_SECRET,
  HEADER_ORG_ID,
  type Logger,
} from "@operonai/lib";
import { closeDb, pool } from "./lib/db";
import { closeQueue } from "./lib/queue";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { incidentsRouter } from "./routes/incidents";
import { approvalsRouter } from "./routes/approvals";
import { runbooksRouter } from "./routes/runbooks";
import { streamRouter } from "./routes/stream";
import { internalRouter } from "./routes/internals";
import { organizationsRouter } from "./routes/organizations";

const logger = createLogger({ service: "api-service" });

const app = new Hono<{ Variables: { logger: Logger; orgId?: string; isInternal?: boolean; organization?: any } }>();

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return "http://localhost:3000";
      if (origin.startsWith("http://localhost:3000") || origin.includes("localhost:3000")) {
        return origin;
      }
      return "http://localhost:3000";
    },
    allowHeaders: ["Content-Type", HEADER_AUTHORIZATION, HEADER_ORG_ID, HEADER_INTERNAL_SECRET],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    credentials: true,
  })
);

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({ requestId });
  c.set("logger", reqLogger);

  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  reqLogger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
    },
    "request handled"
  );
});

app.get("/health", (c) => c.json({ status: "ok", service: "api-service" }));

// Service-to-service only — auth via X-Internal-Secret header
// Mounted before public auth middleware

app.use("/internal/*", authMiddleware);
app.route("/", internalRouter);

// Auth via X-Org-Id header + rate limiting

app.use("/incidents/*", authMiddleware);
app.use("/approvals/*", authMiddleware);
app.use("/runbooks/*", authMiddleware);
app.use("/stream/*", authMiddleware);

// Rate limit: 100 requests per minute for most routes
app.use("/incidents/*", rateLimitMiddleware(100, 60_000));
app.use("/approvals/*", rateLimitMiddleware(60, 60_000));
app.use("/runbooks/*", rateLimitMiddleware(60, 60_000));
// SSE endpoints get higher limit — they're long-lived connections
app.use("/stream/*", rateLimitMiddleware(20, 60_000));

app.route("/incidents", incidentsRouter);
app.route("/approvals", approvalsRouter);
app.route("/runbooks", runbooksRouter);
app.route("/stream", streamRouter);
app.route("/organizations", organizationsRouter);


app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  const reqLogger = c.get("logger") || logger;
  reqLogger.error({ err, path: c.req.path }, "unhandled error");
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.API_PORT ?? 3003);

const server = serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, "api-service listening");
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "shutdown signal received");

  server.close(async () => {
    await closeQueue();
    await closeDb(pool);
    logger.info("graceful shutdown complete");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
