import { describe, it, expect } from "vitest";
import { normalizeLog, normalizeEvent } from "../index";
import type { IngestLogPayload, IngestEventPayload } from "@operonai/types";
import { config } from "../../config";

describe("Normalizers", () => {
  const orgId = "org_123";

  describe("normalizeLog", () => {
    it("should normalize log payloads with info level", () => {
      const payload: IngestLogPayload = {
        source: "web-server",
        level: "info",
        message: "Server started",
        timestamp: String(new Date("2026-05-25T12:00:00Z")),
        service: "frontend",
        host: "host-1",
        fields: { route: "/home" },
      };

      const result = normalizeLog(orgId, payload);

      expect(result).toEqual({
        orgId,
        source: "web-server",
        sourceType: "app_logs",
        normalizedType: "log.info",
        payload: {
          level: "info",
          message: "Server started",
          timestamp: payload.timestamp,
          route: "/home",
        },
        metadata: {
          service: "frontend",
          host: "host-1",
          environment: config.nodeEnv,
        },
      });
    });

    it("should map error level to log.error type", () => {
      const payload: IngestLogPayload = {
        source: "database",
        level: "error",
        message: "Connection failed",
        timestamp: String(new Date()),
        service: "db-worker",
      };

      const result = normalizeLog(orgId, payload);
      expect(result.normalizedType).toBe("log.error");
    });

    it("should map warn level to log.warn type", () => {
      const payload: IngestLogPayload = {
        source: "auth",
        level: "warn",
        message: "Invalid login attempt",
        timestamp: String(new Date()),
        service: "auth-service",
      };

      const result = normalizeLog(orgId, payload);
      expect(result.normalizedType).toBe("log.warn");
    });
  });

  describe("normalizeEvent", () => {
    it("should resolve postgres source types and slow query event type", () => {
      const payload: IngestEventPayload = {
        source: "db-prod",
        type: "postgres.slow_query",
        timestamp: String(new Date()),
        data: { query: "SELECT * FROM users", durationMs: 2500 },
        metadata: { region: "us-east-1" },
      };

      const result = normalizeEvent(orgId, payload);

      expect(result).toEqual({
        orgId,
        source: "db-prod",
        sourceType: "postgres",
        normalizedType: "postgres.slow_query",
        payload: {
          query: "SELECT * FROM users",
          durationMs: 2500,
          timestamp: payload.timestamp,
        },
        metadata: {
          region: "us-east-1",
          environment: config.nodeEnv,
        },
      });
    });

    it("should resolve postgres deadlock and connection pool types correctly", () => {
      const deadlockPayload: IngestEventPayload = {
        source: "db-prod",
        type: "pg.deadlock",
        timestamp: String(new Date()),
        data: { transactionIds: [101, 102] },
      };
      expect(normalizeEvent(orgId, deadlockPayload).normalizedType).toBe(
        "postgres.deadlock"
      );

      const poolPayload: IngestEventPayload = {
        source: "db-prod",
        type: "postgres.connection_pool_error",
        timestamp: String(new Date()),
        data: { currentPoolSize: 100 },
      };
      expect(normalizeEvent(orgId, poolPayload).normalizedType).toBe(
        "postgres.connection_pool_exhausted"
      );
    });

    it("should resolve bullmq job_failed, queue_depth and worker stalled/crashed types correctly", () => {
      const failedPayload: IngestEventPayload = {
        source: "worker-1",
        type: "bullmq.job_failed",
        timestamp: String(new Date()),
        data: { jobId: "job_456", error: "OOM" },
      };
      expect(normalizeEvent(orgId, failedPayload).normalizedType).toBe(
        "bullmq.job_failed"
      );

      const depthPayload: IngestEventPayload = {
        source: "worker-1",
        type: "queue.queue_depth_exceeded",
        timestamp: String(new Date()),
        data: { depth: 1500 },
      };
      expect(normalizeEvent(orgId, depthPayload).normalizedType).toBe(
        "bullmq.queue_depth_high"
      );

      const stalledPayload: IngestEventPayload = {
        source: "worker-1",
        type: "bullmq.worker_stalled",
        timestamp: String(new Date()),
        data: { activeJobsCount: 5 },
      };
      expect(normalizeEvent(orgId, stalledPayload).normalizedType).toBe(
        "bullmq.worker_stalled"
      );

      const crashedPayload: IngestEventPayload = {
        source: "worker-1",
        type: "bullmq.worker_crashed",
        timestamp: String(new Date()),
        data: { exitCode: 137 },
      };
      expect(normalizeEvent(orgId, crashedPayload).normalizedType).toBe(
        "bullmq.worker_crashed"
      );
    });

    it("should fallback to app_logs normalizer if sourceType resolves to app_logs", () => {
      const unknownPayload: IngestEventPayload = {
        source: "custom-source",
        type: "custom.event",
        timestamp: String(new Date()),
        data: { message: "Hello" },
        metadata: { service: "custom-service" },
      };

      // Since custom.event doesn't start with pg. postgres. bullmq. queue.
      // it should fall back to app_logs (which internally casts data/metadata appropriately)
      const result = normalizeEvent(orgId, unknownPayload);
      expect(result.sourceType).toBe("app_logs");
    });
  });
});
