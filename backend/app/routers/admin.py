import hashlib
import os
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.deps import get_current_admin_id
from app.errors import CONFLICT, NOT_FOUND, PARAM_ERROR, UNAUTHORIZED
from app.models import (
    AdminUser,
    Device,
    DeviceOperationLog,
    FirmwareVersion,
    User,
    UserDevice,
)
from app.response import err, ok
from app.schemas import AdminLoginBody, AdminPasswordBody, FirmwarePatchBody
from app.security import create_access_token, hash_password, verify_password
from app.utils import device_is_online

router = APIRouter(prefix="/admin")


@router.post("/auth/login")
async def admin_login(body: AdminLoginBody, session: AsyncSession = Depends(get_session)):
    r = await session.execute(select(AdminUser).where(AdminUser.username == body.username))
    admin = r.scalar_one_or_none()
    if not admin or not verify_password(body.password, admin.password_hash):
        return err(UNAUTHORIZED, "用户名或密码错误")
    settings = get_settings()
    token = create_access_token(
        str(admin.id),
        token_type="admin",
        expires_minutes=settings.admin_jwt_expire_minutes,
    )
    return ok(
        {
            "access_token": token,
            "admin_access_token": token,
            "expires_in": settings.admin_jwt_expire_minutes * 60,
            "admin": {"id": admin.id, "username": admin.username},
        }
    )


