from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import FORBIDDEN, UNAUTHORIZED
from app.models import AdminBackendRole, AdminUser, User
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


async def get_current_admin(
    token: Annotated[Optional[str], Depends(get_bearer_token)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUser:
    if not token:
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    payload = try_decode_token(token)
    if not payload or payload.get("typ") != "admin":
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    try:
        aid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    r = await session.execute(select(AdminUser).where(AdminUser.id == aid))
    admin = r.scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=401, detail={"code": UNAUTHORIZED, "message": "未授权"})
    return admin


async def get_current_admin_id(admin: AdminUser = Depends(get_current_admin)) -> int:
    return admin.id


async def require_admin_editor(
    admin: AdminUser = Depends(get_current_admin),
) -> AdminUser:
    """访客只读；变更类接口依赖此对象。"""
    if admin.role == AdminBackendRole.visitor:
        raise HTTPException(
            status_code=403,
            detail={"code": FORBIDDEN, "message": "访客账号仅可查看，无法修改数据", "data": None},
        )
    return admin
