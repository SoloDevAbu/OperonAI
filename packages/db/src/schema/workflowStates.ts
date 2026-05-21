import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    index,
  } from "drizzle-orm/pg-core";
  import { organizations } from "./organization";
  import { incidents } from "./incidents.js";
  
  export const workflowStates = pgTable(
    "workflow_states",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
      incidentId: uuid("incident_id")
        .notNull()
        .references(() => incidents.id, { onDelete: "cascade" }),
  
      currentState: text("current_state").notNull(),
      previousState: text("previous_state"),
  
      // Context about why this transition happened
      stateData: jsonb("state_data")
        .notNull()
        .$type<Record<string, unknown>>()
        .default({}),
  
      transitionedAt: timestamp("transitioned_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      incidentIdIdx: index("workflow_states_incident_id_idx").on(t.incidentId),
      transitionedAtIdx: index("workflow_states_transitioned_at_idx").on(
        t.transitionedAt
      ),
    })
  );
  
  export type WorkflowStateRow = typeof workflowStates.$inferSelect;
  export type NewWorkflowStateRow = typeof workflowStates.$inferInsert;