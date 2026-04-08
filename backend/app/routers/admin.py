from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import BizError, get_current_admin
from app.errors import Err
from app.models import Admin, AppUser, Device, DeviceOperationLog
from app.responses import ok
from app.schemas_http import AdminLoginBody, AdminPasswordBody
from app.security import create_access_token, hash_password, verify_password
from app.timeutil import utc_now_naive

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.post("/login")
async def admin_login(body: AdminLoginBody, db: Annotated[AsyncSession, Depends(get_db)]):
    row = await db.scalar(select(Admin).where(Admin.username == body.username))
    if not row or not verify_password(body.password, row.password_hash):
        raise BizError(Err.UNAUTH, "invalid credentials")
    token = create_access_token(str(row.id), "admin")
    return ok({"token": token, "admin": {"id": row.id, "username": row.username}})


@router.post("/password")
async def admin_password(
    body: AdminPasswordBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[Admin, Depends(get_current_admin)],
):
    if not verify_password(body.old_password, admin.password_hash):
        raise BizError(Err.PARAM, "old password wrong")
    admin.password_hash = hash_password(body.new_password)
    admin.updated_at = utc_now_naive()
    await db.commit()
    return ok({})


@router.get("/dashboard")
async def dashboard(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[Admin, Depends(get_current_admin)]):
    users = await db.scalar(select(func.count()).select_from(AppUser))
    devices = await db.scalar(select(func.count()).select_from(Device))
    online = await db.scalar(select(func.count()).select_from(Device).where(Device.online == 1))
    r = await db.execute(
        text(
            """
            SELECT COUNT(*) FROM device_operation_logs
            WHERE action IN ('relay_on','relay_off')
              AND DATE(created_at) = DATE(UTC_TIMESTAMP())
            """
        )
    )
    today = r.scalar() or 0
    return ok(
        {
            "user_count": int(users or 0),
            "device_count": int(devices or 0),
            "online_count": int(online or 0),
            "today_command_count": int(today),
        }
    )


@router.get("/users")
async def admin_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Admin, Depends(get_current_admin)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    total = await db.scalar(select(func.count()).select_from(AppUser))
    offset = (page - 1) * page_size
    rows = (await db.execute(select(AppUser).order_by(AppUser.created_at.desc()).offset(offset).limit(page_size))).scalars().all()
    items = [
        {
            "user_id": u.id,
            "wx_openid": u.wx_openid,
            "nickname": u.nickname,
            "created_at": u.created_at.isoformat() + "Z" if u.created_at else None,
        }
        for u in rows
    ]
    return ok({"items": items, "total": int(total or 0), "page": page, "page_size": page_size})


@router.get("/users/{user_id}")
async def admin_user_detail(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Admin, Depends(get_current_admin)],
):
    u = await db.get(AppUser, user_id)
    if not u:
        raise BizError(Err.NOT_FOUND, "user not found")
    devs = (await db.execute(select(Device).where(Device.owner_user_id == user_id))).scalars().all()
    devices = [
        {
            "device_id": d.id,
            "device_sn": d.device_sn,
            "relay_state": d.relay_state,
            "online": d.online,
        }
        for d in devs
    ]
    return ok(
        {
            "user_id": u.id,
            "wx_openid": u.wx_openid,
            "nickname": u.nickname,
            "devices": devices,
        }
    )


@router.get("/devices")
async def admin_devices(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Admin, Depends(get_current_admin)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    total = await db.scalar(select(func.count()).select_from(Device))
    offset = (page - 1) * page_size
    rows = (await db.execute(select(Device).order_by(Device.created_at.desc()).offset(offset).limit(page_size))).scalars().all()
    items = [
        {
            "device_id": d.id,
            "device_sn": d.device_sn,
            "owner_user_id": d.owner_user_id,
            "relay_state": d.relay_state,
            "online": d.online,
            "last_seen_at": d.last_seen_at.isoformat() + "Z" if d.last_seen_at else None,
        }
        for d in rows
    ]
    return ok({"items": items, "total": int(total or 0), "page": page, "page_size": page_size})


@router.get("/devices/{device_id}/logs")
async def admin_device_logs(
    device_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Admin, Depends(get_current_admin)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    total = await db.scalar(
        select(func.count()).select_from(DeviceOperationLog).where(DeviceOperationLog.device_id == device_id)
    )
    offset = (page - 1) * page_size
    q = (
        select(DeviceOperationLog)
        .where(DeviceOperationLog.device_id == device_id)
        .order_by(DeviceOperationLog.id.desc())
    )
    rows = (await db.execute(q.offset(offset).limit(page_size))).scalars().all()
    items = [
        {
            "id": r.id,
            "source": r.source,
            "action": r.action,
            "cmd_id": r.cmd_id,
            "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
        }
        for r in rows
    ]
    return ok({"items": items, "total": int(total or 0), "page": page, "page_size": page_size})
