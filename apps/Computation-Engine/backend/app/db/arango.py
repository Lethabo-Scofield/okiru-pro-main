import logging
import uuid
from datetime import datetime

from arango import ArangoClient

from app.core.config import settings

logger = logging.getLogger(__name__)


def _init_arango_client():
    """Initialize ArangoDB client and ensure required collections exist.

    This function will raise on any connection failure. The server must not
    start without a reachable ArangoDB instance.
    """

    required_collections = {
        "scorecard_models": False,
        "cells": False,
        "dependencies": True,  # Edge collection for cell dependencies
        "scorecard_snapshots": False,
        "companies": False,
        "overrides": False,
        "audit_logs": False,
    }

    logger.info("Connecting to ArangoDB at %s", settings.ARANGO_URL)
    try:
        client = ArangoClient(hosts=settings.ARANGO_URL)
        db = client.db(
            settings.ARANGO_DB,
            username=settings.ARANGO_USER,
            password=settings.ARANGO_PASSWORD,
            verify=settings.ARANGO_VERIFY_SSL,
        )
        logger.info("Connected to ArangoDB database: %s", settings.ARANGO_DB)
    except Exception as e:
        logger.critical("Failed to connect to ArangoDB: %s", e)
        raise RuntimeError(
            "Failed to connect to ArangoDB. Ensure it is running and reachable at "
            f"{settings.ARANGO_URL}."
        ) from e

    # Ensure required collections exist
    try:
        for name, is_edge in required_collections.items():
            if not db.has_collection(name):
                db.create_collection(name, edge=is_edge)
                logger.info("Created collection: %s (edge=%s)", name, is_edge)
    except Exception as e:
        logger.critical("Failed to ensure ArangoDB collections: %s", e)
        raise

    return db


# Initialize database connection (must succeed)
db = _init_arango_client()

# Export collections
scorecard_models = db.collection("scorecard_models")
cells = db.collection("cells")
dependencies = db.collection("dependencies")
scorecard_snapshots = db.collection("scorecard_snapshots")
companies = db.collection("companies")
overrides = db.collection("overrides")
audit_logs = db.collection("audit_logs")


def log_audit(action: str, user: str = None, details: dict = None):
    """Log an audit event and return the generated key."""
    doc = {
        "_key": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "action": action,
        "user": user,
        "details": details or {},
    }
    audit_logs.insert(doc)
    return doc["_key"]
