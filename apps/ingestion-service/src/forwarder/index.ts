import { createHttpClient, type Logger, type HttpClient } from "@operonai/lib";
import type {
  RawEvent,
  AnalyzeBatchRequest,
  AnalyzeBatchResponse,
} from "@operonai/types";
import {
  insertRawEvents,
  type Database,
  type NewRawEventRow,
} from "@operonai/db";
import { config } from "../config";

export interface ForwarderOptions {
  db: Database;
  logger: Logger;
}

const groupByOrg = (events: RawEvent[]): Record<string, RawEvent[]> =>
  events.reduce<Record<string, RawEvent[]>>((acc, event) => {
    if (!acc[event.orgId]) acc[event.orgId] = [];
    acc[event.orgId].push(event);
    return acc;
  }, {});

export const createForwarder = (opts: ForwarderOptions) => {
  const { db, logger } = opts;

  const anomalyClient: HttpClient = createHttpClient({
    baseUrl: config.anomalyService.url,
    timeoutMs: config.anomalyService.timeoutMs,
    serviceName: "anomaly-service",
  });

  const persistEvents = async (events: RawEvent[]): Promise<void> => {
    try {
      const rows: NewRawEventRow[] = events.map((e) => ({
        id: e.id,
        orgId: e.orgId,
        source: e.source,
        sourceType: e.sourceType,
        normalizedType: e.normalizedType,
        payload: e.payload,
        metadata: e.metadata,
        anomalyScore: e.anomalyScore,
        receivedAt: e.receivedAt,
      }));
      await insertRawEvents(db, rows);
      logger.debug({ count: events.length }, "raw events persisted to db");
    } catch (error) {
      logger.error(
        { error, count: events.length },
        "failed to persist raw events"
      );
    }
  };

  const analyzeEvents = async (events: RawEvent[]): Promise<void> => {
    const byOrg = groupByOrg(events);

    for (const [orgId, orgEvents] of Object.entries(byOrg)) {
      try {
        const body: AnalyzeBatchRequest = { orgId, events: orgEvents };

        await anomalyClient.post<AnalyzeBatchResponse>("/analyze", body);

        logger.info(
          { orgId, count: orgEvents.length },
          "batch forwarded to anomaly"
        );
      } catch (error) {
        logger.warn(
          { error, count: orgEvents.length },
          "anomaly-service unreachable, skipping analysis"
        );
      }
    }
  };

  const forwardBatch = async (events: RawEvent[]): Promise<void> => {
    await Promise.allSettled([persistEvents(events), analyzeEvents(events)]);
  };

  return { forwardBatch };
};

export type Forwarder = ReturnType<typeof createForwarder>;
