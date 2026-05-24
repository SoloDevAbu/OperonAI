import type { FastifyInstance } from "fastify"
import type { IngestEventPayload, RawEvent } from "@operonai/types"
import { normalizeEvent } from "../normalizer/index.js"
import type { Buffer } from "../buffer/index.js"
import {
  ingestEventBodySchema,
  ingestEventsBulkBodySchema,
} from "../schemas/events"

export const registerEventsRoutes = (
  fastify: FastifyInstance,
  buffer: Buffer
) => {
  fastify.post(
    "/ingest/events",
    { schema: { body: ingestEventBodySchema } },
    async (request, reply) => {
      const org = request.org!
      const payload = request.body as IngestEventPayload
      const normalized = normalizeEvent(org.id, payload)

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

  fastify.post(
    "/ingest/events/bulk",
    { schema: { body: ingestEventsBulkBodySchema } },
    async (request, reply) => {
      const org = request.org!
      const { events } = request.body as { events: IngestEventPayload[] }
      const ids: string[] = []

      for (const payload of events) {
        const normalized = normalizeEvent(org.id, payload)
        const event: RawEvent = {
          ...normalized,
          id: crypto.randomUUID(),
          anomalyScore: null,
          receivedAt: new Date(),
        }
        buffer.push(event)
        ids.push(event.id)
      }

      return reply
        .status(202)
        .send({ ids, count: ids.length, status: "accepted" })
    }
  )
}
