import fp from "fastify-plugin"
import { createDb, closeDb } from "@operonai/db"
import type { FastifyInstance } from "fastify"

const dbPlugin = fp(async (fastify: FastifyInstance) => {
  const { db, pool } = createDb()

  fastify.decorate("db", db)

  fastify.addHook("onClose", async () => {
    await closeDb(pool)
  })
})

export default dbPlugin

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof createDb>["db"]
  }
}
