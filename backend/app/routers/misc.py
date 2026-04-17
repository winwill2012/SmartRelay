from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import desc, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.db import get_session
from app.deps import get_current_user_id
from app.errors import FORBIDDEN, NOT_FOUND, PARAM_ERROR
from app.models import Device, DeviceShareToken, ShareStatus, User, UserDevice, UserDeviceRole, UserNotification
from app.response import err, ok

router = APIRouter()

STATUS_TEXT = {
    "pending": "待接受",
    "accepted": "已接受",
    "revoked": "已取消",
    "expired": "已过期",
}


@router.get("/notifications")
async def list_notifications(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(
        select(UserNotification)
        .where(UserNotification.user_id == user_id)
        .order_by(UserNotification.created_at.desc())
        .limit(100)
    )
    items = []
    for n in r.scalars().all():
        items.append(
            {
                "id": n.id,
                "category": n.category,
                "title": n.title,
                "body": n.body,
                "extra": n.extra,
                "read": n.is_read,
                "created_at": n.created_at.strftime("%Y-%m-%d %H:%M:%S")
                if n.created_at
                else "",
            }
        )
    return ok({"items": items})


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == user_id,
        )
    )
    n = r.scalar_one_or_none()
    if not n:
        return err(NOT_FOUND, "通知不存在")
    n.is_read = True
    await session.commit()
    return ok({})


@router.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: int,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == user_id,
        )
    )
    n = r.scalar_one_or_none()
    if not n:
        return err(NOT_FOUND, "通知不存在")
    await session.delete(n)
    await session.commit()
    return ok({})


