"""
Docling conversion sidecar.

Layout-aware document -> markdown conversion for the extraction pipeline. Docling
recovers real table STRUCTURE (TableFormer) and reading order from PDFs, DOCX,
PPTX and XLSX, which the hand-rolled converters in the Node services cannot do —
they only see a text layer. LLM extractors read the resulting markdown far more
reliably, especially for B-BBEE certificates where the values live in tables.

Contract: POST /convert (multipart file) -> { markdown, tables, pages, engine }.
The Node callers treat this service as OPTIONAL: any error or timeout falls back
to their built-in converters, so a sidecar outage degrades quality, never breaks
extraction.

Run:  uvicorn services.docling.app:app --port 3400
"""
from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger("docling-sidecar")
logging.basicConfig(level=logging.INFO)

# Docling's first import loads ML models and is slow (tens of seconds), so the
# converter is built once at startup and reused, never per request.
_converter: Any | None = None

MAX_UPLOAD_BYTES = int(os.environ.get("DOCLING_MAX_UPLOAD_BYTES", 50 * 1024 * 1024))

SUPPORTED_SUFFIXES = {".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".tiff", ".html", ".md"}


def get_converter() -> Any:
    """Lazily build (and cache) the Docling converter."""
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter

        logger.info("Loading Docling DocumentConverter (first call loads models)...")
        started = time.time()
        _converter = DocumentConverter()
        logger.info("Docling converter ready in %.1fs", time.time() - started)
    return _converter


class ConvertResponse(BaseModel):
    markdown: str
    tables: list[dict[str, Any]]
    pages: int
    engine: str
    duration_ms: int


app = FastAPI(title="Docling conversion sidecar", version="1.0.0")


@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness + whether the (expensive) model load has already happened."""
    return {"status": "ok", "converter_loaded": _converter is not None}


@app.post("/warmup")
def warmup() -> dict[str, Any]:
    """Force the model load up front so the first real request isn't slow."""
    started = time.time()
    get_converter()
    return {"status": "ready", "load_ms": int((time.time() - started) * 1000)}


def _extract_tables(document: Any) -> list[dict[str, Any]]:
    """Export each recovered table as structured rows alongside the markdown."""
    tables: list[dict[str, Any]] = []
    for index, table in enumerate(getattr(document, "tables", []) or []):
        entry: dict[str, Any] = {"index": index}
        try:
            frame = table.export_to_dataframe()
            entry["columns"] = [str(c) for c in frame.columns]
            entry["rows"] = frame.astype(str).to_dict(orient="records")
        except Exception as exc:  # noqa: BLE001 - a bad table must not fail the doc
            logger.warning("table %s export failed: %s", index, exc)
            try:
                entry["markdown"] = table.export_to_markdown()
            except Exception:  # noqa: BLE001
                continue
        tables.append(entry)
    return tables


@app.post("/convert", response_model=ConvertResponse)
async def convert(file: UploadFile = File(...)) -> ConvertResponse:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES} bytes")

    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix and suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"Unsupported type {suffix}")

    started = time.time()
    # Docling reads from a path, so the upload is staged in a temp file that is
    # always cleaned up (delete=False + explicit unlink for Windows compatibility).
    tmp = tempfile.NamedTemporaryFile(suffix=suffix or ".pdf", delete=False)
    try:
        tmp.write(payload)
        tmp.close()
        result = get_converter().convert(tmp.name)
        document = result.document
        markdown = document.export_to_markdown()
        tables = _extract_tables(document)
        pages = len(getattr(document, "pages", []) or []) or 1
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("conversion failed")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}") from exc
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    duration_ms = int((time.time() - started) * 1000)
    logger.info(
        "converted %s (%d bytes) -> %d chars markdown, %d tables in %dms",
        file.filename, len(payload), len(markdown), len(tables), duration_ms,
    )
    return ConvertResponse(
        markdown=markdown,
        tables=tables,
        pages=pages,
        engine="docling",
        duration_ms=duration_ms,
    )
