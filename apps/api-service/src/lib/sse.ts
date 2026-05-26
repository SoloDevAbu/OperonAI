import { Context } from "hono";

type Writer = (data: string) => void;

const connections = new Map<string, Set<Writer>>();

const register = (channel: string, writer: Writer): void => {
  if (!connections.has(channel)) {
    connections.set(channel, new Set());
  }

  connections.get(channel)!.add(writer);
};

const unregister = (channel: string, writer: Writer): void => {
  connections.get(channel)?.delete(writer);
  if (connections.get(channel)?.size === 0) {
    connections.delete(channel);
  }
};

export const publish = (
  channel: string,
  event: string,
  data: unknown
): void => {
  const writer = connections.get(channel);

  if (!writer || writer.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const write of writer) {
    try {
      write(payload);
    } catch (error) {}
  }
};

export const createSSEStream = (c: Context, channel: string): Response => {
  let write: Writer;

  const stream = new ReadableStream({
    start(controller) {
      write = (data: string) => {
        controller.enqueue(new TextEncoder().encode(data));
      };

      register(channel, write);

      //send initial connection
      controller.enqueue(
        new TextEncoder().encode(
          `event: connceted\ndata: {"channel":${channel}}\n\n`
        )
      );
    },
    cancel() {
      unregister(channel, write);
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
