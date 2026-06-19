from pydantic import BaseModel, Field;
from typing import Any
from enum import Enum

class SourceType(str, Enum):
    APP_LOGS = 'app_logs'
    POSTGRES = "postgres"
    BULLMQ = "bullmq"

class NormalizedEventType(str, Enum):
    LOG_ERROR = "log.error"
    LOG_WARN = "log.warn"
    LOG_INFO = "log.info"
    POSTGRES_SLOW_QUERY = "postgres.slow_query"
    POSTGRES_CONNECTION_POOL = "postgres.connection_pool_exhausted"
    POSTGRES_DEADLOCK = "postgres.deadlock"
    BULLMQ_JOB_FAILED = "bullmq.job_failed"
    BULLMQ_QUEUE_DEPTH_HIGH = "bullmq.queue_depth_high"
    BULLMQ_WORKER_STALLED = "bullmq.worker_stalled"
    BULLMQ_WORKER_CRASHED = "bullmq.worker_crashed"


class IncidentSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class RawEventMetadata(BaseModel):
    host: str | None = None
    service: str | None = None
    environment: str | None = None
    region: str | None = None
    # Allow extra fields from different sources
    model_config = {"extra": "allow"}


class RawEvent(BaseModel):
    id: str
    org_id: str = Field(alias="orgId")
    source: str
    source_type: SourceType = Field(alias="sourceType")
    normalized_type: NormalizedEventType = Field(alias="normalizedType")
    payload: dict[str, Any]
    metadata: dict[str, Any]
    anomaly_score: float | None = Field(None, alias="anomalyScore")
    received_at: str = Field(alias="receivedAt")

    model_config = {"populate_by_name": True}


# ─── Request / Response ───────────────────────────────────────────────────────

class AnalyzeBatchRequest(BaseModel):
    org_id: str = Field(alias="orgId")
    events: list[RawEvent]

    model_config = {"populate_by_name": True}


class DetectedAnomaly(BaseModel):
    org_id: str = Field(alias="orgId")
    raw_event_ids: list[str] = Field(alias="rawEventIds")
    title: str
    severity: IncidentSeverity
    affected_services: list[str] = Field(alias="affectedServices")
    initial_context: dict[str, Any] = Field(alias="initialContext")
    score: float

    model_config = {"populate_by_name": True}


class AnalyzeBatchResponse(BaseModel):
    anomalies: list[DetectedAnomaly]
    processed_count: int = Field(alias="processedCount")

    model_config = {"populate_by_name": True}

class ScoredEvent(BaseModel):
    event: RawEvent
    rule_score: float = 0.0
    ml_score: float = 0.0
    combined_score: float = 0.0
    triggered_rules: list[str] = []
