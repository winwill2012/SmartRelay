from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import Err
from app.models import Admin, AppUser
from app.security import decode_token


class BizError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message


async def get_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise BizError(Err.UNAUTH, "missing or invalid Authorization")
    return authorization[7:].strip()


async def get_current_app_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(get_bearer_token)],
) -> AppUser:
    try:
        payload = decode_token(token)
    except Exception:
        raise BizError(Err.UNAUTH, "token invalid") from None
    if payload.get("typ") != "app":
        raise BizError(Err.UNAUTH, "token type mismatch")
    uid = payload.get("sub")
    if not uid:
        raise BizError(Err.UNAUTH, "invalid subject")
    row = await db.scalar(select(AppUser).where(AppUser.id == uid))
    if not row:
        raise BizError(Err.UNAUTH, "user not found")
    return row


async def get_current_admin(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(get_bearer_token)],
) -> Admin:
    try:
        payload = decode_token(token)
    except Exception:
        raise BizError(Err.UNAUTH, "token invalid") from None
    if payload.get("typ") != "admin":
        raise BizError(Err.UNAUTH, "token type mismatch")
    aid = payload.get("sub")
    if aid is None:
        raise BizError(Err.UNAUTH, "invalid subject")
    row = await db.scalar(select(Admin).where(Admin.id == int(aid)))
    if not row:
        raise BizError(Err.UNAUTH, "admin not found")
    return row
