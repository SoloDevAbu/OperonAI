from collections import defaultdict
from ..models.schemas import RawEvent, NormalizedEventType


# If more than this many error events arrive in a single batch window, flag it
ERROR_BURST_THRESHOLD = 10


def compute_rolling_window_scores(events: list[RawEvent]) -> dict[str, float]:
    """
    Detects bursts — a high count of the same event type within the batch window.

    This catches cases that Z-score misses: if ALL values in the batch are
    anomalously high, Z-score won't flag anything (because the mean is high).
    Rolling window catches the absolute count.
    """
    scores: dict[str, float] = {}

    # Count events per type per service
    counts: dict[tuple[str, str], list[RawEvent]] = defaultdict(list)

    for event in events:
        service = str(event.metadata.get("service", event.source))
        key = (event.normalized_type.value, service)
        counts[key].append(event)

    for (event_type, service), type_events in counts.items():
        count = len(type_events)

        # Only care about error-class events for burst detection
        is_error_class = event_type in {
            NormalizedEventType.LOG_ERROR.value,
            NormalizedEventType.POSTGRES_DEADLOCK.value,
        }

        if not is_error_class:
            continue

        if count < ERROR_BURST_THRESHOLD:
            continue

        # Score: threshold = 0.5, 3x threshold = 1.0
        score = min(1.0, 0.5 + (count / (ERROR_BURST_THRESHOLD * 3)) * 0.5)

        for event in type_events:
            scores[event.id] = score

    return scores