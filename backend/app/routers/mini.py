from __future__ import annotations

import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.command_service import publish_relay_set
from app.config import get_settings
from app.db import get_db
from app.deps import BizError, get_current_app_user
from app.errors import Err
from app.models import AppUser, CommandRecord, Device, DeviceOperationLog, DeviceSchedule
from app.responses import ok
from app.runtime import mqtt_bridge
from app.scheduler_service import reload_schedule_jobs
from app.schemas_http import (
    BindBody,
    CommandBody,
    PatchDeviceBody,
    ScheduleCreateBody,
    SchedulePatchBody,
    UnbindBody,
    WechatLoginBody,
)
from app.security import create_access_token
from app.timeutil import utc_now_naive

router = APIRouter(prefix="/api/v1", tags=["miniapp"])


@router.post("/auth/wechat")
async def auth_wechat(body: WechatLoginBody, db: Annotated[AsyncSession, Depends(get_db)]):
    s = get_settings()
    if not s.wechat_appid or not s.wechat_secret:
        raise BizError(Err.INTERNAL, "WECHAT_APPID/WECHAT_SECRET not configured")
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://api.weixin.qq.com/sns/jscode2session",
            params={
                "appid": s.wechat_appid,
                "secret": s.wechat_secret,
                "js_code": body.code,
                "grant_type": "authorization_code",
            },
        )
        data = r.json()
    if "openid" not in data:
        raise BizError(Err.PARAM, f"wechat error: {data.get('errmsg', data)}")

    oid = data["openid"]
    unionid = data.get("unionid")
    now = utc_now_naive()
    user = await db.scalar(select(AppUser).where(AppUser.wx_openid == oid))
    if not user:
        user = AppUser(
            id=str(uuid.uuid4()),
            wx_openid=oid,
            wx_unionid=unionid,
            nickname=None,
            avatar_url=None,
            created_at=now,
            last_login_at=now,
        )
        db.add(user)
    else:
        user.last_login_at = now
        if unionid:
            user.wx_unionid = unionid
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, "app")
    return ok(
        {
            "token": token,
            "user": {
                "id": user.id,
                "wx_openid": user.wx_openid,
                "nickname": user.nickname,
                "avatar_url": user.avatar_url,
            },
        }
    )


@router.get("/me")
async def me(user: Annotated[AppUser, Depends(get_current_app_user)]):
    return ok(
        {
            "id": user.id,
            "wx_openid": user.wx_openid,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
        }
    )


