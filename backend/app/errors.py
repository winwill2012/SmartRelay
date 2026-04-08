from __future__ import annotations

from fastapi import HTTPException


class Err:
    PARAM = 40001
    UNAUTH = 40101
    FORBIDDEN = 40301
    NOT_FOUND = 40401
    CONFLICT = 40901
    INTERNAL = 50001
    DEVICE_OFFLINE = 50301


def api_http(code: int, message: str) -> HTTPException:
    return HTTPException(status_code=200, detail={"code": code, "message": message})
