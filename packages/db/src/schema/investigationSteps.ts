import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    integer,
    index,
  } from "drizzle-orm/pg-core";
  import { organizations } from "./organization";
  import { incidents } from "./incidents.js";
  
  export const investigationSteps = pgTable(
    "investigation_steps",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
      incidentId: uuid("incident_id")
        .notNull()
        .references(() => incidents.id, { onDelete: "cascade" }),
  
      // Step ordering — used for crash recovery context reconstruction
      stepNumber: integer("step_number").notNull(),
  
      // tool_call | reasoning | conclusion
      stepType: text("step_type").notNull(),
  
      // Null for reasoning/conclusion steps
      toolName: text("tool_name"),
      toolInput: jsonb("tool_input").$type<Record<string, unknown>>(),
      toolOutput: jsonb("tool_output").$type<Record<string, unknown>>(),
  
      // The agent's reasoning text at this step
      agentReasoning: text("agent_reasoning").notNull(),
  
      // Observability
      tokensUsed: integer("tokens_used"),
      durationMs: integer("duration_ms"),
  
      executedAt: timestamp("executed_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      incidentIdIdx: index("investigation_steps_incident_id_idx").on(
        t.incidentId
      ),
      // For crash recovery: load all steps for an incident ordered by step number
      incidentStepIdx: index("investigation_steps_incident_step_idx").on(
        t.incidentId,
        t.stepNumber
      ),
    })
  );
  
  export type InvestigationStepRow = typeof investigationSteps.$inferSelect;
  export type NewInvestigationStepRow = typeof investigationSteps.$inferInsert;