from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("wechat_app_id", "wechat_secret", mode="before")
    @classmethod
    def _strip_wechat(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    app_name: str = "SmartRelay API"
    api_prefix: str = "/api/v1"

    # Server (for firmware URLs and docs)
    public_base_url: str = "http://127.0.0.1:8000"
    listen_host: str = "0.0.0.0"
    listen_port: int = 8000

    # MySQL (defaults align with resource.md for local dev only — override in production)
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "SmartRelay"
    mysql_password: str = "change_me"
    mysql_database: str = "SmartRelay"

    # JWT
    jwt_secret: str = "change-me-in-production-use-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    admin_jwt_expire_minutes: int = 60 * 12

    # MQTT
    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_username: str = "SmartRelay"
    mqtt_password: str = "change_me"
    mqtt_client_id: str = "sr_backend_v1"

    # WeChat (optional; mock openid when unset)
    wechat_app_id: str = ""
    wechat_secret: str = ""

    # 超过该秒数未收到上行则列表显示离线（需大于固件心跳间隔，默认 3s×若干次）
    device_offline_seconds: int = 45

    # Default admin (password hashed at runtime, not stored here)
    admin_default_username: str = "admin"
    admin_default_password: str = "admin123"

    # Uploads
    upload_dir: str = "uploads"

    @property
    def database_url(self) -> str:
        # 密码中若含 @ : / 等字符，必须编码，否则会被误解析为主机名（如 314159!@$%^ 会破坏 URL）
        user = quote_plus(self.mysql_user)
        password = quote_plus(self.mysql_password)
        return f"mysql+aiomysql://{user}:{password}@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
