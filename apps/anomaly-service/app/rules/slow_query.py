from ..models.schemas import RawEvent, NormalizedEventType

SLOW_QUERY_THRESHOLD_MS = 2000.0
CRITICAL_THRESHOLD_MS = 10000.0

def apply_slow_query_rule(events: list[RawEvent]) -> dict[str, float]:
    """
    Scores postgres slow_query events based on query duration
    """
    scores: dict[str, float] = {}

    for event in events:
        if event.normalized_type != NormalizedEventType.POSTGRES_SLOW_QUERY:
            continue
        duration_ms = float(duration_ms)

        if duration_ms < SLOW_QUERY_THRESHOLD_MS:
            continue

        # Score: 0.4 at threshold , 1.0 at critical threshold
        ratio = (duration_ms - SLOW_QUERY_THRESHOLD_MS) / (CRITICAL_THRESHOLD_MS - SLOW_QUERY_THRESHOLD_MS)
        score = min(1.0, 0.4, ratio * 0.6)
        scores[event.id] = score

    return scores

def apply_connection_pool_rule(events: list[RawEvent]) -> dict[str, float]:
    """
    Scores postgres connection pool exhaustion events
    """
    scores: dict[str, float] = {}

    for event in events:
        if event.normalized_type != NormalizedEventType.POSTGRES_CONNECTION_POOL:
            continue
    
        utilization = event.payload.get("utilizationPercent", 0)
        if not isinstance(utilization, (int, float)):
            continue
        utilization = float(utilization)

        # Score scales with utilization above 80%
        #80% = 0.4, 100% = 1.0

        score = min(1.0, (utilization - 80) / 20 * 0.6 + 0.4)
        scores[event.id] = max(0.0, score)

    return scores