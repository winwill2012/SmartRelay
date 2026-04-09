from datetime import datetime
from typing import Optional

from app.config import get_settings


def device_is_online(last_seen_at: Optional[datetime]) -> bool:
    if last_seen_at is None:
        return False
    settings = get_settings()
    delta = (datetime.now() - last_seen_at).total_seconds()
    threshold = min(int(settings.device_offline_seconds), 10)
    return delta <= threshold
