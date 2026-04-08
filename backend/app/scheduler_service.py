from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, text
from app.config import get_settings
from app.db import SessionLocal
from app.models import Device, DeviceSchedule
from app.command_service import publish_relay_set
from app.runtime import mqtt_bridge

logger = logging.getLogger(__name__)


def spring_cron_to_trigger(expr: str) -> CronTrigger:
    parts = expr.split()
    if len(parts) != 6:
        raise ValueError("cron_expr must be 6 fields: second minute hour day month day_of_week")
    sec, minute, hour, day, month, dow = parts
    return CronTrigger(second=sec, minute=minute, hour=hour, day=day, month=month, day_of_week=dow)


async def offline_sweep_fixed() -> None:
    """Mark offline if last_seen older than grace (UTC)."""
    s = get_settings()
    grace = s.online_grace_seconds
    async with SessionLocal() as db:
        await db.execute(
            text(
                """
                UPDATE devices
                SET online = 0, updated_at = UTC_TIMESTAMP()
                WHERE online = 1
                  AND (
                    last_seen_at IS NULL
                    OR last_seen_at < (UTC_TIMESTAMP() - INTERVAL :sec SECOND)
                  )
                """
            ),
            {"sec": grace},
        )
        await db.commit()


async def command_timeout_sweep() -> None:
    s = get_settings()
    sec = s.command_ack_timeout_seconds
    async with SessionLocal() as db:
        await db.execute(
            text(
                """
                UPDATE command_records
                SET status = 'timeout', ack_at = UTC_TIMESTAMP()
                WHERE status = 'pending'
                  AND created_at < (UTC_TIMESTAMP() - INTERVAL :sec SECOND)
                """
            ),
            {"sec": sec},
        )
        await db.commit()


async def fire_schedule_job(schedule_id: str) -> None:
    m = mqtt_bridge
    if not m:
        logger.warning("MQTT not ready; skip schedule %s", schedule_id)
        return
    async with SessionLocal() as db:
        sch = await db.get(DeviceSchedule, schedule_id)
        if not sch or not sch.enabled:
            return
        dev = await db.get(Device, sch.device_id)
        if not dev:
            return
        on = sch.action == "relay_on"
        try:
            await publish_relay_set(
                db,
                m,
                dev,
                on,
                source="schedule",
                user_id=sch.user_id,
            )
        except Exception:
            logger.exception("schedule fire failed %s", schedule_id)


async def reload_schedule_jobs(scheduler: AsyncIOScheduler) -> None:
    for j in list(scheduler.get_jobs()):
        jid = getattr(j, "id", None)
        if jid and str(jid).startswith("sch_"):
            scheduler.remove_job(jid)

    async with SessionLocal() as db:
        rows = (await db.execute(select(DeviceSchedule).where(DeviceSchedule.enabled == 1))).scalars().all()
        for sch in rows:
            try:
                trig = spring_cron_to_trigger(sch.cron_expr)
            except Exception as e:
                logger.warning("bad cron %s for %s: %s", sch.cron_expr, sch.id, e)
                continue
            scheduler.add_job(
                fire_schedule_job,
                trigger=trig,
                args=[sch.id],
                id=f"sch_{sch.id}",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )


async def _reload_tick(scheduler: AsyncIOScheduler) -> None:
    await reload_schedule_jobs(scheduler)


def schedule_periodic_tasks(scheduler: AsyncIOScheduler) -> None:
    scheduler.add_job(offline_sweep_fixed, "interval", seconds=1.5, id="offline_sweep", replace_existing=True)
    scheduler.add_job(command_timeout_sweep, "interval", seconds=10, id="cmd_timeout", replace_existing=True)
    scheduler.add_job(
        _reload_tick,
        "interval",
        seconds=60,
        args=[scheduler],
        id="reload_schedules",
        replace_existing=True,
    )


async def initial_reload(scheduler: AsyncIOScheduler) -> None:
    await reload_schedule_jobs(scheduler)
