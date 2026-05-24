export const ingestLogBodySchema = {
  type: "object",
  required: ["source", "level", "message", "timestamp"],
  additionalProperties: false,
  properties: {
    source: { type: "string", minLength: 1 },
    level: { type: "string", enum: ["error", "warn", "info", "debug"] },
    message: { type: "string", minLength: 1 },
    timestamp: { type: "string", format: "date-time" },
    service: { type: "string" },
    host: { type: "string" },
    fields: { type: "object", additionalProperties: true },
  },
} as const
