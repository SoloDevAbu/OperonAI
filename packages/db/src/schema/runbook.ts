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
  
  const vector = customType<{ data: number[]; driverData: string }>({
    dataType(config) {
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
  
  export const runbooks = pgTable(
    "runbooks",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
  
      title: text("title").notNull(),
      content: text("content").notNull(),
  
      // Vector embedding of title + content — used for similarity search
      embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  
      tags: jsonb("tags").notNull().$type<string[]>().default([]),
  
      // manual | imported | generated
      sourceType: text("source_type").notNull().default("manual"),
  
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      orgIdIdx: index("runbooks_org_id_idx").on(t.orgId),
      // HNSW vector index created in migration SQL
    })
  );
  
  export type RunbookRow = typeof runbooks.$inferSelect;
  export type NewRunbookRow = typeof runbooks.$inferInsert;