import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import { createLogger } from "@operonai/lib"
import dbPlugin from "./plugins/db"
import redisPlugin from "./plugins/redis"
import authPlugin from "./plugins/auth"
import { registerLogsRoutes } from "./routes/logs"
import { registerEventsRoutes } from "./routes/events"
import { createBuffer } from "./buffer"
import { createForwarder } from "./forwarder"
import { createPostgresPoller } from "./poolers/postgres"
import { createBullMQPoller } from "./poolers/bullmq"
import { config } from "./config"

const logger = createLogger({ service: "ingestion-service" })

const start = async () => {
  const fastify = Fastify({
    logger: logger as never,
    bodyLimit: 1_048_576,
    trustProxy: true,
  })

  await fastify.register(cors, { origin: false })
  await fastify.register(helmet)
  await fastify.register(dbPlugin)
  await fastify.register(redisPlugin)
  await fastify.register(authPlugin)

  const forwarder = createForwarder({
    db: fastify.db,
    logger,
  })

  const buffer = createBuffer({
    maxSize: config.buffer.maxSize,
    flushIntervalMs: config.buffer.flushIntervalMs,
    onFlush: forwarder.forwardBatch,
    logger,
  })

  buffer.start()

  registerLogsRoutes(fastify, buffer)
  registerEventsRoutes(fastify, buffer)

  fastify.get("/health", async () => ({
    status: "ok",
    service: "ingestion-service",
  }))

  const postgresPoller = createPostgresPoller({
    db: fastify.db,
    buffer,
    logger,
  })

  const bullmqPoller = createBullMQPoller({
    redis: fastify.redis,
    buffer,
    logger,
  })

  postgresPoller.start()
  bullmqPoller.start()

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutdown signal received")

    postgresPoller.stop()
    bullmqPoller.stop()

    await buffer.stop()

    await fastify.close()

    logger.info("graceful shutdown complete")
    process.exit(0)
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))

  await fastify.listen({ port: config.port, host: "0.0.0.0" })

  logger.info({ port: config.port }, "ingestion-service listening")
}

start().catch((err) => {
  logger.error({ err }, "failed to start ingestion-service")
  process.exit(1)
})
