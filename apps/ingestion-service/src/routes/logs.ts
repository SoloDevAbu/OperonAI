import type { FastifyInstance } from "fastify"
import type { IngestLogPayload, RawEvent } from "@operonai/types"
import { normalizeLog } from "../normalizer/index.js"
import type { Buffer } from "../buffer/index.js"
import { ingestLogBodySchema } from "../schemas/logs"

export const registerLogsRoutes = (
  fastify: FastifyInstance,
  buffer: Buffer
) => {
  fastify.post(
    "/ingest/logs",
    { schema: { body: ingestLogBodySchema } },
    async (request, reply) => {
      const org = request.org!
      const payload = request.body as IngestLogPayload

      const normalized = normalizeLog(org.id, payload)

      const event: RawEvent = {
        ...normalized,
        id: crypto.randomUUID(),
        anomalyScore: null,
        receivedAt: new Date(),
      }

      buffer.push(event)

      return reply.status(202).send({ id: event.id, status: "accepted" })
    }
  )
}
