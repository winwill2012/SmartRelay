from __future__ import annotations

from datetime import UTC, datetime


def utc_now_naive() -> datetime:
    """Store as MySQL DATETIME UTC naive per protocol §4."""
    return datetime.now(UTC).replace(tzinfo=None)
