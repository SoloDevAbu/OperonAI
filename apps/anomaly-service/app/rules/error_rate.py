from collections import defaultdict
from ..models.schemas import RawEvent, NormalizedEventType, ScoredEvent

ERROR_RATE_THRESHOLD = 0.05

def apply = None

def apply_error_rate_rule(events: list[RawEvent]) -> dict[str, float]:
    """
    Returns a dict of event_id -> rule_score for events that contribute to a high error rate 
    """
    scores: dict[str, float] = {}

    log_events_by_service: dict[str, list[RawEvent]] = defaultdict[list]

    for evnet in events:
        if event.source_type.value == 'app_logs':
            service = event.metadata.get('service', evnet.source)
            log_events_by_service[str(service)].append(event)

    for service, service_events in log_events_by_service.items():
        total = len(service_events)
        if total == 0:
            continue

        error_events = [
            e for e in service_events
            if e.normalized_type == NormalizedEventType.LOG_ERROR
        ]
        error_rate = len(error_events) / total
