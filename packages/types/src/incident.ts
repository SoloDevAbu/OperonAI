import type { IncidentSeverity } from "./event.js";

// ─── Incident status / workflow states ────────────────────────────────────────

export type IncidentStatus =
  | "detected"
  | "queued"
  | "investigating"
  | "awaiting_approval"
  | "concluded"
  | "executing"
  | "documented"
  | "escalated";

// ─── Core incident ────────────────────────────────────────────────────────────

export interface Incident {
  id: string;
  orgId: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string;
  affectedServices: string[];
  initialContext: Record<string, unknown>;
  rawEventIds: string[];
  rootCause: string | null;
  confidenceScore: number | null;
  remediationOptions: RemediationOption[] | null;
  detectedAt: Date;
  resolvedAt: Date | null;
}

export interface RemediationOption {
  id: string;
  description: string;
  action: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel: "safe" | "moderate" | "destructive";
  requiresApproval: boolean;
}

// ─── Investigation step ───────────────────────────────────────────────────────

export type InvestigationStepType = "tool_call" | "reasoning" | "conclusion";

export interface InvestigationStep {
  id: string;
  orgId: string;
  incidentId: string;
  stepNumber: number;
  stepType: InvestigationStepType;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  agentReasoning: string;
  tokensUsed: number | null;
  durationMs: number | null;
  executedAt: Date;
}

// ─── Workflow state ───────────────────────────────────────────────────────────

export interface WorkflowState {
  id: string;
  orgId: string;
  incidentId: string;
  currentState: IncidentStatus;
  previousState: IncidentStatus | null;
  stateData: Record<string, unknown>;
  transitionedAt: Date;
}

// ─── Incident memory ──────────────────────────────────────────────────────────

export interface IncidentMemory {
  id: string;
  orgId: string;
  incidentId: string;
  summary: string;
  // embedding stored in pgvector, not returned in API responses
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}