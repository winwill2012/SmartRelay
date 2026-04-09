from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import UNAUTHORIZED
from app.models import AdminUser, User
from app.security import try_decode_token

security = HTTPBearer(auto_error=False)


async def get_bearer_token(
    cred: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
    authorization: Annotated[Optional[str], Header()] = None,
) -> Optional[str]:
    if cred and cred.credentials:
        return cred.credentials
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


async def get_current_user_id(
    token: Annotated[Optional[str], Depends(get_bearer_token)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> int:
    if not token:
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    payload = try_decode_token(token)
    if not payload or payload.get("typ") != "wx_user":
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    r = await session.execute(select(User.id).where(User.id == uid))
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    return uid


async def get_current_admin_id(
    token: Annotated[Optional[str], Depends(get_bearer_token)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> int:
    if not token:
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    payload = try_decode_token(token)
    if not payload or payload.get("typ") != "admin":
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    try:
        aid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    r = await session.execute(select(AdminUser.id).where(AdminUser.id == aid))
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    return aid
