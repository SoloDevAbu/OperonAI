import type { RawEvent } from "@operonai/types";
import type { Logger } from "@operonai/lib";
import type { Buffer } from "../buffer";
import { sql, type Database } from "@operonai/db";
import { config } from "../config";

export interface PostgresPollerOptions {
  db: Database;
  buffer: Buffer;
  logger: Logger;
  intervalMs?: number;
  slowQueryThresholdMs?: number;
}

export const createPostgresPoller = (opts: PostgresPollerOptions) => {
  const {
    db,
    buffer,
    logger,
    intervalMs = config.poller.postgresIntervalMs,
    slowQueryThresholdMs = config.poller.slowQueryThresholdMs,
  } = opts;

  let timer: NodeJS.Timeout | null = null;

  const pollSlowQueries = async (): Promise<void> => {
    try {
      // pg_stat_activity shows currently running queries
      // We look for queries running longer than the threshold
      const rows = await db.execute(sql`
        SELECT
          pid,
          usename,
          datname,
          state,
          wait_event_type,
          wait_event,
          query,
          EXTRACT(EPOCH FROM (now() - query_start)) * 1000 AS duration_ms,
          query_start
        FROM pg_stat_activity
        WHERE state = 'active'
          AND query_start IS NOT NULL
          AND query NOT ILIKE '%pg_stat_activity%'
          AND EXTRACT(EPOCH FROM (now() - query_start)) * 1000 > ${slowQueryThresholdMs}
        ORDER BY duration_ms DESC
        LIMIT 20
      `);

      for (const row of rows as Array<Record<string, unknown>>) {
        const event: RawEvent = {
          id: crypto.randomUUID(),
          orgId: "system", // pollers use system orgId — resolved to real orgs in anomaly service
          source: "postgres-poller",
          sourceType: "postgres",
          normalizedType: "postgres.slow_query",
          payload: {
            pid: row.pid,
            database: row.datname,
            query: (row.query as string)?.substring(0, 500), // truncate long queries
            durationMs: Number(row.duration_ms),
            waitEvent: row.wait_event,
            waitEventType: row.wait_event_type,
            queryStart: row.query_start,
          },
          metadata: {
            source: "pg_stat_activity",
            thresholdMs: slowQueryThresholdMs,
          },
          anomalyScore: null,
          receivedAt: new Date(),
        };

        buffer.push(event);
      }

      if ((rows as unknown[]).length > 0) {
        logger.debug(
          { count: (rows as unknown[]).length },
          "slow queries detected"
        );
      }
    } catch (err) {
      logger.error({ err }, "postgres slow query poll failed");
    }
  };
  const pollConnectionPool = async (): Promise<void> => {
    try {
      const rows = await db.execute(sql`
        SELECT
          datname,
          count(*) AS total_connections,
          count(*) FILTER (WHERE state = 'active') AS active,
          count(*) FILTER (WHERE state = 'idle') AS idle,
          count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_on_lock
        FROM pg_stat_activity
        WHERE datname IS NOT NULL
        GROUP BY datname
      `);

      for (const row of rows as Array<Record<string, unknown>>) {
        const total = Number(row.total_connections);
        const maxConnections = 100; // default pg max_connections — ideally read from pg_settings

        // Only emit an event if we're above 80% connection utilization
        if (total / maxConnections < 0.8) continue;

        const event: RawEvent = {
          id: crypto.randomUUID(),
          orgId: "system",
          source: "postgres-poller",
          sourceType: "postgres",
          normalizedType: "postgres.connection_pool_exhausted",
          payload: {
            database: row.datname,
            totalConnections: total,
            activeConnections: Number(row.active),
            idleConnections: Number(row.idle),
            waitingOnLock: Number(row.waiting_on_lock),
            utilizationPercent: Math.round((total / maxConnections) * 100),
          },
          metadata: {
            source: "pg_stat_activity",
            maxConnections,
          },
          anomalyScore: null,
          receivedAt: new Date(),
        };

        buffer.push(event);
      }
    } catch (err) {
      logger.error({ err }, "postgres connection pool poll failed");
    }
  };
  const poll = async (): Promise<void> => {
    await Promise.allSettled([pollSlowQueries(), pollConnectionPool()]);
  };

  const start = (): void => {
    timer = setInterval(() => {
      poll().catch((err) => logger.error({ err }, "postgres poll failed"));
    }, intervalMs);

    timer.unref();
    logger.info({ intervalMs }, "postgres poller started");
  };

  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    logger.info("postgres poller stopped");
  };

  return { start, stop, poll };
};