@router.post("/auth/password")
async def admin_password(
    body: AdminPasswordBody,
    admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = r.scalar_one()
    if not verify_password(body.old_password, admin.password_hash):
        return err(PARAM_ERROR, "原密码错误")
    admin.password_hash = hash_password(body.new_password)
    await session.commit()
    return ok({})


@router.get("/dashboard/metrics")
async def dashboard_metrics(
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
):
    settings = get_settings()
    uc = await session.execute(select(func.count()).select_from(User))
    user_count = int(uc.scalar_one() or 0)
    dc = await session.execute(select(func.count()).select_from(Device))
    device_count = int(dc.scalar_one() or 0)

    thr = datetime.now() - timedelta(seconds=settings.device_offline_seconds)
    oc = await session.execute(select(func.count()).select_from(Device).where(Device.last_seen_at >= thr))
    online_count = int(oc.scalar_one() or 0)

    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    cmd_c = await session.execute(
        select(func.count())
        .select_from(DeviceOperationLog)
        .where(DeviceOperationLog.action == "command.sent", DeviceOperationLog.created_at >= start)
    )
    cmd_today = int(cmd_c.scalar_one() or 0)

    return ok(
        {
            "user_count": user_count,
            "device_count": device_count,
            "online_count": online_count,
            "commands_today": cmd_today,
        }
    )


@router.get("/users")
async def admin_users(
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    off = (page - 1) * page_size
    r = await session.execute(select(User).order_by(User.id.desc()).offset(off).limit(page_size))
    rows = r.scalars().all()
    tc = await session.execute(select(func.count()).select_from(User))
    total = int(tc.scalar_one() or 0)
    items = []
    for u in rows:
        c = await session.execute(
            select(func.count()).select_from(UserDevice).where(UserDevice.user_id == u.id)
        )
        items.append(
            {
                "id": u.id,
                "openid": u.openid,
                "nickname": u.nickname,
                "created_at": u.created_at.isoformat(),
                "device_bindings": int(c.scalar_one() or 0),
            }
        )
    return ok({"items": items, "page": page, "page_size": page_size, "total": total})


@router.get("/users/{user_id}")
async def admin_user_detail(
    user_id: int,
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if not user:
        return err(NOT_FOUND, "用户不存在")
    r2 = await session.execute(
        select(UserDevice, Device)
        .join(Device, Device.id == UserDevice.device_id)
        .where(UserDevice.user_id == user_id)
    )
    pairs = r2.all()
    devices = []
    for ud, d in pairs:
        devices.append(
            {
                "device_id": d.device_id,
                "remark": ud.remark,
                "role": ud.role.value,
                "online": device_is_online(d.last_seen_at),
            }
        )
    return ok(
        {
            "id": user.id,
            "openid": user.openid,
            "nickname": user.nickname,
            "devices": devices,
        }
    )


@router.get("/devices")
async def admin_devices(
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    off = (page - 1) * page_size
    r = await session.execute(select(Device).order_by(Device.id.desc()).offset(off).limit(page_size))
    rows = r.scalars().all()
    tc = await session.execute(select(func.count()).select_from(Device))
    total = int(tc.scalar_one() or 0)
    items = []
    for d in rows:
        items.append(
            {
                "id": d.id,
                "device_id": d.device_id,
                "online": device_is_online(d.last_seen_at),
                "fw_version": d.fw_version,
                "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
                "mac": d.mac,
            }
        )
    return ok({"items": items, "page": page, "page_size": page_size, "total": total})


@router.get("/devices/{device_pk}")
async def admin_device_detail(
    device_pk: int,
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(Device).where(Device.id == device_pk))
    d = r.scalar_one_or_none()
    if not d:
        return err(NOT_FOUND, "设备不存在")
    r2 = await session.execute(select(UserDevice, User).join(User, User.id == UserDevice.user_id).where(UserDevice.device_id == d.id))
    pairs = r2.all()
    bindings = [{"user_id": u.id, "openid": u.openid, "remark": ud.remark, "role": ud.role.value} for ud, u in pairs]
    return ok(
        {
            "id": d.id,
            "device_id": d.device_id,
            "online": device_is_online(d.last_seen_at),
            "fw_version": d.fw_version,
            "mac": d.mac,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
            "bindings": bindings,
        }
    )


@router.get("/devices/{device_pk}/logs")
async def admin_device_logs(
    device_pk: int,
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    r = await session.execute(select(Device).where(Device.id == device_pk))
    if not r.scalar_one_or_none():
        return err(NOT_FOUND, "设备不存在")
    off = (page - 1) * page_size
    r2 = await session.execute(
        select(DeviceOperationLog)
        .where(DeviceOperationLog.device_id == device_pk)
        .order_by(DeviceOperationLog.id.desc())
        .offset(off)
        .limit(page_size)
    )
    rows = r2.scalars().all()
    tc = await session.execute(
        select(func.count()).select_from(DeviceOperationLog).where(DeviceOperationLog.device_id == device_pk)
    )
    total = int(tc.scalar_one() or 0)
    items = [
        {
            "id": x.id,
            "source": x.source.value,
            "action": x.action,
            "detail": x.detail,
            "created_at": x.created_at.isoformat(),
        }
        for x in rows
    ]
    return ok({"items": items, "page": page, "page_size": page_size, "total": total})


@router.post("/firmware")
async def admin_firmware_upload(
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
    version: str = Form(...),
    release_notes: Optional[str] = Form(None),
    is_active: bool = Form(True),
):
    settings = get_settings()
    raw = await file.read()
    if not raw:
        return err(PARAM_ERROR, "空文件")
    md5 = hashlib.md5(raw).hexdigest()
    safe_ver = "".join(c for c in version if c.isalnum() or c in ".-_")
    if not safe_ver:
        return err(PARAM_ERROR, "version 无效")
    base = os.path.join(settings.upload_dir, safe_ver)
    os.makedirs(base, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    fname = f"firmware{ext}"
    path = os.path.join(base, fname)
    with open(path, "wb") as f:
        f.write(raw)
    rel = f"/static/firmware/{safe_ver}/{fname}"
    file_url = f"{settings.public_base_url.rstrip('/')}{rel}"
    fw = FirmwareVersion(
        version=version[:32],
        file_url=file_url,
        file_md5=md5,
        file_size=len(raw),
        release_notes=release_notes,
        is_active=is_active,
        created_at=datetime.now(),
    )
    session.add(fw)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return err(CONFLICT, "版本号已存在或保存失败")
    await session.refresh(fw)
    return ok({"id": fw.id, "version": fw.version, "file_url": fw.file_url, "file_md5": md5})


@router.patch("/firmware/{fw_id}")
async def admin_firmware_patch(
    fw_id: int,
    body: FirmwarePatchBody,
    _admin_id: int = Depends(get_current_admin_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(FirmwareVersion).where(FirmwareVersion.id == fw_id))
    fw = r.scalar_one_or_none()
    if not fw:
        return err(NOT_FOUND, "固件记录不存在")
    if body.is_active is not None:
        await session.execute(update(FirmwareVersion).where(FirmwareVersion.id == fw_id).values(is_active=body.is_active))
        await session.commit()
    return ok({"id": fw.id, "is_active": body.is_active if body.is_active is not None else fw.is_active})
