// ─── Tool definition ─────────────────────────────────────────────────────────

export interface ToolDefinition {
    name: string;
    description: string;
    requiresApproval: boolean;
  }
  
  // ─── Tool execution context ───────────────────────────────────────────────────
  
  export interface ToolContext {
    orgId: string;
    incidentId: string;
    stepNumber: number;
  }
  
  // ─── Tool result ──────────────────────────────────────────────────────────────
  
  export interface ToolResult<T = unknown> {
    success: boolean;
    data: T | null;
    error: string | null;
    durationMs: number;
  }
  
  // ─── Individual tool input/output types ──────────────────────────────────────
  
  export interface FetchLogsInput {
    service: string;
    timeRangeMs: number;
    level?: "error" | "warn" | "info";
    limit?: number;
  }
  
  export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    service: string;
    fields: Record<string, unknown>;
  }
  
  export interface GetSlowQueriesInput {
    thresholdMs: number;
    limit?: number;
    timeRangeMs?: number;
  }
  
  export interface SlowQuery {
    query: string;
    durationMs: number;
    timestamp: string;
    database: string;
  }
  
  export interface GetQueueStatsInput {
    queueName: string;
  }
  
  export interface QueueStats {
    queueName: string;
    active: number;
    waiting: number;
    failed: number;
    delayed: number;
    completed: number;
    paused: boolean;
  }
  
  export interface RedisHealthReport {
    connected: boolean;
    memoryUsedMb: number;
    connectedClients: number;
    uptimeSeconds: number;
    version: string;
  }
  
  export interface ConnectionPoolStats {
    total: number;
    idle: number;
    waiting: number;
    max: number;
    utilizationPercent: number;
  }
  
  export interface Deployment {
    id: string;
    service: string;
    version: string;
    status: "success" | "failed" | "rolled_back";
    deployedAt: string;
    deployedBy: string;
    commitHash: string | null;
  }
  
  export interface GetDeploymentsInput {
    service?: string;
    limit?: number;
  }
  
  export interface RestartWorkerInput {
    workerName: string;
    reason: string;
  }
  
  export interface RestartWorkerResult {
    success: boolean;
    workerName: string;
    previousPid: number | null;
    newPid: number | null;
  }
  
  export interface ClearFailedJobsInput {
    queueName: string;
    limit?: number;
  }
  
  export interface ClearFailedJobsResult {
    clearedCount: number;
    queueName: string;
  }