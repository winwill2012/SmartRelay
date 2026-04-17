import logging
import secrets
import time
from datetime import datetime, time as dt_time, timedelta
from typing import Any, Optional
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.command_service import (
    find_existing_cmd_by_client_id,
    get_command_status,
    insert_command_sent,
    new_cmd_id,
)
from app.db import get_session
from app.deps import get_current_user_id
from app.errors import CONFLICT, DEVICE_OFFLINE, FORBIDDEN, NOT_FOUND, PARAM_ERROR
from app.models import (
    Device,
    DeviceShareToken,
    DeviceOperationLog,
    FirmwareVersion,
    LogSource,
    RepeatType,
    Schedule,
    ScheduleAction,
    User,
    UserDevice,
    UserDeviceRole,
    ShareStatus,
)
from app.mqtt_service import clear_ota_progress_state, mqtt_publisher
from app.response import err, ok
from app.schedule_sync import build_schedules_payload
from app.schemas import BindBody, CommandBody, PatchDeviceBody, ScheduleCreateBody, ShareBody
from app.security import verify_password
from app.utils import device_is_online

logger = logging.getLogger(__name__)
router = APIRouter()

_SHARE_STATUS_TEXT = {
    "pending": "待接受",
    "accepted": "已接受",
    "revoked": "已取消",
    "expired": "已过期",
}


def _sanitize_ota_url(raw: str) -> str:
    s = (raw or "").strip().strip("'").strip('"')
    s = "".join(ch for ch in s if " " <= ch <= "~")
    if s.startswith("//"):
        s = f"https:{s}"
    if "://" not in s and s:
        s = f"https://{s}"
    if not s:
        return s
    p = urlsplit(s)
    scheme = (p.scheme or "https").lower()
    netloc = p.netloc
    path = p.path or "/"
    if "?" in netloc:
        netloc = netloc.split("?")[-1]
    while netloc and not netloc[0].isalnum():
        netloc = netloc[1:]
    low = path.lower()
    idx = low.find(".bin")
    if idx >= 0:
        path = path[: idx + 4]
    return urlunsplit((scheme, netloc, path, p.query, ""))


async def _execute_ota_firmware_push(
    session: AsyncSession,
    *,
    dev: Device,
    user_id: int,
    client_cmd_id: Optional[str],
) -> dict[str, Any]:
    """向 MQTT `sr/v1/device/{id}/ota` 下发 ota.start；固件不订阅 cmd 主题处理 OTA。"""
    r = await session.execute(
        select(FirmwareVersion)
        .where(FirmwareVersion.is_active.is_(True))
        .order_by(FirmwareVersion.id.desc())
        .limit(1)
    )
    fw = r.scalars().first()
    if not fw:
        return err(PARAM_ERROR, "暂无已启用的固件版本")
    current = dev.fw_version or "0.0.0"
    if fw.version == current:
        return err(PARAM_ERROR, "当前已是最新版本")

    cmd_id = new_cmd_id()
    ota_url = _sanitize_ota_url(fw.file_url)
    payload: dict[str, Any] = {
        "version": fw.version,
        "url": ota_url,
        "md5": fw.file_md5,
        "size": int(fw.file_size),
    }
    mqtt_body = {
        "cmd_id": cmd_id,
        "ts": int(datetime.now().timestamp() * 1000),
        "type": "ota.start",
        "version": 1,
        "payload": payload,
    }
    topic = f"sr/v1/device/{dev.device_id}/ota"
    await clear_ota_progress_state(session, dev)
    await insert_command_sent(
        session,
        device_pk=dev.id,
        user_id=user_id,
        cmd_id=cmd_id,
        cmd_type="ota.start",
        payload=payload,
        client_cmd_id=client_cmd_id,
        source=LogSource.user,
    )
    await mqtt_publisher.publish_json(topic, mqtt_body, qos=1)
    return ok({"cmd_id": cmd_id, "target_version": fw.version})


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


