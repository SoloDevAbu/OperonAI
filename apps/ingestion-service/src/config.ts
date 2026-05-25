const requireEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const config = {
  port: Number(process.env.INGESTION_PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",

  buffer: {
    maxSize: Number(process.env.INGESTION_BUFFER_MAX_SIZE ?? 100),
    flushIntervalMs: Number(
      process.env.INGESTION_BUFFER_FLUSH_INTERVAL_MS ?? 2000
    ),
  },

  anomalyService: {
    url: process.env.ANOMALY_SERVICE_URL ?? "http://anomaly-service:8000",
    timeoutMs: 5_000,
  },

  poller: {
    slowQueryThresholdMs: Number(
      process.env.ANOMALY_SLOW_QUERY_THRESHOLD_MS ?? 2000
    ),
    queueDepthThreshold: Number(
      process.env.ANOMALY_QUEUE_DEPTH_THRESHOLD ?? 1000
    ),
    postgresIntervalMs: 30_000,
    bullmqIntervalMs: 15_000,
    queues: ["investigations", "notifications", "emails"],
  },
} as const;
