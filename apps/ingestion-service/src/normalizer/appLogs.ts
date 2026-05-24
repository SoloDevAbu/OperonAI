import type {
  IngestLogPayload,
  RawEvent,
  NormalizedEventType,
} from "@operonai/types"
import { config } from "../config"

const levelToEventType = (
  level: IngestLogPayload["level"]
): NormalizedEventType => {
  const map: Record<IngestLogPayload["level"], NormalizedEventType> = {
    error: "log.error",
    warn: "log.warn",
    info: "log.info",
    debug: "log.info",
  }

  return map[level]
}

export const normalizeAppLog = (
  orgId: string,
  payload: IngestLogPayload
): Omit<RawEvent, "id" | "anomalyScore" | "receivedAt"> => ({
  orgId,
  source: payload.source,
  sourceType: "app_logs",
  normalizedType: levelToEventType(payload.level),
  payload: {
    level: payload.level,
    message: payload.message,
    timestamp: payload.timestamp,
    ...(payload.fields ?? {}),
  },
  metadata: {
    service: payload.service,
    host: payload.host,
    environment: config.nodeEnv,
  },
})
