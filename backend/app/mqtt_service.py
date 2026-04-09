import asyncio
import json
import logging
import re
import secrets
from datetime import datetime
from typing import Any, Optional

from asyncio_mqtt import Client
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import AsyncSessionLocal
from app.models import Device, DeviceOperationLog, LogSource
from app.command_service import cache_command_ack
from app.security import hash_password

logger = logging.getLogger(__name__)

# 已处理的 ack cmd_id，避免重复写库（进程内）
_processed_ack_cmd_ids: set[str] = set()
_ACK_DEDUP_MAX = 10_000

TOPIC_RE = re.compile(r"^sr/v1/device/([^/]+)/(report|ack|heartbeat|ota/progress)$")


def _parse_topic(topic: str) -> Optional[tuple[str, str]]:
    m = TOPIC_RE.match(topic)
    if not m:
        return None
    return m.group(1), m.group(2)


async def _touch_device_last_seen(session: AsyncSession, device_pk: int) -> None:
    now = datetime.now()
    await session.execute(update(Device).where(Device.id == device_pk).values(last_seen_at=now))
    await session.commit()


async def _find_device_by_string_id(session: AsyncSession, device_id: str) -> Optional[Device]:
    r = await session.execute(select(Device).where(Device.device_id == device_id))
    return r.scalar_one_or_none()


async def _get_or_create_device(session: AsyncSession, device_id_str: str) -> Device:
    """首次 MQTT 上行时自动建库，便于小程序免密钥绑定（密钥仅服务端随机保存）。"""
    dev = await _find_device_by_string_id(session, device_id_str)
    if dev:
        return dev
    now = datetime.now()
    rnd = secrets.token_urlsafe(32)
    dev = Device(
        device_id=device_id_str,
        device_secret_hash=hash_password(rnd),
        mac=None,
        fw_version=None,
        last_seen_at=None,
        created_at=now,
    )
    session.add(dev)
    try:
        await session.commit()
        await session.refresh(dev)
        logger.info("Auto-registered device from MQTT: %s", device_id_str)
    except IntegrityError:
        await session.rollback()
        dev = await _find_device_by_string_id(session, device_id_str)
        if not dev:
            raise
    return dev


async def _handle_report(session: AsyncSession, device: Device, payload: dict[str, Any]) -> None:
    now = datetime.now()
    vals: dict[str, Any] = {"last_seen_at": now}
    if "fw_version" in payload and payload["fw_version"] is not None:
        vals["fw_version"] = str(payload["fw_version"])[:32]
    if "relay_on" in payload:
        ro = payload.get("relay_on")
        if isinstance(ro, bool):
            vals["relay_on"] = ro
    await session.execute(update(Device).where(Device.id == device.id).values(**vals))

    if payload.get("report_reason") == "schedule":
        sa = payload.get("schedule_action")
        if not isinstance(sa, str) or not sa:
            sa = "on" if payload.get("relay_on") is True else "off"
        log = DeviceOperationLog(
            device_id=device.id,
            user_id=None,
            source=LogSource.schedule,
            action="schedule.run",
            detail={
                "schedule_id": payload.get("schedule_id"),
                "action": sa,
            },
            created_at=datetime.now(),
        )
        session.add(log)
    await session.commit()


async def _handle_ack(session: AsyncSession, device: Device, payload: dict[str, Any]) -> None:
    cmd_id = payload.get("cmd_id")
    if not cmd_id:
        await _touch_device_last_seen(session, device.id)
        return
    cmd_id_str = str(cmd_id)
    if cmd_id_str in _processed_ack_cmd_ids:
        await _touch_device_last_seen(session, device.id)
        return

    detail = {
        "cmd_id": cmd_id_str,
        "success": payload.get("success"),
        "error_code": payload.get("error_code"),
        "error_message": payload.get("error_message"),
        "applied": payload.get("applied"),
        "ts": payload.get("ts"),
    }
    cache_command_ack(device.id, cmd_id_str, detail)

    _processed_ack_cmd_ids.add(cmd_id_str)
    if len(_processed_ack_cmd_ids) > _ACK_DEDUP_MAX:
        _processed_ack_cmd_ids.clear()

    await _touch_device_last_seen(session, device.id)


async def _handle_uplink(session: AsyncSession, device_id_str: str, kind: str, raw: bytes) -> None:
    device = await _get_or_create_device(session, device_id_str)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = {}

    if kind == "report":
        await _handle_report(session, device, payload)
    elif kind == "heartbeat":
        await _touch_device_last_seen(session, device.id)
    elif kind == "ack":
        await _handle_ack(session, device, payload)
    elif kind == "ota/progress":
        await _touch_device_last_seen(session, device.id)


async def mqtt_ingest_loop(stop: asyncio.Event) -> None:
    settings = get_settings()
    while not stop.is_set():
        try:
            async with Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username,
                password=settings.mqtt_password,
                client_id=f"{settings.mqtt_client_id}_in",
            ) as client:
                await client.subscribe("sr/v1/device/+/report", qos=1)
                await client.subscribe("sr/v1/device/+/ack", qos=1)
                await client.subscribe("sr/v1/device/+/heartbeat", qos=1)
                await client.subscribe("sr/v1/device/+/ota/progress", qos=1)
                logger.info("MQTT subscribed to device uplinks")
                # asyncio-mqtt 0.16+：messages 为 async 上下文管理器，不能直接 async for client.messages
                async with client.messages() as messages:
                    async for message in messages:
                        if stop.is_set():
                            break
                        topic = message.topic.value
                        parsed = _parse_topic(topic)
                        if not parsed:
                            continue
                        dev_str, kind = parsed
                        async with AsyncSessionLocal() as session:
                            try:
                                await _handle_uplink(session, dev_str, kind, message.payload)
                            except Exception:
                                logger.exception("MQTT handle failed topic=%s", topic)
                                await session.rollback()
        except Exception:
            logger.exception("MQTT ingest reconnecting")
            await asyncio.sleep(3)


class MqttPublisher:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[tuple[str, str, int]] = asyncio.Queue()
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task[None]] = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        settings = get_settings()
        while not self._stop.is_set():
            try:
                async with Client(
                    hostname=settings.mqtt_host,
                    port=settings.mqtt_port,
                    username=settings.mqtt_username,
                    password=settings.mqtt_password,
                    client_id=f"{settings.mqtt_client_id}_out",
                ) as client:
                    logger.info("MQTT publisher connected")
                    while not self._stop.is_set():
                        try:
                            topic, payload, qos = await asyncio.wait_for(
                                self._queue.get(), timeout=0.5
                            )
                        except asyncio.TimeoutError:
                            continue
                        await client.publish(topic, payload.encode("utf-8"), qos=qos)
            except Exception:
                logger.exception("MQTT publisher reconnecting")
                await asyncio.sleep(3)

    async def publish_json(self, topic: str, payload: dict[str, Any], qos: int = 1) -> None:
        await self._queue.put((topic, json.dumps(payload, ensure_ascii=False), qos))


mqtt_publisher = MqttPublisher()
