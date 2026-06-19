from datetime import datetime
from ..models.schemas import RawEvent, NormalizedEventType


# If a signal increases by more than this factor within the batch window, flag it
RATE_OF_CHANGE_THRESHOLD = 2.0  # 2x increase


def compute_rate_of_change_scores(events: list[RawEvent]) -> dict[str, float]:
    """
    Detects rapid increases in a signal over the time window of the batch.

    Example: queue depth was 100 at start of batch window, 500 at end.
    That's a 5x increase — likely a real problem, not noise.
    """
    scores: dict[str, float] = {}

    # Only applies to event types with a meaningful numeric progression
    target_types = {
        NormalizedEventType.POSTGRES_SLOW_QUERY: "durationMs",
    }

    for event_type, field in target_types.items():
        type_events = [e for e in events if e.normalized_type == event_type]

        if len(type_events) < 2:
            continue

        # Sort by receivedAt to get temporal order
        try:
            sorted_events = sorted(
                type_events,
                key=lambda e: datetime.fromisoformat(e.received_at.replace("Z", "+00:00"))
            )
        except (ValueError, AttributeError):
            continue

        first_val = sorted_events[0].payload.get(field, 0)
        last_val = sorted_events[-1].payload.get(field, 0)

        if not isinstance(first_val, (int, float)) or not isinstance(last_val, (int, float)):
            continue

        first_val = float(first_val)
        last_val = float(last_val)

        if first_val == 0:
            continue

        ratio = last_val / first_val

        if ratio >= RATE_OF_CHANGE_THRESHOLD:
            # Score: 2x = 0.4, 10x = 1.0
            score = min(1.0, (ratio / RATE_OF_CHANGE_THRESHOLD) * 0.4)
            # Apply to the later events — those are the anomalous ones
            for event in sorted_events[len(sorted_events) // 2:]:
                scores[event.id] = score

    return scores