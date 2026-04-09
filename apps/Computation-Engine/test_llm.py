"""
Quick smoke-test for the Azure OpenAI LLM client.

Run from the Computation-Engine directory:
    python test_llm.py

Exit codes:
    0 – all checks passed
    1 – Azure not configured or API call failed
"""

import json
import sys
import os

# Allow running from repo root as well
sys.path.insert(0, os.path.dirname(__file__))

from backend.llm_client import is_configured, chat_completion, chat_completion_json


def main() -> int:
    print("=== Azure OpenAI LLM Client – Smoke Test ===\n")

    # 1. Configuration check
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
    has_key = bool(os.getenv("AZURE_OPENAI_API_KEY"))

    print(f"Endpoint   : {endpoint or '(not set)'}")
    print(f"Deployment : {deployment}")
    print(f"API Version: {api_version}")
    print(f"API Key    : {'set' if has_key else '(not set)'}")
    print()

    if not is_configured():
        print("ERROR: Azure OpenAI is not configured.")
        print("Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables.")
        return 1

    print("Config: OK\n")

    # 2. Plain text completion
    print("Test 1: Plain chat completion ...")
    try:
        result = chat_completion(
            [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Reply with exactly: Hello from gpt-4o"},
            ],
            max_tokens=20,
        )
        print(f"  Response: {result.strip()}")
        print("  PASSED\n")
    except Exception as exc:
        print(f"  FAILED: {exc}\n")
        return 1

    # 3. JSON completion
    print("Test 2: JSON chat completion ...")
    try:
        data = chat_completion_json(
            [
                {"role": "system", "content": "You are a JSON API. Return only valid JSON."},
                {
                    "role": "user",
                    "content": (
                        'Return a JSON object with keys "status" and "model". '
                        'Set status to "ok" and model to the model name you are using.'
                    ),
                },
            ],
            max_tokens=80,
        )
        print(f"  Response: {json.dumps(data, indent=2)}")
        assert isinstance(data, dict), "Expected a JSON object"
        assert "status" in data, 'Missing key "status"'
        print("  PASSED\n")
    except Exception as exc:
        print(f"  FAILED: {exc}\n")
        return 1

    print("=== All tests passed ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
