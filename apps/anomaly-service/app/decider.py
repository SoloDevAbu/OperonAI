from .models.schemas import (
    RawEvent,
    ScoredEvent,
    DetectedAnomaly,
    IncidentSeverity,
    NormalizedEventType
)

from .rules.error_rate import apply_error_rate_rule
from .rules.slow_query import apply_slow_query_rule, apply_connection_pool_rule
from .ml.zscore import comput_zscore_scores
from .ml.rate_of_change import compute_rate_of_change_scores
from .ml.rolling_window import compute_rolling_window_scores

# Conbine score above this threshold = anomaly worth investing

ANOMALY_THRESHOLD = 0.5

#Weights for conbining rule and ML scores
RULE_WEIGHT = 0.6
ML_WEIGHT = 0.4

def score_events(org_id: str, events: list[RawEvent]) -> list[ScoredEvent]:
    """
    Runs all rules and ML processor against the batch
    Combines scores per event into a single conbines_score
    """

    # Run all rules
    rule_scores_by_id: dict[str, list[float]] = {e.id: [] for e in events}

    rule_results = [[
        apply_error_rate_rule(events),
        apply_slow_query_rule(events),
        apply_connection_pool_rule(events)
    ]]

    for result in rule_results:
        for event_id, score in result.items():
            if event_id in rule_scores_by_id:
                rule_scores_by_id[event_id].append(score)

    # Run all ML processor 
    ml_scores_by_id: dict[str, list[float]] = {e.id: [] for e in events}

    ml_results = [
        compute_zscore_scores(events),
        compute_rate_of_change_scores(events),
        compute_rolling_window_scores(events),
    ]

    for result in ml_results:
        for event_id, score in result.items():
            if event_id in ml_scores_by_id:
                ml_scores_by_id[event_id].append(score)

    # Combine per event
    scored: list[ScoredEvent] = []

    for event in events:
        rule_scores = rule_scores_by_id[event.id]
        ml_scores = ml_scores_by_id[event.id]

        # Take max of each category — one strong signal is enough
        rule_score = max(rule_scores) if rule_scores else 0.0
        ml_score = max(ml_scores) if ml_scores else 0.0

        combined = (rule_score * RULE_WEIGHT) + (ml_score * ML_WEIGHT)

        triggered = _get_triggered_rules(event.id, rule_results, ml_results)

        scored.append(ScoredEvent(
            event=event,
            rule_score=rule_score,
            ml_score=ml_score,
            combined_score=combined,
            triggered_rules=triggered,
        ))

    return scored

def detect_anomalies(org_id: str, scored_events: list[ScoredEvent]) -> list[DetectedAnomaly]:
    """
    From scored events, groups anomalous events into DetectedAnomaly objects.
    One anomaly per source+type cluster — avoids creating 50 incidents for
    50 slow queries from the same service.
    """
    anomalous = [s for s in scored_events if s.combined_score >= ANOMALY_THRESHOLD]

    if not anomalous:
        return []

    # Group by (normalized_type, affected_service) — cluster related events
    clusters: dict[str, list[ScoredEvent]] = {}

    for scored in anomalous:
        service = str(scored.event.metadata.get("service", scored.event.source))
        key = f"{scored.event.normalized_type.value}:{service}"
        if key not in clusters:
            clusters[key] = []
        clusters[key].append(scored)

    anomalies: list[DetectedAnomaly] = []

    for cluster_key, cluster_events in clusters.items():
        # Use max score in the cluster as the cluster score
        max_score = max(e.combined_score for e in cluster_events)
        severity = _score_to_severity(max_score)

        # Pick representative event for context
        rep = max(cluster_events, key=lambda e: e.combined_score)
        event_type = rep.event.normalized_type.value
        service = str(rep.event.metadata.get("service", rep.event.source))

        title = _build_title(event_type, service, cluster_events)

        affected_services = list({
            str(e.event.metadata.get("service", e.event.source))
            for e in cluster_events
        })

        initial_context = {
            "eventType": event_type,
            "clusterSize": len(cluster_events),
            "maxScore": max_score,
            "triggeredRules": rep.triggered_rules,
            "representativePayload": rep.event.payload,
            "affectedServices": affected_services,
            "timeRange": {
                "first": min(e.event.received_at for e in cluster_events),
                "last": max(e.event.received_at for e in cluster_events),
            },
        }

        anomalies.append(DetectedAnomaly(**{
            "orgId": org_id,
            "rawEventIds": [e.event.id for e in cluster_events],
            "title": title,
            "severity": severity,
            "affectedServices": affected_services,
            "initialContext": initial_context,
            "score": max_score,
        }))

    return anomalies


def _score_to_severity(score: float) -> IncidentSeverity:
    if score >= 0.85:
        return IncidentSeverity.CRITICAL
    if score >= 0.70:
        return IncidentSeverity.HIGH
    if score >= 0.55:
        return IncidentSeverity.MEDIUM
    return IncidentSeverity.LOW


def _build_title(event_type: str, service: str, events: list[ScoredEvent]) -> str:
    titles = {
        "log.error": f"High error rate in {service}",
        "postgres.slow_query": f"Slow queries detected in {service}",
        "postgres.connection_pool_exhausted": f"Database connection pool exhausted in {service}",
        "postgres.deadlock": f"Database deadlock detected in {service}",
    }
    base = titles.get(event_type, f"Anomaly detected in {service}")
    count = len(events)
    if count > 1:
        return f"{base} ({count} events)"
    return base


def _get_triggered_rules(
    event_id: str,
    rule_results: list[dict[str, float]],
    ml_results: list[dict[str, float]],
) -> list[str]:
    rule_names = [
        "error_rate",
        "slow_query",
        "connection_pool",
    ]
    ml_names = ["zscore", "rate_of_change", "rolling_window"]

    triggered = []

    for i, result in enumerate(rule_results):
        if event_id in result:
            triggered.append(rule_names[i])

    for i, result in enumerate(ml_results):
        if event_id in result:
            triggered.append(ml_names[i])

    return triggered