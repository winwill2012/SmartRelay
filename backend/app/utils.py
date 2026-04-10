from datetime import datetime
from typing import Optional

from app.config import get_settings


def device_is_online(last_seen_at: Optional[datetime]) -> bool:
    if last_seen_at is None:
        return False
    settings = get_settings()
    delta = (datetime.now() - last_seen_at).total_seconds()
    # 与 device_offline_seconds 一致；勿再 cap 成 10s，否则易在两次3s 心跳之间被误判离线
    return delta <= int(settings.device_offline_seconds)
