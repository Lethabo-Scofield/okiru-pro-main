import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_models import router as admin_models_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Okiru Computation Engine",
    description="B-BBEE scorecard compilation and evaluation",
    version="2.0.0",
)

# CORS middleware for frontend
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


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown hook."""
    logger.info("Okiru Computation Engine stopped")
