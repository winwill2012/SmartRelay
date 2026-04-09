"""
轻量启动时迁移：补齐 ORM 已使用但旧库未执行的列，避免 Unknown column 导致服务不可用。
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def ensure_devices_relay_on(session: AsyncSession) -> None:
    """devices.relay_on：MQTT report 同步继电器状态到列表。"""
    try:
        await session.execute(
            text(
                "ALTER TABLE devices ADD COLUMN relay_on TINYINT(1) NULL "
                "COMMENT '最近一次上报的继电器状态' AFTER fw_version"
            )
        )
        await session.commit()
        logger.info("db migration: added devices.relay_on")
    except OperationalError as e:
        await session.rollback()
        orig = getattr(e, "orig", None)
        args = getattr(orig, "args", ()) if orig is not None else ()
        code = args[0] if args else None
        msg = str(orig or e)
        # MySQL 1060: Duplicate column name
        if code == 1060 or "Duplicate column" in msg or "duplicate column" in msg.lower():
            return
        raise
