// ─── Source types ─────────────────────────────────────────────────────────────

export type SourceType = "app_logs" | "postgres" | "bullmq";

export type NormalizedEventType =
  // App log events
  | "log.error"
  | "log.warn"
  | "log.info"
  // Postgres events
  | "postgres.slow_query"
  | "postgres.connection_pool_exhausted"
  | "postgres.deadlock"
  // BullMQ events
  | "bullmq.job_failed"
  | "bullmq.queue_depth_high"
  | "bullmq.worker_stalled"
  | "bullmq.worker_crashed";

// ─── Raw event ────────────────────────────────────────────────────────────────

export interface RawEvent {
  id: string;
  orgId: string;
  source: string; // e.g. "api-server-1", "worker-queue"
  sourceType: SourceType;
  normalizedType: NormalizedEventType;
  payload: Record<string, unknown>;
  metadata: RawEventMetadata;
  anomalyScore: number | null;
  receivedAt: Date;
}

export interface RawEventMetadata {
  host?: string;
  service?: string;
  environment?: string;
  region?: string;
  [key: string]: unknown;
}

// ─── Ingestion input shapes ────────────────────────────────────────────────────

export interface IngestLogPayload {
  source: string;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  timestamp: string;
  service?: string;
  host?: string;
  fields?: Record<string, unknown>;
}

export interface IngestEventPayload {
  source: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ─── Anomaly service request/response ─────────────────────────────────────────

export interface AnalyzeBatchRequest {
  orgId: string;
  events: RawEvent[];
}

export interface AnalyzeBatchResponse {
  anomalies: DetectedAnomaly[];
  processedCount: number;
}

export interface DetectedAnomaly {
  orgId: string;
  rawEventIds: string[];
  title: string;
  severity: IncidentSeverity;
  affectedServices: string[];
  initialContext: Record<string, unknown>;
  score: number;
}

export type IncidentSeverity = "critical" | "high" | "medium" | "low";