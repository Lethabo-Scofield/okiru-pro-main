import os
import pathlib

# Force in-memory storage for unit tests when ArangoDB is not available.
os.environ["ALLOW_IN_MEMORY_DB"] = "1"

from app.services.admin_model_service import (
    compile_model_version,
    create_model_version,
    evaluate_model,
)


def test_compile_and_evaluate_scorecard():
    # Use a sample model from the repository
    path = pathlib.Path(__file__).resolve().parents[2] / "test_models" / "model_test.xlsx"

    # Upload (register) the model version
    doc = create_model_version("test_model", str(path), uploaded_by="test")

    # Compile the model (background compilation in production)
    compile_model_version(doc["_key"], str(path))

    # Evaluate to verify formulas and dependencies
    result, _ = evaluate_model(doc["_key"], overrides={})

    assert result.get("Model!B3") == 10000
    assert result.get("Model!B5") == 10
    assert result.get("Model!B6") == 10010
