import type { Logger, IORedis } from "@operonai/lib";
import type { RawEvent } from "@operonai/types";
import type { Buffer } from "../buffer";

export interface BullMQPollerOptions {
  redis: IORedis;
  buffer: Buffer;
  logger: Logger;
  intervalMs?: number;
  queueDepthThreshold?: number;
  queues?: string[];
}

export const createBullMQPoller = (opts: BullMQPollerOptions) => {
  const {
    redis,
    buffer,
    logger,
    intervalMs = 15_000,
    queueDepthThreshold = Number(
      process.env.ANOMALY_QUEUE_DEPTH_THRESHOLD ?? 1000
    ),
    queues = ["investigations", "notifications", "emails"],
  } = opts;

  let timer: NodeJS.Timeout | null = null;

  const pollQueue = async (queueName: string): Promise<void> => {
    try {
      const [waiting, active, failed, delayed, paused] = await Promise.all([
        redis.llen(`bull:${queueName}:wait`),
        redis.llen(`bull:${queueName}:active`),
        redis.zcard(`bull:${queueName}:failed`),
        redis.zcard(`bull:${queueName}:delayed`),
        redis.hexists(`bull:${queueName}:meta`, "paused"),
      ]);

      const totalDepth = waiting + active + delayed;

      if (totalDepth > queueDepthThreshold) {
        const event: RawEvent = {
          id: crypto.randomUUID(),
          orgId: "system",
          source: `bullmq:${queueName}`,
          sourceType: "bullmq",
          normalizedType: "bullmq.queue_depth_high",
          payload: {
            queueName,
            waiting,
            active,
            failed,
            delayed,
            totalDepth,
            isPaused: paused === 1,
          },
          metadata: {
            threshold: queueDepthThreshold,
            source: "bullmq-poller",
          },
          anomalyScore: null,
          receivedAt: new Date(),
        };

        buffer.push(event);
      }

      const failedThreshold = Math.max(50, totalDepth * 0.1);
      if (failed > failedThreshold) {
        const event: RawEvent = {
          id: crypto.randomUUID(),
          orgId: "system",
          source: `bullmq:${queueName}`,
          sourceType: "bullmq",
          normalizedType: "bullmq.job_failed",
          payload: {
            queueName,
            failedCount: failed,
            waiting,
            active,
            delayed,
          },
          metadata: {
            failedThreshold,
            source: "bullmq-poller",
          },
          anomalyScore: null,
          receivedAt: new Date(),
        };

        buffer.push(event);
      }
    } catch (err) {
      logger.error({ err, queueName }, "bullmq queue poll failed");
    }
  };
  const poll = async (): Promise<void> => {
    await Promise.allSettled(queues.map(pollQueue));
  };

  const start = (): void => {
    poll().catch((err) => logger.error({ err }, "initial bullmq poll failed"));

    timer = setInterval(() => {
      poll().catch((err) => logger.error({ err }, "bullmq poll failed"));
    }, intervalMs);

    timer.unref();
    logger.info({ intervalMs, queues }, "bullmq poller started");
  };

  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    logger.info("bullmq poller stopped");
  };

  return { start, stop, poll };
};