@router.get("/devices")
async def list_devices(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    rows = (await db.execute(select(Device).where(Device.owner_user_id == user.id))).scalars().all()
    out = []
    for d in rows:
        out.append(
            {
                "device_id": d.id,
                "device_sn": d.device_sn,
                "relay_state": d.relay_state,
                "online": d.online,
                "remark_name": d.remark_name,
                "last_seen_at": d.last_seen_at.isoformat() + "Z" if d.last_seen_at else None,
            }
        )
    return ok(out)


@router.post("/devices/bind")
async def bind(
    body: BindBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    sn = body.device_sn.strip().upper()
    dev = await db.scalar(select(Device).where(Device.device_sn == sn))
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.mqtt_password != body.mqtt_password:
        raise BizError(Err.PARAM, "mqtt_password mismatch")
    if dev.owner_user_id and dev.owner_user_id != user.id:
        raise BizError(Err.CONFLICT, "device already bound")
    dev.owner_user_id = user.id
    dev.updated_at = utc_now_naive()
    log = DeviceOperationLog(
        device_id=dev.id,
        user_id=user.id,
        source="miniapp",
        action="bind",
        cmd_id=None,
        detail_json=None,
        created_at=utc_now_naive(),
    )
    db.add(log)
    await db.commit()
    return ok({"device_id": dev.id})


@router.post("/devices/unbind")
async def unbind(
    body: UnbindBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, body.device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    dev.owner_user_id = None
    dev.updated_at = utc_now_naive()
    log = DeviceOperationLog(
        device_id=dev.id,
        user_id=user.id,
        source="miniapp",
        action="unbind",
        cmd_id=None,
        detail_json=None,
        created_at=utc_now_naive(),
    )
    db.add(log)
    await db.commit()
    return ok({})


@router.patch("/devices/{device_id}")
async def patch_device(
    device_id: str,
    body: PatchDeviceBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    if body.remark_name is not None:
        dev.remark_name = body.remark_name
    dev.updated_at = utc_now_naive()
    await db.commit()
    return ok({})


@router.post("/devices/{device_id}/command")
async def device_command(
    device_id: str,
    body: CommandBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    if not dev.online:
        raise BizError(Err.DEVICE_OFFLINE, "device offline")
    m = mqtt_bridge
    if not m:
        raise BizError(Err.INTERNAL, "mqtt not ready")
    cmd_id = await publish_relay_set(db, m, dev, body.on, source="miniapp", user_id=user.id)
    return JSONResponse(status_code=202, content=ok({"cmd_id": cmd_id}, message="accepted"))


@router.get("/devices/{device_id}/commands/{cmd_id}")
async def get_command(
    device_id: str,
    cmd_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    rec = await db.get(CommandRecord, cmd_id)
    if not rec or rec.device_id != device_id:
        raise BizError(Err.NOT_FOUND, "command not found")
    return ok(
        {
            "cmd_id": rec.cmd_id,
            "status": rec.status,
            "created_at": rec.created_at.isoformat() + "Z" if rec.created_at else None,
            "ack_at": rec.ack_at.isoformat() + "Z" if rec.ack_at else None,
        }
    )


@router.get("/devices/{device_id}/logs")
async def device_logs(
    device_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    q = (
        select(DeviceOperationLog)
        .where(DeviceOperationLog.device_id == device_id)
        .order_by(DeviceOperationLog.id.desc())
    )
    total = await db.scalar(
        select(func.count()).select_from(DeviceOperationLog).where(DeviceOperationLog.device_id == device_id)
    )
    offset = (page - 1) * page_size
    rows = (
        await db.execute(q.offset(offset).limit(page_size))
    ).scalars().all()
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


@router.get("/devices/{device_id}/schedules")
async def list_schedules(
    device_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    rows = (await db.execute(select(DeviceSchedule).where(DeviceSchedule.device_id == device_id))).scalars().all()
    items = [
        {
            "schedule_id": r.id,
            "cron_expr": r.cron_expr,
            "action": r.action,
            "enabled": r.enabled,
        }
        for r in rows
    ]
    return ok(items)


@router.post("/devices/{device_id}/schedules")
async def create_schedule(
    device_id: str,
    body: ScheduleCreateBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    n = await db.scalar(select(func.count()).select_from(DeviceSchedule).where(DeviceSchedule.device_id == device_id))
    if int(n or 0) >= 10:
        raise BizError(Err.CONFLICT, "max 10 schedules per device")
    if body.action not in ("relay_on", "relay_off"):
        raise BizError(Err.PARAM, "invalid action")
    sid = str(uuid.uuid4())
    now = utc_now_naive()
    sch = DeviceSchedule(
        id=sid,
        device_id=device_id,
        user_id=user.id,
        enabled=body.enabled,
        cron_expr=body.cron_expr,
        action=body.action,
        created_at=now,
        updated_at=now,
    )
    db.add(sch)
    await db.commit()
    sched = request.app.state.scheduler
    if sched:
        await reload_schedule_jobs(sched)
    return ok({"schedule_id": sid})


@router.patch("/devices/{device_id}/schedules/{schedule_id}")
async def patch_schedule(
    device_id: str,
    schedule_id: str,
    body: SchedulePatchBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    sch = await db.get(DeviceSchedule, schedule_id)
    if not sch or sch.device_id != device_id:
        raise BizError(Err.NOT_FOUND, "schedule not found")
    if body.cron_expr is not None:
        sch.cron_expr = body.cron_expr
    if body.action is not None:
        if body.action not in ("relay_on", "relay_off"):
            raise BizError(Err.PARAM, "invalid action")
        sch.action = body.action
    if body.enabled is not None:
        sch.enabled = body.enabled
    sch.updated_at = utc_now_naive()
    await db.commit()
    sched = request.app.state.scheduler
    if sched:
        await reload_schedule_jobs(sched)
    return ok({})


@router.delete("/devices/{device_id}/schedules/{schedule_id}")
async def delete_schedule(
    device_id: str,
    schedule_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[AppUser, Depends(get_current_app_user)],
):
    dev = await db.get(Device, device_id)
    if not dev:
        raise BizError(Err.NOT_FOUND, "device not found")
    if dev.owner_user_id != user.id:
        raise BizError(Err.FORBIDDEN, "not owner")
    sch = await db.get(DeviceSchedule, schedule_id)
    if not sch or sch.device_id != device_id:
        raise BizError(Err.NOT_FOUND, "schedule not found")
    await db.delete(sch)
    await db.commit()
    sched = request.app.state.scheduler
    if sched:
        await reload_schedule_jobs(sched)
    return ok({})
