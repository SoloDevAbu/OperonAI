import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    index,
    customType,
  } from "drizzle-orm/pg-core";
  import { organizations } from "./organization";
  import { incidents } from "./incidents.js";
  
  // ─── pgvector custom type ─────────────────────────────────────────────────────
  // Drizzle doesn't have native pgvector support yet.
  // We define a custom type that maps to the vector column.
  
  const vector = customType<{ data: number[]; driverData: string }>({
    dataType(config) {
      // 1536 = OpenAI ada-002 dimensions
      // 1024 = Anthropic voyage-3 dimensions (recommended with Claude)
      const dimensions = (config as { dimensions?: number })?.dimensions ?? 1024;
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(",")
        .map(Number);
    },
  });
  
  // ─── Incident memory ──────────────────────────────────────────────────────────
  // Stores a summary + embedding of each resolved incident.
  // Used by the agent to retrieve similar past incidents before investigating.
  
  export const incidentMemory = pgTable(
    "incident_memory",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
      incidentId: uuid("incident_id")
        .notNull()
        .references(() => incidents.id, { onDelete: "cascade" })
        .unique(),
  
      // Human-readable summary of what happened and how it was resolved
      summary: text("summary").notNull(),
  
      // Vector embedding of the summary — used for similarity search
      embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  
      tags: jsonb("tags").notNull().$type<string[]>().default([]),
      metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>().default({}),
  
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      orgIdIdx: index("incident_memory_org_id_idx").on(t.orgId),
      // Note: the cosine similarity index on embedding is created in the
      // migration SQL directly since Drizzle doesn't support HNSW index syntax
      // See: migrations/0001_add_vector_indexes.sql
    })
  );
  
  export type IncidentMemoryRow = typeof incidentMemory.$inferSelect;
  export type NewIncidentMemoryRow = typeof incidentMemory.$inferInsert;