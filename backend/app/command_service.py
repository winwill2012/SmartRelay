import json
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DeviceOperationLog, LogSource

CMD_SENT = "command.sent"
CMD_ACK = "command.ack"

# MQTT ack 不再写入 operation_logs，仅内存缓存供 get_command_status 查询
_ack_cache: dict[tuple[int, str], dict[str, Any]] = {}
_ACK_CACHE_MAX = 3000


def cache_command_ack(device_pk: int, cmd_id: str, detail: dict[str, Any]) -> None:
    key = (device_pk, cmd_id)
    _ack_cache[key] = detail
    while len(_ack_cache) > _ACK_CACHE_MAX:
        _ack_cache.pop(next(iter(_ack_cache)))


def get_cached_ack(device_pk: int, cmd_id: str) -> Optional[dict[str, Any]]:
    return _ack_cache.get((device_pk, cmd_id))


async def find_existing_cmd_by_client_id(
    session: AsyncSession, device_pk: int, client_cmd_id: str
) -> Optional[str]:
    q = text(
        """
        SELECT JSON_UNQUOTE(JSON_EXTRACT(detail, '$.cmd_id'))
        FROM device_operation_logs
        WHERE device_id = :did
          AND action = :act
          AND JSON_UNQUOTE(JSON_EXTRACT(detail, '$.client_cmd_id')) = :ccid
        ORDER BY id DESC
        LIMIT 1
        """
    )
    r = await session.execute(q, {"did": device_pk, "act": CMD_SENT, "ccid": client_cmd_id})
    row = r.first()
    if row and row[0]:
        return str(row[0])
    return None


async def insert_command_sent(
    session: AsyncSession,
    *,
    device_pk: int,
    user_id: Optional[int],
    cmd_id: str,
    cmd_type: str,
    payload: dict[str, Any],
    client_cmd_id: Optional[str],
    source: LogSource = LogSource.user,
) -> None:
    detail: dict[str, Any] = {
        "cmd_id": cmd_id,
        "type": cmd_type,
        "status": "pending",
        "payload": payload,
    }
    if client_cmd_id:
        detail["client_cmd_id"] = client_cmd_id
    log = DeviceOperationLog(
        device_id=device_pk,
        user_id=user_id,
        source=source,
        action=CMD_SENT,
        detail=detail,
        created_at=datetime.now(),
    )
    session.add(log)
    await session.commit()


async def get_command_status(session: AsyncSession, device_pk: int, cmd_id: str) -> dict[str, Any]:
    q_sent = text(
        """
        SELECT detail, created_at FROM device_operation_logs
        WHERE device_id = :did AND action = :act
          AND JSON_UNQUOTE(JSON_EXTRACT(detail, '$.cmd_id')) = :cid
        ORDER BY id DESC LIMIT 1
        """
    )
    r = await session.execute(q_sent, {"did": device_pk, "act": CMD_SENT, "cid": cmd_id})
    sent_row = r.first()
    if not sent_row:
        return {"status": "not_found"}

    sent_detail = sent_row[0]
    if isinstance(sent_detail, str):
        sent_detail = json.loads(sent_detail)

    cached = get_cached_ack(device_pk, cmd_id)
    if cached is not None:
        ack_detail = cached
        return {
            "status": "acked",
            "success": ack_detail.get("success"),
            "error_code": ack_detail.get("error_code"),
            "error_message": ack_detail.get("error_message"),
            "applied": ack_detail.get("applied"),
            "sent": sent_detail,
            "ack": ack_detail,
        }

    q_ack = text(
        """
        SELECT detail, created_at FROM device_operation_logs
        WHERE device_id = :did AND action = :act
          AND JSON_UNQUOTE(JSON_EXTRACT(detail, '$.cmd_id')) = :cid
        ORDER BY id DESC LIMIT 1
        """
    )
    r2 = await session.execute(q_ack, {"did": device_pk, "act": CMD_ACK, "cid": cmd_id})
    ack_row = r2.first()
    if not ack_row:
        return {"status": "pending", "sent": sent_detail}

    ack_detail = ack_row[0]
    if isinstance(ack_detail, str):
        ack_detail = json.loads(ack_detail)
    success = ack_detail.get("success")
    return {
        "status": "acked",
        "success": success,
        "error_code": ack_detail.get("error_code"),
        "error_message": ack_detail.get("error_message"),
        "applied": ack_detail.get("applied"),
        "sent": sent_detail,
        "ack": ack_detail,
    }


def new_cmd_id() -> str:
    return str(uuid.uuid4())
