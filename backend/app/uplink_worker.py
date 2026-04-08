from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CommandRecord, Device
from app.timeutil import utc_now_naive

logger = logging.getLogger(__name__)


async def handle_uplink_message(db: AsyncSession, item: dict[str, Any]) -> None:
    sn = item.get("device_sn") or ""
    uplink = item.get("uplink") or ""
    payload = item.get("payload") or {}
    dev = await db.scalar(select(Device).where(Device.device_sn == sn))
    if not dev:
        logger.debug("unknown device_sn=%s", sn)
        return

    now = utc_now_naive()

    if uplink == "telemetry":
        dev.last_seen_at = now
        dev.online = 1
        if "relay_on" in payload:
            dev.relay_state = 1 if bool(payload["relay_on"]) else 0
        dev.updated_at = now
        await db.commit()
        return

    if uplink == "ack":
        dev.last_seen_at = now
        dev.online = 1
        relay_on = payload.get("relay_on")
        if relay_on is not None:
            dev.relay_state = 1 if relay_on else 0
        dev.updated_at = now
        cmd_id = payload.get("cmd_id")
        success = payload.get("success")
        if cmd_id:
            rec = await db.scalar(select(CommandRecord).where(CommandRecord.cmd_id == cmd_id))
            if rec and rec.device_id == dev.id:
                if success:
                    rec.status = "acked"
                    rec.ack_at = now
                else:
                    rec.status = "failed"
                    rec.ack_at = now
        await db.commit()
        return

    if uplink == "event":
        dev.last_seen_at = now
        if payload.get("type") == "offline":
            dev.online = 0
        else:
            dev.online = 1
        dev.updated_at = now
        await db.commit()
        return

    logger.debug("ignored uplink=%s topic=%s", uplink, item.get("raw_topic"))
