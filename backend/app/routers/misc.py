from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_current_user_id
from app.errors import NOT_FOUND
from app.models import UserNotification
from app.response import err, ok

router = APIRouter()


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
async def shares(_user_id: int = Depends(get_current_user_id)):
    return ok({"items": []})
