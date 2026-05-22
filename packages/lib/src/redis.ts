import IORedis from "ioredis"
import { createLogger } from "./logger"

const logger = createLogger({
  service: "redis shared",
  prettyPrint: true,
})
const getRedisUrl = (): string => {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required")
  }
  return process.env.REDIS_URL
}

export const createRedisClient = (): IORedis => {
  const client = new IORedis(getRedisUrl(), {
    retryStrategy: (times) => {
      if (times > 10) return null
      return Math.min(times * 200, 2000)
    },
    reconnectOnError: (err) => {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"]
      return targetErrors.some((e) => err.message.includes(e))
    },
    lazyConnect: true,
    enableOfflineQueue: true,
  })

  client.on("connect", () => {
    logger.info("Redis connected")
  })

  client.on("ready", () => {
    logger.info("Redis ready")
  })

  client.on("error", (err: Error) => {
    logger.error({ err }, "Redis error")
  })

  client.on("reconnecting", () => {
    logger.warn("Redis reconnecting")
  })

  client.on("end", () => {
    logger.info("Redis connection ended")
  })

  client.on("close", () => {
    logger.warn("Redis connection closed")
  })

  return client
}

export const createBullMQRedisClient = (): IORedis => {
  const client = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 20) return null
      return Math.min(times * 500, 5000)
    },
    reconnectOnError: (err) => {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"]
      return targetErrors.some((e) => err.message.includes(e))
    },
    lazyConnect: true,
  })

  client.on("connect", () => {
    logger.info("Redis connected")
  })

  client.on("ready", () => {
    logger.info("Redis ready")
  })

  client.on("error", (err: Error) => {
    logger.error({ err }, "Redis error")
  })

  client.on("reconnecting", () => {
    logger.warn("Redis reconnecting")
  })

  client.on("end", () => {
    logger.info("Redis connection ended")
  })

  client.on("close", () => {
    logger.warn("Redis connection closed")
  })

  return client
}

export type { IORedis }
