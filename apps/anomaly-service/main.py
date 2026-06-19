import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv
from .routes.analyze import router as analyze_router

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG if os.getenv("NODE_ENV") == "development" else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("anomaly-service starting")
    yield
    logger.info("anomaly-service shutting down")

app = FastAPI(
    title="anomaly-service",
    description="ML-based anomaly detection for AI ops agent",
    version="0.0.1",
    lifespan=lifespan,
)

app.include_router(analyze_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "anomaly-service"}