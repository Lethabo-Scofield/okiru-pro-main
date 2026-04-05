from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_models import router as admin_models_router
from app.core.logger import get_logger

logger = get_logger("ComputeEngine.Main")

app = FastAPI(
    title="Okiru Computation Engine",
    description="B-BBEE scorecard compilation and evaluation",
    version="2.0.0",
)

import os

allowed_origins_env = os.environ.get("CORS_ORIGINS", "")
if allowed_origins_env:
    origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
app.include_router(admin_models_router)


from app.core.config import settings


@app.on_event("startup")
async def startup_event():
    """Application startup hook."""
    logger.info("Okiru Computation Engine started")

    if settings.ALLOW_IN_MEMORY_DB:
        logger.warning("Running in in-memory DB mode (no ArangoDB persistence).")
    else:
        logger.info("Connected to ArangoDB and initialized collections")


@app.get("/health")
async def health_check():
    import time
    return {
        "status": "ok",
        "service": "computation-engine",
        "timestamp": time.time(),
    }


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown hook."""
    logger.info("Okiru Computation Engine stopped")
