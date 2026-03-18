"""Admin API for model management.

Endpoints for uploading, compiling, and evaluating scorecard models.
"""

import json
import logging
import os
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from pydantic import BaseModel

from app.services.admin_model_service import (
    CompilationError,
    DAGValidationError,
    compile_model_version,
    create_model_version,
    evaluate_model,
    get_active_model,
    get_graph,
    get_model_version,
    list_model_versions,
    set_active_model,
    summarize_model,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/models", tags=["admin-models"])


def _require_admin(x_admin: Optional[str] = Header(None)):
    """Simple admin guard.

    In production this should be replaced with proper auth (OAuth/JWT/SSO).
    For now, it requires an `X-Admin: true` header.
    """
    if x_admin is None or x_admin.lower() != "true":
        raise HTTPException(status_code=403, detail="Admin access required")
    return {"role": "admin"}


# ============================================================================
# Response Models
# ============================================================================

class UploadResponse(BaseModel):
    """Response from model upload endpoint."""
    version_id: str
    name: str
    uploaded_at: str
    status: str
    file_hash: str
    cell_count: int
    formula_count: int
    input_count: int
    output_count: int


class ModelVersionListItem(BaseModel):
    """Lightweight model version for listing."""
    version_id: str
    name: str
    uploaded_at: str
    status: str
    file_hash: str
    cell_count: int
    formula_count: int


class ModelVersionSummary(BaseModel):
    """Detailed model version summary."""
    version_id: str
    name: str
    uploaded_at: str
    status: str
    file_hash: str
    cell_count: int
    formula_count: int
    input_count: int
    output_count: int
    graph: Dict[str, int]


class GraphResponse(BaseModel):
    """Dependency graph for visualization."""
    nodes: List[str]
    edges: List[Dict[str, str]]


class EvaluationResponse(BaseModel):
    """Results from model evaluation."""
    version_id: str
    results: Dict[str, Any]
    stats: Dict[str, Any]


class EvaluationTestResponse(BaseModel):
    """Results from evaluation test with expected values."""
    version_id: str
    passed: bool
    total: int
    matched: int
    details: Dict[str, Dict[str, Any]]


class ActiveModelResponse(BaseModel):
    """Active model version for company."""
    company_id: str
    active_model_id: Optional[str]


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/upload", response_model=UploadResponse)
async def upload_model(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str = Form(...),
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Upload a new scorecard model version.

    Uploads are accepted immediately and compilation runs in the background.

    Returns model metadata (status may be "pending" while compilation runs).
    """
    # Save uploaded file temporarily (kept until background compilation completes)
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        doc = create_model_version(
            name=name,
            filepath=tmp_path,
            uploaded_by=admin.get("role", "admin"),
        )

        # Schedule background compilation (will also cleanup the temp file)
        def _background_compile(version_id: str, path: str, user: str):
            try:
                compile_model_version(version_id, path)
            finally:
                try:
                    os.remove(path)
                except Exception:
                    pass

        background_tasks.add_task(
            _background_compile,
            doc["_key"],
            tmp_path,
            admin.get("role", "admin"),
        )

        return UploadResponse(
            version_id=doc["_key"],
            name=doc["name"],
            uploaded_at=doc["created_at"],
            status=doc["status"],
            file_hash=doc["file_hash"],
            cell_count=doc["cell_count"],
            formula_count=doc["formula_count"],
            input_count=doc["input_count"],
            output_count=doc["output_count"],
        )
    except ValueError as e:
        logger.warning(f"Invalid workbook: {e}")
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))
    except (CompilationError, DAGValidationError) as e:
        logger.warning(f"Compilation/validation error: {e}")
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during upload: {e}", exc_info=True)
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/list", response_model=List[ModelVersionListItem])
def list_models(admin: Dict[str, Any] = Depends(_require_admin)):
    """List all uploaded model versions.
    
    Returns lightweight view with name, hash, dates, and cell counts.
    """
    try:
        all_models = list_model_versions()
        return [
            ModelVersionListItem(
                version_id=doc.get("_key"),
                name=doc.get("name"),
                uploaded_at=doc.get("uploaded_at"),
                status=doc.get("status"),
                file_hash=doc.get("file_hash"),
                cell_count=doc.get("cell_count", 0),
                formula_count=doc.get("formula_count", 0),
            )
            for doc in all_models
        ]
    except Exception as e:
        logger.error(f"Error listing models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list models")


@router.get("/{version_id}/summary", response_model=ModelVersionSummary)
def get_summary(
    version_id: str,
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Get detailed summary for a model version.
    
    Includes cell counts, formula counts, and graph statistics.
    """
    try:
        return summarize_model(version_id)
    except ValueError as e:
        logger.warning(f"Model not found: {version_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get model summary")


@router.get("/{version_id}/graph", response_model=GraphResponse)
def model_graph(
    version_id: str,
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Get the dependency graph for a model version.
    
    Used for visualization of cell dependencies.
    Returns nodes (cell addresses) and edges (dependencies).
    """
    try:
        graph = get_graph(version_id)
        return GraphResponse(**graph)
    except ValueError as e:
        logger.warning(f"Model not found: {version_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting graph: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get model graph")


@router.post("/{version_id}/evaluate", response_model=EvaluationResponse)
async def evaluate(
    version_id: str,
    body: dict = Body(...),
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Evaluate a model with optional cell overrides.
    
    Process:
    - Load compiled artifact from ArangoDB (NO recompilation)
    - Inject override values
    - Evaluate using topological graph traversal
    - Return results and statistics
    
    Args:
        version_id: Model version to evaluate
        body: Request body with optional "overrides" dict {cell_address: value}
        
    Returns:
        results: All cell values after evaluation
        stats: Evaluation statistics
        
    Raises:
        - 400: Invalid overrides or non-existent cells
        - 404: Model version not found
    """
    overrides_map = body.get("overrides", {}) if isinstance(body, dict) else {}
    
    try:
        results, stats = evaluate_model(version_id, overrides=overrides_map)
        
        # Convert results to JSON-serializable types
        # xlcalculator returns special type objects that Pydantic can't serialize
        results_dict = {}
        if isinstance(results, dict):
            for k, v in results.items():
                # Convert xlcalculator special types to Python types
                if hasattr(v, '__float__'):
                    results_dict[str(k)] = float(v)
                elif hasattr(v, '__int__'):
                    results_dict[str(k)] = int(v)
                elif hasattr(v, 'value'):  # xlcalculator Text objects have .value
                    results_dict[str(k)] = str(v.value) if hasattr(v.value, '__str__') else v.value
                else:
                    results_dict[str(k)] = v
        
        return EvaluationResponse(
            version_id=version_id,
            results=results_dict,
            stats=stats,
        )
    except ValueError as e:
        if "non-existent cells" in str(e):
            logger.warning(f"Invalid overrides: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        else:
            logger.warning(f"Model not found: {version_id}")
            raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error during evaluation: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model evaluation failed: {type(e).__name__}: {str(e)}")


@router.post("/{version_id}/test", response_model=EvaluationTestResponse)
def test_accuracy(
    version_id: str,
    expected: Optional[str] = Form(None),
    overrides: Optional[str] = Form(None),
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Evaluate model and compare results to expected values.
    
    Useful for validation during development.
    
    Args:
        version_id: Model to evaluate
        expected: JSON with {cell: expected_value} for comparison
        overrides: JSON with {cell: override_value} for inputs
        
    Returns:
        Test results with pass/fail and detailed comparison
    """
    expected_map = {}
    overrides_map = {}
    
    if expected:
        try:
            expected_map = json.loads(expected)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid expected JSON: {str(e)}")
    
    if overrides:
        try:
            overrides_map = json.loads(overrides)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid overrides JSON: {str(e)}")
    
    try:
        results, _ = evaluate_model(version_id, overrides=overrides_map)
        
        matched = 0
        total = len(expected_map)
        details: Dict[str, Dict[str, Any]] = {}
        
        for cell, expected_val in expected_map.items():
            actual_val = results.get(cell)
            is_match = actual_val == expected_val
            
            if is_match:
                matched += 1
            
            details[cell] = {
                "expected": expected_val,
                "actual": actual_val,
                "match": is_match,
            }
        
        return EvaluationTestResponse(
            version_id=version_id,
            passed=(matched == total) if total > 0 else True,
            total=total,
            matched=matched,
            details=details,
        )
    except ValueError as e:
        logger.warning(f"Model not found: {version_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error during test: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


@router.post("/{version_id}/set-active", response_model=ActiveModelResponse)
def set_active(
    version_id: str,
    company_id: Optional[str] = Form("global"),
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Set the active model version for a company (or globally).
    
    Args:
        version_id: Model to activate
        company_id: Company ID (or "global" for all)
    """
    try:
        result = set_active_model(version_id, company_id or "global")
        return ActiveModelResponse(**result)
    except ValueError as e:
        logger.warning(f"Model not found: {version_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error setting active model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to set active model")


@router.get("/active/{company_id}", response_model=ActiveModelResponse)
def get_active(
    company_id: str = "global",
    admin: Dict[str, Any] = Depends(_require_admin),
):
    """Get which model version is currently active for a company.
    
    Args:
        company_id: Company ID (or "global")
    """
    try:
        active = get_active_model(company_id)
        return ActiveModelResponse(company_id=company_id, active_model_id=active)
    except Exception as e:
        logger.error(f"Error getting active model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get active model")
