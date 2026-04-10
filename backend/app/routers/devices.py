import logging
from datetime import datetime, time as dt_time
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.command_service import (
    find_existing_cmd_by_client_id,
    get_command_status,
    insert_command_sent,
    new_cmd_id,
)
from app.config import get_settings
from app.db import get_session
from app.deps import get_current_user_id
from app.errors import CONFLICT, DEVICE_OFFLINE, FORBIDDEN, NOT_FOUND, PARAM_ERROR
from app.models import (
    Device,
    DeviceOperationLog,
    FirmwareVersion,
    LogSource,
    RepeatType,
    Schedule,
    ScheduleAction,
    User,
    UserDevice,
    UserDeviceRole,
)
from app.mqtt_service import mqtt_publisher
from app.response import err, ok
from app.schedule_sync import build_schedules_payload
from app.schemas import BindBody, CommandBody, PatchDeviceBody, ScheduleCreateBody, ShareBody
from app.security import verify_password
from app.utils import device_is_online

logger = logging.getLogger(__name__)
router = APIRouter()


async def _get_user_device(
    session: AsyncSession, user_id: int, device_id_str: str
) -> Optional[tuple[UserDevice, Device]]:
    r = await session.execute(select(Device).where(Device.device_id == device_id_str))
    dev = r.scalar_one_or_none()
    if not dev:
        return None
    r2 = await session.execute(
        select(UserDevice).where(UserDevice.user_id == user_id, UserDevice.device_id == dev.id)
    )
    ud = r2.scalar_one_or_none()
    if not ud:
        return None
    return ud, dev


def _schedule_summary_row(s: Schedule) -> dict[str, Any]:
    tl = s.time_local
    return {
        "id": s.id,
        "name": s.name,
        "repeat_type": s.repeat_type.value,
        "time_local": tl.strftime("%H:%M"),
        "action": s.action.value,
        "enabled": bool(s.enabled),
    }


def _schedule_summary_text(s: Schedule) -> str:
    """小程序列表：最近定时：HH:MM | 开/关"""
    row = _schedule_summary_row(s)
    t = row.get("time_local") or ""
    act = "开" if row.get("action") == "on" else "关"
    return f"最近定时：{t} | {act}"