async def _get_owner_device(
    session: AsyncSession, user_id: int, device_id_str: str
) -> Optional[tuple[UserDevice, Device]]:
    pair = await _get_user_device(session, user_id, device_id_str)
    if not pair:
        return None
    ud, dev = pair
    if ud.role != UserDeviceRole.owner:
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
        return err(NOT_FOUND, "设备正在初始化，请稍候")

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
                "设备正在初始化，请稍候",
            )

    ud = UserDevice(
        user_id=user_id,
        device_id=dev.id,
        remark=body.name or "",
        role=UserDeviceRole.owner,
        created_at=datetime.now(),
    )
    session.add(ud)
    dev.last_seen_at = datetime.now()
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
    if ud.role == UserDeviceRole.owner:
        # 所有者解绑：仅移除自己的 owner 绑定
        await session.execute(delete(UserDevice).where(UserDevice.id == ud.id))
        await session.commit()
        return ok({"device_id": dev.device_id, "action": "unbind_owner"})

    # 被分享者结束分享：移除 shared 绑定，并删除分享令牌记录（分享管理两侧列表同步消失）
    await session.execute(
        delete(DeviceShareToken).where(
            DeviceShareToken.device_id == dev.id,
            DeviceShareToken.target_user_id == user_id,
        )
    )
    await session.execute(delete(UserDevice).where(UserDevice.id == ud.id))
    await session.commit()
    return ok({"device_id": dev.device_id, "action": "leave_share"})


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
    ud, dev = pair
    if not device_is_online(dev.last_seen_at):
        return err(DEVICE_OFFLINE, "设备离线")

    if body.client_cmd_id:
        existing = await find_existing_cmd_by_client_id(session, dev.id, body.client_cmd_id)
        if existing:
            return ok({"cmd_id": existing})

    if body.type == "ota.start":
        if ud.role != UserDeviceRole.owner:
            return err(FORBIDDEN, "仅设备拥有者可执行固件更新")
        return await _execute_ota_firmware_push(
            session, dev=dev, user_id=user_id, client_cmd_id=body.client_cmd_id
        )

    cmd_id = new_cmd_id()
    payload: dict[str, Any] = {}
    if body.type == "relay.set":
        if body.payload and "on" in body.payload:
            payload = {"on": bool(body.payload["on"])}
        else:
            payload = {"on": True}
    else:
        payload = {}

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
async def create_share(
    device_id: str,
    body: ShareBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_owner_device(session, user_id, device_id)
    if not pair:
        return err(FORBIDDEN, "仅设备所有者可分享")
    _, dev = pair
    now = datetime.now()
    expires_hours = int(body.expires_hours or 72)
    expires_at = now + timedelta(hours=expires_hours)

    # 同设备未过期待分享令牌复用，避免重复点击导致大量 pending 记录。
    existing_r = await session.execute(
        select(DeviceShareToken)
        .where(
            DeviceShareToken.owner_user_id == user_id,
            DeviceShareToken.device_id == dev.id,
            DeviceShareToken.status == ShareStatus.pending,
            DeviceShareToken.target_user_id.is_(None),
        )
        .order_by(DeviceShareToken.id.desc())
        .limit(1)
    )
    existing = existing_r.scalar_one_or_none()
    if existing and (not existing.expires_at or existing.expires_at > now):
        share_entry = f"/pages/shares/shares?share_token={existing.share_token}&device_id={dev.device_id}"
        share_path = f"/pages/login/login?redirect={quote(share_entry, safe='')}"
        return ok(
            {
                "share_id": existing.id,
                "share_token": existing.share_token,
                "share_path": share_path,
                "device_id": dev.device_id,
                "device_name": dev.device_id,
                "expires_at": existing.expires_at.isoformat() if existing.expires_at else None,
                "status": "pending",
            }
        )

    token = secrets.token_urlsafe(24)

    share = DeviceShareToken(
        owner_user_id=user_id,
        target_user_id=None,
        device_id=dev.id,
        share_token=token,
        status=ShareStatus.pending,
        created_at=now,
        expires_at=expires_at,
        accepted_at=None,
        revoked_at=None,
    )
    session.add(share)
    await session.commit()
    await session.refresh(share)

    share_entry = f"/pages/shares/shares?share_token={token}&device_id={dev.device_id}"
    share_path = f"/pages/login/login?redirect={quote(share_entry, safe='')}"
    return ok(
        {
            "share_id": share.id,
            "share_token": token,
            "share_path": share_path,
            "device_id": dev.device_id,
            "device_name": dev.device_id,
            "expires_at": expires_at.isoformat(),
            "status": "pending",
        }
    )


@router.get("/devices/{device_id}/shares")
async def list_device_shares(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """设备所有者查看本设备分享给了哪些用户（去重：同一被分享者只保留最新一条）。"""
    pair = await _get_owner_device(session, user_id, device_id)
    if not pair:
        return err(FORBIDDEN, "仅设备所有者可查看分享")
    _, dev = pair
    now = datetime.now()
    udr = await session.execute(
        select(UserDevice).where(UserDevice.user_id == user_id, UserDevice.device_id == dev.id)
    )
    ud_row = udr.scalar_one_or_none()
    owner_remark = ((ud_row.remark or "").strip()) if ud_row else ""
    device_display_name = owner_remark or dev.device_id

    # 含「微信已发起、对方未接受」：pending 且无 target_user_id，与已接受记录一并展示；同设备无被分享者的多条 pending 去重为最新一条（dedupe_key=0）。
    r = await session.execute(
        select(DeviceShareToken, User)
        .outerjoin(User, User.id == DeviceShareToken.target_user_id)
        .where(DeviceShareToken.device_id == dev.id)
        .order_by(desc(DeviceShareToken.id))
        .limit(200)
    )
    rows = r.all()
    dedupe: dict[int, dict[str, Any]] = {}
    for st, target_user in rows:
        status = st.status.value
        if status == ShareStatus.pending.value and st.expires_at and st.expires_at < now:
            status = ShareStatus.expired.value

        if st.target_user_id is None:
            if status == ShareStatus.pending.value:
                target_display_name = "待接收"
                status_text = "待接收"
            else:
                target_display_name = "—"
                status_text = _SHARE_STATUS_TEXT.get(status, status)
        else:
            target_nickname = (target_user.nickname.strip() if target_user and target_user.nickname else "") or None
            target_display_name = target_nickname or f"用户{st.target_user_id}"
            status_text = _SHARE_STATUS_TEXT.get(status, status)

        item: dict[str, Any] = {
            "id": st.id,
            "device_id": dev.device_id,
            "device_display_name": device_display_name,
            "target_user_id": st.target_user_id,
            "target_display_name": target_display_name,
            "status": status,
            "status_text": status_text,
            "created_at": st.created_at.isoformat() if st.created_at else None,
            "expires_at": st.expires_at.isoformat() if st.expires_at else None,
            "accepted_at": st.accepted_at.isoformat() if st.accepted_at else None,
        }
        dedupe_key = int(st.target_user_id or 0)
        old = dedupe.get(dedupe_key)
        if not old or int(item["id"]) > int(old["id"]):
            dedupe[dedupe_key] = item
    final_items = sorted(dedupe.values(), key=lambda x: int(x["id"]), reverse=True)
    return ok({"items": final_items})


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


@router.post("/devices/{device_id}/ota/start")
async def ota_start(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """与 `POST .../command` + `type=ota.start` 等价；保留独立路径便于部分网关只转发显式 OTA URL。"""
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    ud, dev = pair
    if ud.role != UserDeviceRole.owner:
        return err(FORBIDDEN, "仅设备拥有者可执行固件更新")
    if not device_is_online(dev.last_seen_at):
        return err(DEVICE_OFFLINE, "设备离线")
    return await _execute_ota_firmware_push(session, dev=dev, user_id=user_id, client_cmd_id=None)


@router.get("/devices/{device_id}/ota/progress")
async def ota_progress_poll(
    device_id: str,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _get_user_device(session, user_id, device_id)
    if not pair:
        return err(NOT_FOUND, "未找到设备")
    _, dev = pair
    r = await session.execute(
        select(
            Device.ota_progress_percent,
            Device.ota_progress_phase,
            Device.ota_progress_ts_ms,
        ).where(Device.id == dev.id)
    )
    row = r.one()
    pct, phase, ts_ms = row[0], row[1], row[2]
    empty = (pct is None) and (ts_ms is None) and (not (phase or "").strip())
    if empty:
        return ok({"active": False, "percent": None, "phase": None, "ts": None})
    # ota_progress_ts_ms 为服务端写入进度时的 Unix 毫秒，用于过期清理
    if isinstance(ts_ms, (int, float)) and ts_ms > 0 and (time.time() * 1000 - ts_ms) > 600_000:
        return ok({"active": False, "percent": None, "phase": None, "ts": None})
    return ok(
        {
            "active": True,
            "percent": int(pct) if pct is not None else None,
            "phase": (phase or "") if phase else "",
            "ts": ts_ms,
        }
    )
