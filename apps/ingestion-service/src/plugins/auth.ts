import fp from "fastify-plugin"
import type { FastifyInstance, FastifyRequest } from "fastify"
import type { Organization } from "@operonai/db"
import { resolveOrgByApiKey } from "../services/orgResolver"

const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest("org", null)

  fastify.addHook("preHandler", async (request: FastifyRequest, reply) => {
    // Only apply to ingestion routes
    if (!request.url.startsWith("/ingest")) return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      return reply
        .status(401)
        .send({ error: "Missing or invalid Authorization header" })
    }

    const apiKey = authHeader.slice(7)
    const org = await resolveOrgByApiKey(fastify.db, fastify.redis, apiKey)

    if (!org) {
      return reply.status(401).send({ error: "Invalid API key" })
    }

    request.org = org
  })
})

export default authPlugin

declare module "fastify" {
  interface FastifyRequest {
    org: Organization | null
  }
}
