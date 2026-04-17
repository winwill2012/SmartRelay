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


async def ensure_devices_ota_progress_columns(session: AsyncSession) -> None:
    """devices OTA 进度：MQTT 与 HTTP 可能不在同一进程，进度落库供小程序轮询。"""
    stmts = [
        (
            "ota_progress_percent",
            "ALTER TABLE devices ADD COLUMN ota_progress_percent SMALLINT NULL "
            "COMMENT 'OTA进度0-100' AFTER last_seen_at",
        ),
        (
            "ota_progress_phase",
            "ALTER TABLE devices ADD COLUMN ota_progress_phase VARCHAR(64) NULL "
            "COMMENT 'OTA阶段' AFTER ota_progress_percent",
        ),
        (
            "ota_progress_ts_ms",
            "ALTER TABLE devices ADD COLUMN ota_progress_ts_ms BIGINT NULL "
            "COMMENT 'OTA进度时间戳ms' AFTER ota_progress_phase",
        ),
    ]
    for _col, ddl in stmts:
        try:
            await session.execute(text(ddl))
            await session.commit()
            logger.info("db migration: added devices.%s", _col)
        except OperationalError as e:
            await session.rollback()
            orig = getattr(e, "orig", None)
            args = getattr(orig, "args", ()) if orig is not None else ()
            code = args[0] if args else None
            msg = str(orig or e)
            if code == 1060 or "Duplicate column" in msg or "duplicate column" in msg.lower():
                continue
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


async def ensure_device_share_tokens_table(session: AsyncSession) -> None:
    """设备分享令牌表：用于微信好友接受分享流程。"""
    try:
        await session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS device_share_tokens (
                  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  owner_user_id BIGINT NOT NULL,
                  target_user_id BIGINT NULL,
                  device_id BIGINT NOT NULL,
                  share_token VARCHAR(128) NOT NULL,
                  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
                  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                  expires_at DATETIME(3) NULL,
                  accepted_at DATETIME(3) NULL,
                  revoked_at DATETIME(3) NULL,
                  UNIQUE KEY uk_share_token (share_token),
                  INDEX idx_share_owner_time (owner_user_id, created_at),
                  INDEX idx_share_target_time (target_user_id, created_at),
                  INDEX idx_share_token_status (share_token, status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        )
        await session.commit()
        logger.info("db migration: ensured device_share_tokens table")
    except OperationalError:
        await session.rollback()
        raise


async def delete_orphan_pending_share_tokens(session: AsyncSession) -> None:
    """删除历史上「仅预创建、无被分享者」的 pending 记录；新逻辑下邀请为签名令牌，不再产生此类行。"""
    try:
        await session.execute(
            text(
                "DELETE FROM device_share_tokens "
                "WHERE status = 'pending' AND target_user_id IS NULL"
            )
        )
        await session.commit()
        logger.info("db migration: cleaned orphan pending share tokens (if any)")
    except OperationalError:
        await session.rollback()
        raise
