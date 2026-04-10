from __future__ import annotations

import enum
from datetime import datetime, time
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserDeviceRole(str, enum.Enum):
    owner = "owner"
    shared = "shared"


class RepeatType(str, enum.Enum):
    once = "once"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class ScheduleAction(str, enum.Enum):
    on = "on"
    off = "off"


class LogSource(str, enum.Enum):
    user = "user"
    admin = "admin"
    schedule = "schedule"
    system = "system"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    openid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    unionid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    user_devices: Mapped[list["UserDevice"]] = relationship(back_populates="user")


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    device_secret_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    mac: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    fw_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    relay_on: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    user_devices: Mapped[list["UserDevice"]] = relationship(back_populates="device")
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="device")
    operation_logs: Mapped[list["DeviceOperationLog"]] = relationship(back_populates="device")


class UserDevice(Base):
    __tablename__ = "user_devices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    device_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("devices.id"), nullable=False)
    remark: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    role: Mapped[UserDeviceRole] = mapped_column(
        Enum(UserDeviceRole, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=UserDeviceRole.owner,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    user: Mapped["User"] = relationship(back_populates="user_devices")
    device: Mapped["Device"] = relationship(back_populates="user_devices")

    __table_args__ = (Index("uk_user_device", "user_id", "device_id", unique=True),)


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("devices.id"), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    repeat_type: Mapped[RepeatType] = mapped_column(
        Enum(RepeatType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    time_local: Mapped[time] = mapped_column(Time, nullable=False)
    weekdays: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    monthdays: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    action: Mapped[ScheduleAction] = mapped_column(
        Enum(ScheduleAction, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    device: Mapped["Device"] = relationship(back_populates="schedules")


class UserNotification(Base):
    """用户站内通知（如定时任务执行结果），非微信模板消息。"""

    __tablename__ = "user_notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    body: Mapped[str] = mapped_column(String(512), nullable=False)
    extra: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    __table_args__ = (Index("idx_un_user_time", "user_id", "created_at"),)


class DeviceOperationLog(Base):
    __tablename__ = "device_operation_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("devices.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    source: Mapped[LogSource] = mapped_column(
        Enum(LogSource, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    device: Mapped["Device"] = relationship(back_populates="operation_logs")

    __table_args__ = (Index("idx_logs_device_time", "device_id", "created_at"),)


class FirmwareVersion(Base):
    __tablename__ = "firmware_versions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    file_url: Mapped[str] = mapped_column(String(512), nullable=False)
    file_md5: Mapped[str] = mapped_column(String(32), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    release_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    __table_args__ = (UniqueConstraint("version", name="uk_fw_version"),)
