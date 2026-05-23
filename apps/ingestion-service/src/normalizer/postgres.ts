import type {
  IngestEventPayload,
  RawEvent,
  NormalizedEventType,
} from "@operonai/types"

const resolvePostgresEventType = (type: string): NormalizedEventType => {
  if (type.includes("slow_query")) return "postgres.slow_query"
  if (type.includes("connection_pool"))
    return "postgres.connection_pool_exhausted"
  if (type.includes("deadlock")) return "postgres.deadlock"

  return "postgres.slow_query"
}

export const normalizePostgresEvent = (
  orgId: string,
  payload: IngestEventPayload
): Omit<RawEvent, "id" | "anomalyScore" | "receivedAt"> => ({
  orgId,
  source: payload.source,
  sourceType: "postgres",
  normalizedType: resolvePostgresEventType(payload.type),
  payload: {
    ...payload.data,
    timestamp: payload.timestamp,
  },
  metadata: {
    ...(payload.metadata ?? {}),
    environment: process.env.NODE_ENV ?? "production",
  },
})
