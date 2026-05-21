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
  
  export const incidents = pgTable(
    "incidents",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
  
      // Workflow state — matches IncidentStatus in shared-types
      status: text("status").notNull().default("detected"),
  
      // critical | high | medium | low
      severity: text("severity").notNull(),
  
      title: text("title").notNull(),
  
      // JSON array of service names e.g. ["api-server", "worker"]
      affectedServices: jsonb("affected_services")
        .notNull()
        .$type<string[]>()
        .default([]),
  
      // The context available when the incident was first created
      // Contains the triggering anomaly details
      initialContext: jsonb("initial_context")
        .notNull()
        .$type<Record<string, unknown>>(),
  
      // IDs of RawEvents that triggered this incident
      rawEventIds: jsonb("raw_event_ids")
        .notNull()
        .$type<string[]>()
        .default([]),
  
      // Set by agent after investigation concludes
      rootCause: text("root_cause"),
      confidenceScore: real("confidence_score"),
  
      // Array of remediation options the agent generated
      remediationOptions: jsonb("remediation_options").$type<
        Array<{
          id: string;
          description: string;
          action: string;
          toolName: string;
          toolInput: Record<string, unknown>;
          riskLevel: "safe" | "moderate" | "destructive";
          requiresApproval: boolean;
        }>
      >(),
  
      detectedAt: timestamp("detected_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    },
    (t) => ({
      orgIdIdx: index("incidents_org_id_idx").on(t.orgId),
      statusIdx: index("incidents_status_idx").on(t.status),
      severityIdx: index("incidents_severity_idx").on(t.severity),
      detectedAtIdx: index("incidents_detected_at_idx").on(t.detectedAt),
      // Composite for the most common dashboard query
      orgStatusIdx: index("incidents_org_status_idx").on(t.orgId, t.status),
    })
  );
  
  export type IncidentRow = typeof incidents.$inferSelect;
  export type NewIncidentRow = typeof incidents.$inferInsert;