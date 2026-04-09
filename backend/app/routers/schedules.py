from datetime import datetime, time as dt_time
from typing import Optional, Tuple

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.command_service import new_cmd_id
from app.db import get_session
from app.deps import get_current_user_id
from app.errors import NOT_FOUND, PARAM_ERROR
from app.models import Device, RepeatType, Schedule, ScheduleAction, UserDevice
from app.mqtt_service import mqtt_publisher
from app.response import err, ok
from app.schedule_sync import build_schedules_payload
from app.schemas import SchedulePatchBody

router = APIRouter()


async def _schedule_device(
    session: AsyncSession, user_id: int, schedule_id: int
) -> Optional[Tuple[Schedule, Device]]:
    r = await session.execute(select(Schedule).where(Schedule.id == schedule_id))
    s = r.scalar_one_or_none()
    if not s:
        return None
    r2 = await session.execute(
        select(UserDevice, Device)
        .join(Device, Device.id == UserDevice.device_id)
        .where(UserDevice.user_id == user_id, UserDevice.device_id == s.device_id)
    )
    row = r2.first()
    if not row:
        return None
    _, dev = row
    return s, dev


@router.patch("/schedules/{schedule_id}")
async def patch_schedule(
    schedule_id: int,
    body: SchedulePatchBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _schedule_device(session, user_id, schedule_id)
    if not pair:
        return err(NOT_FOUND, "定时任务不存在")
    s, dev = pair
    if body.name is not None:
        s.name = body.name
    if body.repeat_type is not None:
        s.repeat_type = RepeatType(body.repeat_type)
    if body.time_local is not None:
        try:
            hh, mm = body.time_local.split(":")
            s.time_local = dt_time(int(hh), int(mm))
        except ValueError:
            return err(PARAM_ERROR, "time_local 格式错误")
    if body.weekdays is not None:
        s.weekdays = body.weekdays
    if body.monthdays is not None:
        s.monthdays = body.monthdays
    if body.action is not None:
        s.action = ScheduleAction(body.action)
    if body.enabled is not None:
        s.enabled = body.enabled
    await session.commit()

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


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    pair = await _schedule_device(session, user_id, schedule_id)
    if not pair:
        return err(NOT_FOUND, "定时任务不存在")
    s, dev = pair
    await session.execute(delete(Schedule).where(Schedule.id == s.id))
    await session.commit()

    rev, schedules = await build_schedules_payload(session, dev.id)
    mqtt_body = {
        "cmd_id": new_cmd_id(),
        "ts": int(datetime.now().timestamp() * 1000),
        "type": "schedule.sync",
        "version": 1,
        "payload": {"revision": rev, "schedules": schedules},
    }
    await mqtt_publisher.publish_json(f"sr/v1/device/{dev.device_id}/cmd", mqtt_body, qos=1)
    return ok({"id": schedule_id})