@router.get("/devices")
async def list_devices(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(
        select(UserDevice, Device)
        .join(Device, Device.id == UserDevice.device_id)
        .where(UserDevice.user_id == user_id)
        .order_by(UserDevice.id.desc())
    )
    rows = r.all()
    out: list[dict[str, Any]] = []
    for ud, d in rows:
        online = device_is_online(d.last_seen_at)
        r_s = await session.execute(
            select(Schedule)
            .where(Schedule.device_id == d.id, Schedule.enabled.is_(True))
            .order_by(Schedule.id.asc())
            .limit(1)
        )
        first = r_s.scalars().first()
        next_summary: Optional[dict[str, Any]] = None
        next_summary_text: Optional[str] = None
        if first:
            next_summary = _schedule_summary_row(first)
            next_summary_text = _schedule_summary_text(first)
        out.append(
            {
                "device_id": d.device_id,
                "remark": ud.remark,
                "role": ud.role.value,
                "online": online,
                "relay_on": bool(d.relay_on) if d.relay_on is not None else None,
                "fw_version": d.fw_version,
                "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
                "next_schedule": next_summary,
                "next_schedule_summary": next_summary_text,
            }
        )
    return ok(out)


@router.post("/devices/bind")
async def bind_device(
    body: BindBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(Device).where(Device.device_id == body.device_id))
    dev = r.scalar_one_or_none()
    if not dev:
        return err(NOT_FOUND, "设备不存在")

    r_ud = await session.execute(
        select(UserDevice).where(UserDevice.user_id == user_id, UserDevice.device_id == dev.id)
    )
    if r_ud.scalar_one_or_none():
        return err(CONFLICT, "已绑定该设备")

    r_own = await session.execute(
        select(UserDevice).where(UserDevice.device_id == dev.id, UserDevice.role == UserDeviceRole.owner)
    )
    existing_owner = r_own.scalar_one_or_none()
    if existing_owner and existing_owner.user_id != user_id:
        return err(CONFLICT, "设备已被其他用户绑定")

    secret = (body.device_secret or "").strip()
    if secret:
        if not verify_password(secret, dev.device_secret_hash):
            return err(FORBIDDEN, "密钥错误")
    else:
        if dev.last_seen_at is None:
            return err(
                FORBIDDEN,
                "请等待设备联网上报后再绑定，或稍后重试",
            )

    ud = UserDevice(
        user_id=user_id,
        device_id=dev.id,
        remark=body.name or "",
        role=UserDeviceRole.owner,
        created_at=datetime.now(),
    )
    session.add(ud)
    await session.commit()
    return ok({"device_id": dev.device_id, "remark": ud.remark})


@router.delete("/devices/{device_id}/bind")
async def unbind_device(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到绑定关系")
    ud, dev = pair
    if ud.role != UserDeviceRole.owner:
        return err(FORBIDDEN, "仅所有者可解绑")
    await session.execute(delete(UserDevice).where(UserDevice.id == ud.id))
    await session.commit()
    return ok({"device_id": dev.device_id})


@router.patch("/devices/{device_id}")
async def patch_device(
    device_id: str,
    body: PatchDeviceBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    ud, _ = pair
    ud.remark = body.name
    await session.commit()
    return ok({"device_id": device_id, "remark": ud.remark})


@router.post("/devices/{device_id}/command")
async def send_command(
    device_id: str,
    body: CommandBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    if not device_is_online(dev.last_seen_at):
        return err(DEVICE_OFFLINE, "设备离线")

    if body.client_cmd_id:
        existing = await find_existing_cmd_by_client_id(session, dev.id, body.client_cmd_id)
        if existing:
            return ok({"cmd_id": existing})

    cmd_id = new_cmd_id()
    payload: dict[str, Any] = {}
    if body.type == "relay.set":
        if body.payload and "on" in body.payload:
            payload = {"on": bool(body.payload["on"])}
        else:
            payload = {"on": True}
    else:
        payload = {}

    settings = get_settings()
    mqtt_body = {
        "cmd_id": cmd_id,
        "ts": int(datetime.now().timestamp() * 1000),
        "type": body.type,
        "version": 1,
        "payload": payload,
    }
    topic = f"sr/v1/device/{dev.device_id}/cmd"
    await insert_command_sent(
        session,
        device_pk=dev.id,
        user_id=user_id,
        cmd_id=cmd_id,
        cmd_type=body.type,
        payload=payload,
        client_cmd_id=body.client_cmd_id,
        source=LogSource.user,
    )
    await mqtt_publisher.publish_json(topic, mqtt_body, qos=1)
    return ok({"cmd_id": cmd_id})


@router.get("/devices/{device_id}/command/{cmd_id}")
async def get_cmd(
    device_id: str,
    cmd_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    st = await get_command_status(session, dev.id, cmd_id)
    if st.get("status") == "not_found":
        return err(NOT_FOUND, "指令不存在")
    return ok(st)


@router.get("/devices/{device_id}/logs")
async def device_logs(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    off = (page - 1) * page_size
    log_actions = ("command.sent", "schedule.run")
    r = await session.execute(
        select(DeviceOperationLog)
        .where(
            DeviceOperationLog.device_id == dev.id,
            DeviceOperationLog.action.in_(log_actions),
        )
        .order_by(DeviceOperationLog.id.desc())
        .offset(off)
        .limit(page_size)
    )
    rows = r.scalars().all()
    c = await session.execute(
        select(func.count())
        .select_from(DeviceOperationLog)
        .where(
            DeviceOperationLog.device_id == dev.id,
            DeviceOperationLog.action.in_(log_actions),
        )
    )
    total = int(c.scalar_one() or 0)

    user_ids = {x.user_id for x in rows if x.user_id is not None}
    nick_by_uid: dict[int, Optional[str]] = {}
    if user_ids:
        ur = await session.execute(select(User.id, User.nickname).where(User.id.in_(user_ids)))
        for uid, nn in ur.all():
            raw = (nn or "").strip()
            nick_by_uid[int(uid)] = raw if raw else None

    def operator_display(log: DeviceOperationLog) -> str:
        if log.action == "schedule.run":
            return "定时任务"
        if log.user_id is not None:
            nick = nick_by_uid.get(int(log.user_id))
            return nick if nick else "未设置昵称"
        return "—"

    items = [
        {
            "id": x.id,
            "source": x.source.value,
            "action": x.action,
            "detail": x.detail,
            "created_at": x.created_at.isoformat(),
            "operator_name": operator_display(x),
        }
        for x in rows
    ]
    return ok({"items": items, "page": page, "page_size": page_size, "total": total})


@router.get("/devices/{device_id}/schedules")
async def list_schedules(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    r = await session.execute(select(Schedule).where(Schedule.device_id == dev.id).order_by(Schedule.id.asc()))
    rows = r.scalars().all()
    items = []
    for s in rows:
        tl = s.time_local
        items.append(
            {
                "id": s.id,
                "name": s.name,
                "repeat_type": s.repeat_type.value,
                "time_local": tl.strftime("%H:%M"),
                "weekdays": s.weekdays,
                "monthdays": s.monthdays,
                "action": s.action.value,
                "enabled": bool(s.enabled),
            }
        )
    return ok({"items": items})


@router.post("/devices/{device_id}/schedules")
async def create_schedule(
    device_id: str,
    body: ScheduleCreateBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    try:
        hh, mm = body.time_local.split(":")
        t = dt_time(int(hh), int(mm))
    except ValueError:
        return err(PARAM_ERROR, "time_local 格式错误")
    s = Schedule(
        device_id=dev.id,
        name=body.name,
        repeat_type=RepeatType(body.repeat_type),
        time_local=t,
        weekdays=body.weekdays,
        monthdays=body.monthdays,
        action=ScheduleAction(body.action),
        enabled=body.enabled,
        revision=0,
        created_at=datetime.now(),
    )
    session.add(s)
    await session.commit()
    await session.refresh(s)

    rev, schedules = await build_schedules_payload(session, dev.id)
    mqtt_body = {
        "cmd_id": new_cmd_id(),
        "ts": int(datetime.now().timestamp() * 1000),
        "type": "schedule.sync",
        "version": 1,
        "payload": {"revision": rev, "schedules": schedules},
    }
    await mqtt_publisher.publish_json(f"sr/v1/device/{dev.device_id}/cmd", mqtt_body, qos=1)
    return ok({"id": s.id})


@router.post("/devices/{device_id}/share")
async def share_stub(
    device_id: str,
    body: ShareBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    logger.info("share requested device=%s body=%s", dev.device_id, body.model_dump())
    return ok({"status": "pending", "message": "v1 分享流程待与 share_tokens 表对接"})


@router.post("/devices/{device_id}/ota/check")
async def ota_check(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    r = await session.execute(
        select(FirmwareVersion)
        .where(FirmwareVersion.is_active.is_(True))
        .order_by(FirmwareVersion.id.desc())
        .limit(1)
    )
    fw = r.scalars().first()
    if not fw:
        return ok({"update_available": False})
    current = dev.fw_version or "0.0.0"
    return ok(
        {
            "update_available": fw.version != current,
            "current_version": current,
            "latest": {
                "version": fw.version,
                "url": fw.file_url,
                "md5": fw.file_md5,
                "size": fw.file_size,
                "release_notes": fw.release_notes,
            },
        }
    )
