import type {
  IngestLogPayload,
  IngestEventPayload,
  RawEvent,
  SourceType,
} from "@operonai/types"
import { normalizeAppLog } from "./appLogs"
import { normalizePostgresEvent } from "./postgres"
import { normalizeBullMQEvent } from "./bullmq"

export const normalizeLog = (
  orgId: string,
  payload: IngestLogPayload
): Omit<RawEvent, "id" | "anomalyScore" | "receivedAt"> => {
  return normalizeAppLog(orgId, payload)
}

const resolveSourceType = (type: string): SourceType => {
  if (type.startsWith("postgres.") || type.startsWith("pg.")) return "postgres"
  if (type.startsWith("bullmq.") || type.startsWith("queue.")) return "bullmq"
  return "app_logs"
}

export const normalizeEvent = (
  orgId: string,
  payload: IngestEventPayload
): Omit<RawEvent, "id" | "anomalyScore" | "receivedAt"> => {
  const sourceType = resolveSourceType(payload.type)

  const normalizers: Record<
    SourceType,
    (
      orgId: string,
      payload: IngestEventPayload
    ) => Omit<RawEvent, "id" | "anomalyScore" | "receivedAt">
  > = {
    app_logs: normalizeAppLog as never,
    postgres: normalizePostgresEvent,
    bullmq: normalizeBullMQEvent,
  }

  return normalizers[sourceType](orgId, payload)
}
