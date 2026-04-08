from __future__ import annotations

from typing import Any


def ok(data: Any | None = None, message: str = "ok") -> dict[str, Any]:
    return {"code": 0, "message": message, "data": data if data is not None else {}}


def err(code: int, message: str, data: Any | None = None) -> dict[str, Any]:
    return {"code": code, "message": message, "data": data if data is not None else {}}