@router.get("/shares")
async def shares(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now()
    TargetUser = aliased(User)
    OwnerUser = aliased(User)
    r = await session.execute(
        select(DeviceShareToken, Device, TargetUser, OwnerUser)
        .join(Device, Device.id == DeviceShareToken.device_id)
        .outerjoin(TargetUser, TargetUser.id == DeviceShareToken.target_user_id)
        .join(OwnerUser, OwnerUser.id == DeviceShareToken.owner_user_id)
        .where(
            or_(
                DeviceShareToken.owner_user_id == user_id,
                DeviceShareToken.target_user_id == user_id,
            )
        )
        .order_by(desc(DeviceShareToken.id))
        .limit(200)
    )
    rows = r.all()
    device_pk_set = {int(dev.id) for _, dev, _, _ in rows}
    name_by_device_pk: dict[int, str] = {}
    if device_pk_set:
        r_name = await session.execute(
            select(UserDevice).where(
                UserDevice.user_id == user_id,
                UserDevice.device_id.in_(device_pk_set),
            )
        )
        for ud in r_name.scalars().all():
            nm = (ud.remark or "").strip()
            if nm:
                name_by_device_pk[int(ud.device_id)] = nm

    owner_pairs = {(int(st.owner_user_id), int(dev.id)) for st, dev, _, _ in rows}
    owner_remark_map: dict[tuple[int, int], str] = {}
    if owner_pairs:
        r_own = await session.execute(
            select(UserDevice.user_id, UserDevice.device_id, UserDevice.remark).where(
                tuple_(UserDevice.user_id, UserDevice.device_id).in_(list(owner_pairs))
            )
        )
        for ouid, did, rem in r_own.all():
            nm = (rem or "").strip()
            if nm:
                owner_remark_map[(int(ouid), int(did))] = nm

    items = []
    owner_dedupe: dict[tuple[str, int], dict] = {}
    for st, dev, target_user, owner_user in rows:
        status = st.status.value
        if status == ShareStatus.pending.value and st.expires_at and st.expires_at < now:
            status = ShareStatus.expired.value
        role = "owner" if st.owner_user_id == user_id else "target"
        target_nickname = (target_user.nickname.strip() if target_user and target_user.nickname else "") or None
        target_display_name = target_nickname or (
            f"用户{st.target_user_id}" if st.target_user_id else "待接受"
        )
        owner_nickname = (owner_user.nickname.strip() if owner_user and owner_user.nickname else "") or None
        owner_display_name = owner_nickname or f"用户{st.owner_user_id}"
        device_display_name = (
            name_by_device_pk.get(int(dev.id))
            or owner_remark_map.get((int(st.owner_user_id), int(dev.id)))
            or dev.device_id
        )
        item = {
            "id": st.id,
            "device_id": dev.device_id,
            "device_name": device_display_name,
            "device_display_name": device_display_name,
            "role": role,
            "status": status,
            "status_text": STATUS_TEXT.get(status, status),
            "target_user_id": st.target_user_id,
            "target_nickname": target_nickname,
            "target_display_name": target_display_name,
            "owner_display_name": owner_display_name,
            "created_at": st.created_at.isoformat() if st.created_at else None,
            "expires_at": st.expires_at.isoformat() if st.expires_at else None,
            "accepted_at": st.accepted_at.isoformat() if st.accepted_at else None,
        }
        if role == "owner":
            # 同设备同被分享者只保留最新一条，避免记录重复刷屏
            dedupe_key = (dev.device_id, int(st.target_user_id or 0))
            old = owner_dedupe.get(dedupe_key)
            if not old or int(item["id"]) > int(old["id"]):
                owner_dedupe[dedupe_key] = item
        else:
            items.append(item)
    owner_items = sorted(owner_dedupe.values(), key=lambda x: int(x["id"]), reverse=True)
    final_items = owner_items + items
    return ok({"items": final_items})


@router.post("/shares/accept")
async def accept_share(
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    token = str((payload or {}).get("share_token") or "").strip()
    if not token:
        return err(PARAM_ERROR, "缺少分享令牌")

    r = await session.execute(
        select(DeviceShareToken, Device).join(Device, Device.id == DeviceShareToken.device_id).where(
            DeviceShareToken.share_token == token
        )
    )
    row = r.first()
    if not row:
        return err(NOT_FOUND, "分享链接不存在或已失效")
    st, dev = row
    now = datetime.now()

    if st.owner_user_id == user_id:
        return err(FORBIDDEN, "不能接受自己分享的设备")

    status = st.status.value
    if status == ShareStatus.revoked.value:
        return err(FORBIDDEN, "分享已取消")
    if status == ShareStatus.expired.value:
        return err(FORBIDDEN, "分享已过期")
    if st.expires_at and st.expires_at < now:
        st.status = ShareStatus.expired
        await session.commit()
        return err(FORBIDDEN, "分享已过期")

    if st.status == ShareStatus.accepted and st.target_user_id == user_id:
        return ok({"device_id": dev.device_id, "already_accepted": True})
    if st.status == ShareStatus.accepted and st.target_user_id and st.target_user_id != user_id:
        return err(FORBIDDEN, "该分享已被其他用户接受")

    r_ud = await session.execute(
        select(UserDevice).where(UserDevice.user_id == user_id, UserDevice.device_id == dev.id)
    )
    ud = r_ud.scalar_one_or_none()
    if not ud:
        session.add(
            UserDevice(
                user_id=user_id,
                device_id=dev.id,
                remark="",
                role=UserDeviceRole.shared,
                created_at=now,
            )
        )
    st.target_user_id = user_id
    st.status = ShareStatus.accepted
    st.accepted_at = now
    await session.commit()
    return ok({"device_id": dev.device_id, "accepted": True})


@router.delete("/shares/{share_id}")
async def revoke_share(
    share_id: int,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(DeviceShareToken).where(DeviceShareToken.id == share_id))
    st = r.scalar_one_or_none()
    if not st:
        return err(NOT_FOUND, "分享记录不存在")
    if st.owner_user_id != user_id and st.target_user_id != user_id:
        return err(FORBIDDEN, "无权限操作该分享")

    # 取消分享后直接删除记录，避免列表残留历史条目。
    if st.owner_user_id == user_id:
        if st.target_user_id:
            await session.execute(
                UserDevice.__table__.delete().where(
                    UserDevice.user_id == st.target_user_id,
                    UserDevice.device_id == st.device_id,
                    UserDevice.role == UserDeviceRole.shared,
                )
            )
    else:
        await session.execute(
            UserDevice.__table__.delete().where(
                UserDevice.user_id == user_id,
                UserDevice.device_id == st.device_id,
                UserDevice.role == UserDeviceRole.shared,
            )
        )
    await session.delete(st)
    await session.commit()
    return ok({"id": share_id})
