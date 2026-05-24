import type { RawEvent } from "@operonai/types";
import type { Logger } from "@operonai/lib";

export interface BufferOptions {
  maxSize: number;
  flushIntervalMs: number;
  onFlush: (events: RawEvent[]) => Promise<void>;
  logger: Logger;
}

export const createBuffer = (opts: BufferOptions) => {
  const { maxSize, flushIntervalMs, onFlush, logger } = opts;

  let events: RawEvent[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const flush = async (): Promise<void> => {
    const batch = events;
    events = [];
    logger.debug({ count: batch.length }, "Flushing event buffer");

    try {
      await onFlush(batch);
    } catch (error) {
      logger.error(
        { error, count: batch.length },
        "Buffer flush failed, events droped"
      );
    }
  };

  const push = (event: RawEvent): void => {
    events.push(event);

    if (events.length >= maxSize) {
      flush().catch((err) => {
        logger.error({ err }, "Unexpected error during size triggered flush");
      });
    }
  };

  const start = (): void => {
    flushTimer = setInterval(() => {
      flush().catch((err) => {
        logger.error({ err }, "unexpected error during interval flush");
      });
    }, flushIntervalMs);

    flushTimer.unref();
  };

  const stop = async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }

    await flush();
  };

  return { push, flush, start, stop };
};
export type Buffer = ReturnType<typeof createBuffer>;
