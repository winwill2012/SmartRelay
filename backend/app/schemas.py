from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class WechatAuthBody(BaseModel):
    code: str = Field(..., min_length=1)


class PatchUserBody(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=64)
    avatar_url: Optional[str] = Field(default=None, max_length=512)


class BindBody(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=32)
    device_secret: Optional[str] = Field(
        default=None,
        max_length=128,
        description="可选；省略时仅允许首次绑定且设备已有 MQTT 上报（免绑定码）",
    )
    name: str = Field(default="", max_length=64)


class PatchDeviceBody(BaseModel):
    name: str = Field(..., max_length=64)


class CommandBody(BaseModel):
    type: Literal["relay.set", "relay.toggle"]
    client_cmd_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class RelaySetPayload(BaseModel):
    on: bool = True


class ClaimBody(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=32)
    device_secret: str = Field(..., min_length=1)
    mac: Optional[str] = Field(default=None, max_length=17)


class ShareBody(BaseModel):
    target_user_openid: Optional[str] = None
    phone: Optional[str] = None


class ScheduleCreateBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=64)
    repeat_type: Literal["once", "daily", "weekly", "monthly"]
    time_local: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    weekdays: Optional[list[int]] = None
    monthdays: Optional[list[int]] = None
    action: Literal["on", "off"]
    enabled: bool = True


class SchedulePatchBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=64)
    repeat_type: Optional[Literal["once", "daily", "weekly", "monthly"]] = None
    time_local: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    weekdays: Optional[list[int]] = None
    monthdays: Optional[list[int]] = None
    action: Optional[Literal["on", "off"]] = None
    enabled: Optional[bool] = None


class AdminLoginBody(BaseModel):
    username: str
    password: str


class AdminPasswordBody(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


class FirmwarePatchBody(BaseModel):
    is_active: Optional[bool] = None
