from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "SmartRelay API"
    debug: bool = False

    # MySQL (async SQLAlchemy)；无 .env 时仍建议复制 .env.example 为 .env
    mysql_host: str = "119.29.197.186"
    mysql_port: int = 3306
    mysql_user: str = "SmartRelay"
    mysql_password: str = ""
    mysql_database: str = "SmartRelay"

    # JWT
    jwt_secret: str = "change-me-in-production-use-long-random"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 720  # 30 days

    # WeChat mini program (placeholders)
    wechat_appid: str = ""
    wechat_secret: str = ""

    # MQTT (server connects as broker user per resource.md / §8)
    mqtt_host: str = "119.29.197.186"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_client_id: str = "smartrelay_server"

    # Timeouts (protocol §5.6 / §5.7)
    online_grace_seconds: int = 10
    command_ack_timeout_seconds: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()


def mysql_dsn_async(settings: Settings | None = None) -> str:
    s = settings or get_settings()
    user = quote_plus(s.mysql_user)
    pwd = quote_plus(s.mysql_password)
    return f"mysql+asyncmy://{user}:{pwd}@{s.mysql_host}:{s.mysql_port}/{s.mysql_database}"
