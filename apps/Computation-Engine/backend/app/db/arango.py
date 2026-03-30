import logging
import uuid
from datetime import datetime, timezone

from app.core.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAMES = [
    "scorecard_models",
    "cells",
    "dependencies",
    "scorecard_snapshots",
    "companies",
    "overrides",
    "audit_logs",
]


class _InMemoryCollection:
    def __init__(self, name: str, edge: bool = False):
        self._name = name
        self._edge = edge
        self._docs: dict[str, dict] = {}

    @property
    def name(self) -> str:
        return self._name

    def insert(self, doc: dict, **kwargs):
        key = doc.get("_key", str(uuid.uuid4()))
        doc["_key"] = key
        doc["_id"] = f"{self._name}/{key}"
        self._docs[key] = dict(doc)
        return {"_key": key, "_id": doc["_id"]}

    def get(self, key: str, **kwargs):
        return self._docs.get(key)

    def update(self, doc: dict, **kwargs):
        key = doc.get("_key")
        if key and key in self._docs:
            self._docs[key].update(doc)
        return doc

    def delete(self, key_or_doc, **kwargs):
        key = key_or_doc if isinstance(key_or_doc, str) else key_or_doc.get("_key")
        self._docs.pop(key, None)

    def all(self, **kwargs):
        return list(self._docs.values())

    def find(self, filters: dict, **kwargs):
        results = []
        for doc in self._docs.values():
            if all(doc.get(k) == v for k, v in filters.items()):
                results.append(doc)
        return results

    def truncate(self):
        self._docs.clear()

    def count(self):
        return len(self._docs)

    def has(self, key: str, **kwargs):
        return key in self._docs

    def import_bulk(self, docs: list, **kwargs):
        for doc in docs:
            self.insert(doc)
        return {"created": len(docs), "errors": 0}


class _InMemoryDB:
    def __init__(self):
        self._collections: dict[str, _InMemoryCollection] = {}

    def has_collection(self, name: str) -> bool:
        return name in self._collections

    def create_collection(self, name: str, edge: bool = False, **kwargs):
        col = _InMemoryCollection(name, edge=edge)
        self._collections[name] = col
        return col

    def collection(self, name: str):
        if name not in self._collections:
            self._collections[name] = _InMemoryCollection(name)
        return self._collections[name]

    def aql(self):
        raise NotImplementedError("AQL queries are not supported in in-memory mode")


def _init_arango_client():
    if settings.ALLOW_IN_MEMORY_DB:
        logger.warning("Using in-memory database (ALLOW_IN_MEMORY_DB=1). Data will NOT persist.")
        mem_db = _InMemoryDB()
        required_collections = {
            "scorecard_models": False,
            "cells": False,
            "dependencies": True,
            "scorecard_snapshots": False,
            "companies": False,
            "overrides": False,
            "audit_logs": False,
        }
        for name, is_edge in required_collections.items():
            mem_db.create_collection(name, edge=is_edge)
        return mem_db

    from arango import ArangoClient

    required_collections = {
        "scorecard_models": False,
        "cells": False,
        "dependencies": True,
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

    try:
        for name, is_edge in required_collections.items():
            if not db.has_collection(name):
                db.create_collection(name, edge=is_edge)
                logger.info("Created collection: %s (edge=%s)", name, is_edge)
    except Exception as e:
        logger.critical("Failed to ensure ArangoDB collections: %s", e)
        raise

    return db


db = _init_arango_client()

scorecard_models = db.collection("scorecard_models")
cells = db.collection("cells")
dependencies = db.collection("dependencies")
scorecard_snapshots = db.collection("scorecard_snapshots")
companies = db.collection("companies")
overrides = db.collection("overrides")
audit_logs = db.collection("audit_logs")


def log_audit(action: str, user: str = None, details: dict = None):
    doc = {
        "_key": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "user": user,
        "details": details or {},
    }
    audit_logs.insert(doc)
    return doc["_key"]
