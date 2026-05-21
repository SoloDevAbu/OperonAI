import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    real,
    index,
  } from "drizzle-orm/pg-core";
  import { organizations } from "./organization";
  
  export const rawEvents = pgTable(
    "raw_events",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
      source: text("source").notNull(),
      sourceType: text("source_type").notNull(),
      normalizedType: text("normalized_type").notNull(),
      payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
      metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>(),
      // Score assigned by anomaly-service. Null = not yet scored
      anomalyScore: real("anomaly_score"),
      receivedAt: timestamp("received_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      orgIdIdx: index("raw_events_org_id_idx").on(t.orgId),
      receivedAtIdx: index("raw_events_received_at_idx").on(t.receivedAt),
      sourceTypeIdx: index("raw_events_source_type_idx").on(t.sourceType),
      normalizedTypeIdx: index("raw_events_normalized_type_idx").on(
        t.normalizedType
      ),
    })
  );
  
  export type RawEventRow = typeof rawEvents.$inferSelect;
  export type NewRawEventRow = typeof rawEvents.$inferInsert;