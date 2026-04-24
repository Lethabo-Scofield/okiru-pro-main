"""
Azure OpenAI LLM client for the Computation Engine.

Provides a thin, reusable wrapper around the Azure OpenAI chat completions
API (gpt-4o) for any LLM-assisted scoring or validation tasks.

Environment variables required:
  AZURE_OPENAI_ENDPOINT    – e.g. https://<resource>.openai.azure.com
  AZURE_OPENAI_API_KEY     – Azure OpenAI resource key
  AZURE_OPENAI_DEPLOYMENT  – deployment name (default: gpt-4o)
  AZURE_OPENAI_API_VERSION – API version (default: 2024-08-01-preview)
"""

from __future__ import annotations

import json
import os
from typing import Any

try:
    from openai import AzureOpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False


_ENDPOINT   = os.getenv("AZURE_OPENAI_ENDPOINT", "")
_API_KEY    = os.getenv("AZURE_OPENAI_API_KEY", "")
_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
_API_VER    = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")


def is_configured() -> bool:
    """Return True if the Azure OpenAI credentials are present."""
    return bool(_ENDPOINT and _API_KEY and _OPENAI_AVAILABLE)


def _get_client() -> "AzureOpenAI":
    if not _OPENAI_AVAILABLE:
        raise RuntimeError(
            "openai package is not installed. Run: pip install openai>=1.0.0"
        )
    if not _ENDPOINT or not _API_KEY:
        raise RuntimeError(
            "Azure OpenAI credentials missing. "
            "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY."
        )
    return AzureOpenAI(
        azure_endpoint=_ENDPOINT,
        api_key=_API_KEY,
        api_version=_API_VER,
    )


def chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.0,
    max_tokens: int = 1000,
    json_mode: bool = False,
) -> str:
    """
    Send a chat completion request to Azure OpenAI and return the content string.

    Args:
        messages:     List of {"role": ..., "content": ...} dicts.
        temperature:  Sampling temperature (0 = deterministic).
        max_tokens:   Maximum tokens in the response.
        json_mode:    If True, requests JSON-object response format.

    Returns:
        The model's text response.

    Raises:
        RuntimeError: If the client is not configured or the openai package
                      is not installed.
        openai.OpenAIError: On API-level errors (auth, rate-limit, etc.).
    """
    client = _get_client()

    kwargs: dict[str, Any] = {
        "model": _DEPLOYMENT,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


def chat_completion_json(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.0,
    max_tokens: int = 1000,
) -> Any:
    """
    Like chat_completion but automatically parses and returns the JSON response.

    Raises:
        json.JSONDecodeError: If the model returns malformed JSON.
    """
    raw = chat_completion(
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=True,
    )
    return json.loads(raw)
