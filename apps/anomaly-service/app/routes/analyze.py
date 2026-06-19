import httpx
import os
import logging
from fastapi import APIRouter, HTTPException
from ..models.schemas import AnalyzeBatchRequest, AnalyzeBatchResponse, DetectedAnomaly
from ..decider import score_events, detect_anomalies

router = APIRouter()
logger = logging.getLogger(__name__)

API_SERVICE_URL = os.getenv("API_SERVICE_URL", "http://api-service:3003")

@router.post("/analyze", response_model=AnalyzeBatchResponse)
async def analyze_batch(request: AnalyzeBatchRequest) -> AnalyzeBatchResponse:
    """
    Receives a batch of normalized events from ingestion-service
    Scores them, detects anomalies and forwards confirmed anomalies
    to api-service to create incidents
    """

    if not request.events:
        return AnalyzeBatchResponse(**{
            "processedCount": 0,
            "anomalies": []
        })

    scored = score_events(request.org_id, request.events)

    anomalies = detect_anomalies(request.org_id, scored)

    if not anomalies:
        logger.debug(f"batch processed, no anomalies org={request.org_id} count={len(request.events)}")
        return AnalyzeBatchResponse(**{
            "processedCount": len(request.events),
            "anomalies": [],
        })

    logger.info(f"anomalies detected org={request.org_id} count={len(anomalies)}")

    forwarded: list[DetectedAnomaly] = []

    async with httpx.AsyncClient(timeout=5.0) as client:
        for anomaly in anomalies:
            try:
                response = await client.post(
                    f"{API_SERVICE_URL}/internal/incidents",
                    json=anomaly.model_dump(by_alias=True)
                )
                response.raise_for_status()
                forwarded.append(anomaly)
                logger.info(f"incident created — org={request.org_id} title={anomaly.title}")
            except httpx.HTTPError as e:
                logger.error(f"failed to create incident — org={request.org_id} error={e}")
            except Exception as e:
                logger.error(f"unexpected error forwarding anomaly — {e}")

    return AnalyzeBatchResponse(**{
        "processedCount": len(request.events),
        "anomalies": forwarded,
    })