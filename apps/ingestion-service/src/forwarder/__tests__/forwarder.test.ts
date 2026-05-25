import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { RawEvent } from "@operonai/types";
import type { Database } from "@operonai/db";
import type { Logger } from "@operonai/lib";

// Mock the external libraries first before importing the code under test
vi.mock("@operonai/db", () => ({
  insertRawEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@operonai/lib", () => {
  const postSpy = vi.fn().mockResolvedValue({ status: 200, data: { success: true } });
  return {
    createHttpClient: vi.fn().mockReturnValue({
      post: postSpy,
    }),
    createLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  };
});

// Import dependencies and SUT
import { insertRawEvents } from "@operonai/db";
import { createHttpClient } from "@operonai/lib";
import { createForwarder } from "../index";

describe("Forwarder", () => {
  let mockDb: Database;
  let mockLogger: Logger;

  beforeEach(() => {
    mockDb = {} as Database;
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    vi.clearAllMocks();
    const mockHttpClient = createHttpClient({} as any);
    (mockHttpClient.post as any).mockResolvedValue({ success: true });
  });

  it("should persist events to DB and forward them to anomaly service grouped by orgId", async () => {
    const mockPost = createHttpClient({} as any).post;
    const forwarder = createForwarder({
      db: mockDb,
      logger: mockLogger,
    });

    const events: RawEvent[] = [
      {
        id: "event-1",
        orgId: "org-A",
        source: "service-1",
        sourceType: "app_logs",
        normalizedType: "log.info",
        payload: { message: "ok" },
        metadata: {},
        anomalyScore: null,
        receivedAt: new Date(),
      },
      {
        id: "event-2",
        orgId: "org-B",
        source: "service-2",
        sourceType: "app_logs",
        normalizedType: "log.info",
        payload: { message: "ready" },
        metadata: {},
        anomalyScore: null,
        receivedAt: new Date(),
      },
      {
        id: "event-3",
        orgId: "org-A",
        source: "service-1",
        sourceType: "app_logs",
        normalizedType: "log.error",
        payload: { message: "fail" },
        metadata: {},
        anomalyScore: null,
        receivedAt: new Date(),
      },
    ];

    await forwarder.forwardBatch(events);

    // 1. Verify DB persistence was called with all mapped events
    expect(insertRawEvents).toHaveBeenCalledTimes(1);
    expect(insertRawEvents).toHaveBeenCalledWith(
      mockDb,
      events.map((e) => ({
        id: e.id,
        orgId: e.orgId,
        source: e.source,
        sourceType: e.sourceType,
        normalizedType: e.normalizedType,
        payload: e.payload,
        metadata: e.metadata,
        anomalyScore: e.anomalyScore,
        receivedAt: e.receivedAt,
      }))
    );

    // 2. Verify Anomaly service is posted to once for each unique orgId (org-A and org-B)
    expect(mockPost).toHaveBeenCalledTimes(2);

    // Assert on payload contents for org-A
    expect(mockPost).toHaveBeenCalledWith("/analyze", {
      orgId: "org-A",
      events: [events[0], events[2]],
    });

    // Assert on payload contents for org-B
    expect(mockPost).toHaveBeenCalledWith("/analyze", {
      orgId: "org-B",
      events: [events[1]],
    });

    // Verify debug logging of successful database save
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { count: 3 },
      "raw events persisted to db"
    );
  });

  it("should handle database persistence failures gracefully without failing the anomaly forward", async () => {
    const mockPost = createHttpClient({} as any).post;
    vi.mocked(insertRawEvents).mockRejectedValueOnce(new Error("DB Timeout"));

    const forwarder = createForwarder({
      db: mockDb,
      logger: mockLogger,
    });

    const events: RawEvent[] = [
      {
        id: "event-1",
        orgId: "org-A",
        source: "service-1",
        sourceType: "app_logs",
        normalizedType: "log.info",
        payload: { message: "ok" },
        metadata: {},
        anomalyScore: null,
        receivedAt: new Date(),
      },
    ];

    await forwarder.forwardBatch(events);

    // DB insertion should have been attempted and errored out
    expect(insertRawEvents).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
      "failed to persist raw events"
    );

    // Anomaly forward should still succeed
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("should handle anomaly service failures gracefully without failing database persistence", async () => {
    const mockPost = createHttpClient({} as any).post;
    (mockPost as any).mockRejectedValueOnce(new Error("Gateway Timeout"));

    const forwarder = createForwarder({
      db: mockDb,
      logger: mockLogger,
    });

    const events: RawEvent[] = [
      {
        id: "event-1",
        orgId: "org-A",
        source: "service-1",
        sourceType: "app_logs",
        normalizedType: "log.info",
        payload: { message: "ok" },
        metadata: {},
        anomalyScore: null,
        receivedAt: new Date(),
      },
    ];

    await forwarder.forwardBatch(events);

    // DB persistence should succeed
    expect(insertRawEvents).toHaveBeenCalledTimes(1);

    // Anomaly forward should have failed and been logged as a warning
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
      "anomaly-service unreachable, skipping analysis"
    );
  });
});
