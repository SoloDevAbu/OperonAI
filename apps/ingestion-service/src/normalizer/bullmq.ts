import type {
  IngestEventPayload,
  RawEvent,
  NormalizedEventType,
} from "@operonai/types";
import { config } from "../config";

const resolveBullMQEventType = (type: string): NormalizedEventType => {
  if (type.includes("job_failed")) return "bullmq.job_failed";
  if (type.includes("queue_depth")) return "bullmq.queue_depth_high";
  if (type.includes("worker_stalled")) return "bullmq.worker_stalled";
  if (type.includes("worker_crashed")) return "bullmq.worker_crashed";
  return "bullmq.job_failed";
};

export const normalizeBullMQEvent = (
  orgId: string,
  payload: IngestEventPayload
): Omit<RawEvent, "id" | "anomalyScore" | "receivedAt"> => ({
  orgId,
  source: payload.source,
  sourceType: "bullmq",
  normalizedType: resolveBullMQEventType(payload.type),
  payload: {
    ...payload.data,
    timestamp: payload.timestamp,
  },
  metadata: {
    ...(payload.metadata ?? {}),
    environment: config.nodeEnv,
  },
});
