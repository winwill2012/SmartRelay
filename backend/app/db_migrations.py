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


async def ensure_user_notifications_table(session: AsyncSession) -> None:
    """站内通知表：定时任务执行结果等。"""
    try:
        await session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_notifications (
                  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  user_id BIGINT NOT NULL,
                  category VARCHAR(32) NOT NULL,
                  title VARCHAR(128) NOT NULL,
                  body VARCHAR(512) NOT NULL,
                  extra JSON NULL,
                  is_read TINYINT(1) NOT NULL DEFAULT 0,
                  created_at DATETIME NOT NULL,
                  INDEX idx_un_user_time (user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        )
        await session.commit()
        logger.info("db migration: ensured user_notifications table")
    except OperationalError:
        await session.rollback()
        raise
