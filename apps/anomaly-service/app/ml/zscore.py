import numpy as np
from ..models.schemas import RawEvent, NormalizedEventType

ZSCORE_THRESHOLD = 3.0 # Standard: 3 standard deviations = anomaly

def comput_zscore_scores(events: list[RawEvent]) -> dict[str, float]:
    """
    Applies Z-score anomaly detection to numeric signals in the event batch.
    
    Z-score measures how many standard deviations a value is from the mean of the 
    batch. Values > 3 str devs are statistical anomalies.
    """
    scores: dict[str, float] = {}

    events_by_type: dict[str, list[RawEvent]] = {}
    for event in events:
        key = event.normalized_type.value
        if key not in events_by_type:
            events_by_type[key] = []

        events_by_type[key].append(event)

    for event_type, type_event in events_by_type.items():
        if len(type_event) < 3:
            # need at least 3 data point for meaningful Z-score
            continue

        signal_values = _extract_signal(event_type, type_event)
        if signal_values is None:
            continue

        values = np.array(signal_values, dtype=float)
        mean = np.mean(values)
        std = np.std(values)

        if std == 0:
            # All values are identical
            continue
        
        zscores = np.abs((values - mean) / std)

        for i, event in enumerate(type_event):
            z = float(zscores[i])
            if z >= ZSCORE_THRESHOLD:
                score = min(1.0, (z - ZSCORE_THRESHOLD) / ZSCORE_THRESHOLD * 0.5 + 0.5)
                scores[event.id] = score

    return scores

def _extract_signal(event_type: str, events: list[RawEvent]) -> list[float] | None:
    """
    Extract the primary numeric signal from each event type/
    Return None if no numeric signal is available for ths type
    """

    extractors: dict[str, str] = {
        "postgres.slow_query": "durationMs",
        "postgres.connection_pool_exhausted": "utilizationPercent",
        "bullmq.queue_depth_high": "totalDepth",
        "bullmq.job_failed": "failedCount",
        "log.error": None,  # no numeric signal for log errors
        "log.warn": None,
    }

    field = extractor.get(event_type)
    if field is None:
        return None
    
    values = []

    for event in events:
        val = event.payload.get(field)
        if isinstance(val, (int, float)):
            values.append(float(val))
        else:
            values.append(0.0)
    
    return vlaues if len(values) > 0 else None