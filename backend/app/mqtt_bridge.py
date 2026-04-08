from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any

import paho.mqtt.client as mqtt

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class MqttBridge:
    """Server MQTT client: subscribe uplink, publish downlink QoS1."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client: mqtt.Client | None = None
        self._queue: asyncio.Queue[dict[str, Any]] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._loop = loop
        self._queue = queue

    def start_background(self) -> None:
        s = self.settings
        cid = s.mqtt_client_id
        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION1,
            client_id=cid,
            protocol=mqtt.MQTTv311,
            transport="tcp",
        )
        self._client.username_pw_set(s.mqtt_username, s.mqtt_password)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.reconnect_delay_set(min_delay=1, max_delay=30)

        def run() -> None:
            try:
                self._client.connect(s.mqtt_host, s.mqtt_port, keepalive=60)
                self._client.loop_forever()
            except Exception as e:
                logger.exception("MQTT thread died: %s", e)

        t = threading.Thread(target=run, name="mqtt-loop", daemon=True)
        t.start()

    def stop(self) -> None:
        if self._client:
            try:
                self._client.disconnect()
            except Exception:
                pass

    def publish_cmd(self, device_sn: str, payload: dict[str, Any]) -> None:
        if not self._client:
            raise RuntimeError("MQTT not started")
        topic = f"smartrelay/v1/{device_sn}/down/cmd"
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        info = self._client.publish(topic, body.encode("utf-8"), qos=1)
        rc = info[0] if isinstance(info, tuple) else getattr(info, "rc", 0)
        if rc != mqtt.MQTT_ERR_SUCCESS:
            logger.warning("publish rc=%s topic=%s", rc, topic)

    def _on_connect(self, client: mqtt.Client, userdata: Any, flags: dict, rc: int) -> None:
        if rc != 0:
            logger.error("MQTT connect failed rc=%s", rc)
            return
        client.subscribe("smartrelay/v1/+/up/#", qos=1)
        logger.info("MQTT subscribed smartrelay/v1/+/up/#")

    def _on_message(self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
        try:
            topic = msg.topic or ""
            parts = topic.split("/")
            # smartrelay/v1/{sn}/up/telemetry|ack|event
            if len(parts) < 5:
                return
            device_sn = parts[2].upper()
            uplink = parts[4]
            try:
                payload = json.loads(msg.payload.decode("utf-8")) if msg.payload else {}
            except json.JSONDecodeError:
                payload = {}
            item = {
                "device_sn": device_sn,
                "uplink": uplink,
                "payload": payload,
                "raw_topic": topic,
            }
            if self._loop and self._queue:
                self._loop.call_soon_threadsafe(self._queue.put_nowait, item)
        except Exception:
            logger.exception("on_message")
