import fp from "fastify-plugin"
import { createRedisClient } from "@operonai/lib"
import type { FastifyInstance } from "fastify"
import type { IORedis } from "@operonai/lib"

const redisPlugin = fp(async (fastify: FastifyInstance) => {
  const redis = createRedisClient()

  await redis.connect()

  fastify.decorate("redis", redis)

  fastify.addHook("onClose", async () => {
    await redis.quit()
  })
})

export default redisPlugin

declare module "fastify" {
  interface FastifyInstance {
    redis: IORedis
  }
}
