import { Context } from "hono";
import { createRedisClient } from "@operonai/lib";
import type { Logger } from "@operonai/lib";

type Writer = (data: string) => void;

const connections = new Map<string, Set<Writer>>();

const pubClient = createRedisClient();
const subClient = createRedisClient();

subClient.on("message", (channel, message) => {
  const writers = connections.get(channel);
  if (!writers || writers.size === 0) return;

  // The message is expected to be a JSON string of { event, data }
  try {
    const parsed = JSON.parse(message);
    const payload = `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`;

    for (const write of writers) {
      try {
        write(payload);
      } catch (error) {
        // Automatically cleanup broken writers
        writers.delete(write);
      }
    }
  } catch (error) {
    // Ignore invalid messages
  }
});

const register = (channel: string, writer: Writer, logger?: Logger): void => {
  if (!connections.has(channel)) {
    connections.set(channel, new Set());
    subClient.subscribe(channel).catch((err) => {
      logger?.error({ err, channel }, "Failed to subscribe to Redis channel");
    });
  }

  connections.get(channel)!.add(writer);
  logger?.debug(
    { channel, activeConnections: connections.get(channel)?.size },
    "SSE client connected"
  );
};

const unregister = (channel: string, writer: Writer, logger?: Logger): void => {
  const writers = connections.get(channel);
  if (writers) {
    writers.delete(writer);
    logger?.debug(
      { channel, activeConnections: writers.size },
      "SSE client disconnected"
    );
    if (writers.size === 0) {
      connections.delete(channel);
      subClient.unsubscribe(channel).catch(() => {});
    }
  }
};

export const publish = (
  channel: string,
  event: string,
  data: unknown,
  logger?: Logger
): void => {
  const message = JSON.stringify({ event, data });
  pubClient.publish(channel, message).catch((err) => {
    logger?.error(
      { err, channel, event },
      "Failed to publish SSE event to Redis"
    );
  });
};

export const createSSEStream = (c: Context, channel: string): Response => {
  let write: Writer;
  const logger = c.get("logger") as Logger | undefined;

  const stream = new ReadableStream({
    start(controller) {
      write = (data: string) => {
        controller.enqueue(new TextEncoder().encode(data));
      };

      register(channel, write, logger);

      controller.enqueue(
        new TextEncoder().encode(
          `event: connected\ndata: {"channel":"${channel}"}\n\n`
        )
      );
    },
    cancel() {
      unregister(channel, write, logger);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", //diable ngnix buffering for SSE
    },
  });
};
