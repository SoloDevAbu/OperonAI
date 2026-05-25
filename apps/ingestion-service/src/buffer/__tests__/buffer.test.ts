import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createBuffer } from "../index";
import type { RawEvent } from "@operonai/types";
import type { Logger } from "@operonai/lib";

describe("Buffer", () => {
  let mockLogger: Logger;
  let onFlushMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    onFlushMock = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should push events and flush when reaching maxSize", async () => {
    const buffer = createBuffer({
      maxSize: 3,
      flushIntervalMs: 10000,
      onFlush: onFlushMock,
      logger: mockLogger,
    });

    const event1 = { id: "1" } as RawEvent;
    const event2 = { id: "2" } as RawEvent;
    const event3 = { id: "3" } as RawEvent;

    buffer.push(event1);
    buffer.push(event2);
    expect(onFlushMock).not.toHaveBeenCalled();

    buffer.push(event3);
    // Wait for the async flush call inside push to settle
    await vi.runAllTicks();

    expect(onFlushMock).toHaveBeenCalledTimes(1);
    expect(onFlushMock).toHaveBeenCalledWith([event1, event2, event3]);
  });

  it("should flush periodically based on interval", async () => {
    const buffer = createBuffer({
      maxSize: 10,
      flushIntervalMs: 5000,
      onFlush: onFlushMock,
      logger: mockLogger,
    });

    buffer.start();

    const event1 = { id: "1" } as RawEvent;
    buffer.push(event1);

    // Advance time close to interval but not quite
    await vi.advanceTimersByTimeAsync(4000);
    expect(onFlushMock).not.toHaveBeenCalled();

    // Advance beyond interval
    await vi.advanceTimersByTimeAsync(1500);
    expect(onFlushMock).toHaveBeenCalledTimes(1);
    expect(onFlushMock).toHaveBeenCalledWith([event1]);

    await buffer.stop();
  });

  it("should handle onFlush errors gracefully without throwing", async () => {
    const failedFlush = vi
      .fn()
      .mockRejectedValue(new Error("Database offline"));
    const buffer = createBuffer({
      maxSize: 1,
      flushIntervalMs: 5000,
      onFlush: failedFlush,
      logger: mockLogger,
    });

    const event = { id: "1" } as RawEvent;

    // Pushing event triggers flush immediately since maxSize is 1
    buffer.push(event);
    await vi.runAllTicks();

    expect(failedFlush).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
      expect.stringContaining("Buffer flush failed")
    );
  });

  it("should flush remaining events and clear timer on stop", async () => {
    const buffer = createBuffer({
      maxSize: 10,
      flushIntervalMs: 5000,
      onFlush: onFlushMock,
      logger: mockLogger,
    });

    buffer.start();

    const event1 = { id: "1" } as RawEvent;
    buffer.push(event1);

    await buffer.stop();

    expect(onFlushMock).toHaveBeenCalledTimes(1);
    expect(onFlushMock).toHaveBeenCalledWith([event1]);

    // Verify timer is cleared by advancing time and seeing no further calls
    await vi.advanceTimersByTimeAsync(10000);
    expect(onFlushMock).toHaveBeenCalledTimes(1);
  });
});
