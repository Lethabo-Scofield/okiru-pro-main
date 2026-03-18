
from __future__ import annotations

from typing import Dict, Optional


def normalize_address(address: str, default_sheet: Optional[str] = None) -> str:
    if not address or not isinstance(address, str):
        raise ValueError(f"Invalid address: {address!r}")

    addr = address.strip()
    if "!" in addr:
        return addr

    if not default_sheet:
        raise ValueError(f"Missing sheet for address: {address}")

    return f"{default_sheet}!{addr}"


def normalize_inputs(inputs: Dict[str, object], default_sheet: str) -> Dict[str, object]:

    return {normalize_address(k, default_sheet): v for k, v in inputs.items()}
