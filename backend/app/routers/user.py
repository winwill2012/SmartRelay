import os
import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.deps import get_current_user_id
from app.errors import PARAM_ERROR
from app.models import Schedule, User, UserDevice
from app.response import err, ok
from app.schemas import PatchUserBody

router = APIRouter()


@router.get("/user/me")
async def me(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    r = await session.execute(select(User).where(User.id == user_id))
    user = r.scalar_one()
    c_dev = await session.execute(
        select(func.count()).select_from(UserDevice).where(UserDevice.user_id == user_id)
    )
    device_count = int(c_dev.scalar_one() or 0)

    dev_ids = select(UserDevice.device_id).where(UserDevice.user_id == user_id)
    c_sched = await session.execute(
        select(func.count())
        .select_from(Schedule)
        .where(Schedule.device_id.in_(dev_ids), Schedule.enabled.is_(True))
    )
    schedule_count = int(c_sched.scalar_one() or 0)

    return ok(
        {
            "id": user.id,
            "openid": user.openid,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "device_count": device_count,
            "schedule_count": schedule_count,
            "stats": {"device_count": device_count, "schedule_count": schedule_count},
        }
    )


_AVATAR_MAX_BYTES = 2 * 1024 * 1024


@router.post("/user/me/avatar")
async def upload_avatar(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
):
    """
    小程序 chooseAvatar 得到本地临时文件后 wx.uploadFile 到此接口；
    存静态文件并返回可长期访问的 URL（勿再使用 getUserProfile 返回的临时微信 CDN 链）。
    """
    raw = await file.read()
    if len(raw) > _AVATAR_MAX_BYTES:
        return err(PARAM_ERROR, "头像文件过大（最大 2MB）")
    if len(raw) < 8:
        return err(PARAM_ERROR, "无效图片")
    # 简单魔数校验
    is_png = raw[:8] == b"\x89PNG\r\n\x1a\n"
    is_jpeg = raw[:2] == b"\xff\xd8"
    is_webp = len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    if not (is_png or is_jpeg or is_webp):
        return err(PARAM_ERROR, "仅支持 PNG / JPEG / WebP")

    ext = ".png" if is_png else ".webp" if is_webp else ".jpg"
    settings = get_settings()
    sub = os.path.join(settings.upload_dir, "avatars")
    os.makedirs(sub, exist_ok=True)
    fname = f"{user_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(sub, fname)
    with open(path, "wb") as f:
        f.write(raw)

    base = settings.public_base_url.rstrip("/")
    public_url = f"{base}/static/firmware/avatars/{fname}"

    r = await session.execute(select(User).where(User.id == user_id))
    user = r.scalar_one()
    user.avatar_url = public_url[:512]
    await session.commit()
    await session.refresh(user)
    return ok({"avatar_url": public_url})


@router.patch("/user/me")
async def patch_me(
    body: PatchUserBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return err(PARAM_ERROR, "请至少提供 nickname 或 avatar_url 之一")
    r = await session.execute(select(User).where(User.id == user_id))
    user = r.scalar_one()
    if "nickname" in patch:
        raw = patch.get("nickname")
        user.nickname = (str(raw).strip() or None)[:64] if raw is not None else None
    if "avatar_url" in patch:
        raw = patch.get("avatar_url")
        user.avatar_url = (str(raw).strip() or None)[:512] if raw is not None else None
    await session.commit()
    await session.refresh(user)
    c_dev = await session.execute(
        select(func.count()).select_from(UserDevice).where(UserDevice.user_id == user_id)
    )
    device_count = int(c_dev.scalar_one() or 0)
    dev_ids = select(UserDevice.device_id).where(UserDevice.user_id == user_id)
    c_sched = await session.execute(
        select(func.count())
        .select_from(Schedule)
        .where(Schedule.device_id.in_(dev_ids), Schedule.enabled.is_(True))
    )
    schedule_count = int(c_sched.scalar_one() or 0)
    return ok(
        {
            "id": user.id,
            "openid": user.openid,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "device_count": device_count,
            "schedule_count": schedule_count,
            "stats": {"device_count": device_count, "schedule_count": schedule_count},
        }
    )
