from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CommandRecord, Device, DeviceOperationLog
from app.mqtt_bridge import MqttBridge
from app.timeutil import utc_now_naive


def new_cmd_id() -> str:
    return str(uuid.uuid4())


def iso_utc_now() -> str:
    from datetime import UTC

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def publish_relay_set(
    db: AsyncSession,
    mqtt: MqttBridge,
    device: Device,
    on: bool,
    source: str,
    user_id: str | None,
    trace_id: str | None = None,
) -> str:
    cmd_id = new_cmd_id()
    issued = iso_utc_now()
    body: dict[str, Any] = {
        "ver": "1",
        "cmd_id": cmd_id,
        "type": "relay_set",
        "payload": {"on": on},
        "issued_at": issued,
        "source": source,
    }
    if trace_id:
        body["trace_id"] = trace_id

    rec = CommandRecord(
        cmd_id=cmd_id,
        device_id=device.id,
        status="pending",
        payload_json=body,
        created_at=utc_now_naive(),
        ack_at=None,
    )
    db.add(rec)
    await db.flush()

    mqtt.publish_cmd(device.device_sn, body)

    log = DeviceOperationLog(
        device_id=device.id,
        user_id=user_id,
        source=source,
        action="relay_on" if on else "relay_off",
        cmd_id=cmd_id,
        detail_json={"on": on},
        created_at=utc_now_naive(),
    )
    db.add(log)
    await db.commit()
    return cmd_id
