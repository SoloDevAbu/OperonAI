export const ingestEventBodySchema = {
  type: "object",
  required: ["source", "type", "timestamp", "data"],
  additionalProperties: false,
  properties: {
    source: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
    timestamp: { type: "string", format: "date-time" },
    data: { type: "object", additionalProperties: true },
    metadata: { type: "object", additionalProperties: true },
  },
} as const

export const ingestEventsBulkBodySchema = {
  type: "object",
  required: ["events"],
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: ingestEventBodySchema,
    },
  },
} as const
