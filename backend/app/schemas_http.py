from __future__ import annotations

from pydantic import BaseModel, Field


class WechatLoginBody(BaseModel):
    code: str = Field(..., min_length=1)


class AdminLoginBody(BaseModel):
    username: str
    password: str


class AdminPasswordBody(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


class BindBody(BaseModel):
    device_sn: str = Field(..., min_length=1)
    mqtt_password: str = Field(..., min_length=1)


class UnbindBody(BaseModel):
    device_id: str


class PatchDeviceBody(BaseModel):
    remark_name: str | None = None


class CommandBody(BaseModel):
    on: bool


class ScheduleCreateBody(BaseModel):
    cron_expr: str
    action: str  # relay_on | relay_off
    enabled: int = 1


class SchedulePatchBody(BaseModel):
    cron_expr: str | None = None
    action: str | None = None
    enabled: int | None = None
