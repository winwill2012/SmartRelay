from datetime import time
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Schedule


async def next_schedule_revision(session: AsyncSession, device_pk: int) -> int:
    r = await session.execute(select(func.coalesce(func.max(Schedule.id), 0)).where(Schedule.device_id == device_pk))
    v = r.scalar_one()
    return int(v)


async def build_schedules_payload(session: AsyncSession, device_pk: int) -> tuple[int, list[dict[str, Any]]]:
    rev = await next_schedule_revision(session, device_pk)
    r = await session.execute(select(Schedule).where(Schedule.device_id == device_pk).order_by(Schedule.id))
    rows = r.scalars().all()
    schedules: list[dict[str, Any]] = []
    for s in rows:
        tl: time = s.time_local
        hhmm = tl.strftime("%H:%M")
        item: dict[str, Any] = {
            "id": s.id,
            "name": s.name,
            "repeat_type": s.repeat_type.value,
            "time_local": hhmm,
            "weekdays": s.weekdays,
            "monthdays": s.monthdays,
            "action": s.action.value,
            "enabled": bool(s.enabled),
        }
        schedules.append(item)
    return rev, schedules
