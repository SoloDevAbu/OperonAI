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
  
  export const approvalRequests = pgTable(
    "approval_requests",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
      incidentId: uuid("incident_id")
        .notNull()
        .references(() => incidents.id, { onDelete: "cascade" }),
  
      // restart_worker | clear_failed_jobs | rollback_deployment | etc
      actionType: text("action_type").notNull(),
      actionDescription: text("action_description").notNull(),
  
      // Full payload that will be passed to the tool on approval
      actionPayload: jsonb("action_payload")
        .notNull()
        .$type<Record<string, unknown>>(),
  
      // pending | approved | rejected | timed_out
      status: text("status").notNull().default("pending"),
  
      rejectionReason: text("rejection_reason"),
  
      requestedAt: timestamp("requested_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      decidedAt: timestamp("decided_at", { withTimezone: true }),
  
      // Job will be auto-resumed or timed out after this
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    },
    (t) => ({
      incidentIdIdx: index("approval_requests_incident_id_idx").on(t.incidentId),
      statusIdx: index("approval_requests_status_idx").on(t.status),
      // For dashboard: pending approvals per org
      orgStatusIdx: index("approval_requests_org_status_idx").on(
        t.orgId,
        t.status
      ),
    })
  );
  
  export type ApprovalRequestRow = typeof approvalRequests.$inferSelect;
  export type NewApprovalRequestRow = typeof approvalRequests.$inferInsert;