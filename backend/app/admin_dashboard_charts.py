"""管理后台大屏：按时间桶从数据库聚合在线率、新增用户、指令下发。"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, DeviceOperationLog, User


def resolve_dashboard_window(
    period: str,
    now: datetime,
    range_from: Optional[date],
    range_to: Optional[date],
) -> Tuple[datetime, datetime]:
    if range_from is not None and range_to is not None:
        a, b = range_from, range_to
        if a > b:
            a, b = b, a
        return datetime.combine(a, time.min), datetime.combine(b, time.max)
    d = now.date()
    if period == "today":
        return datetime.combine(d, time.min), now
    if period == "d7":
        return now - timedelta(days=7), now
    if period == "d30":
        return now - timedelta(days=30), now
    if period == "week":
        monday = d - timedelta(days=d.weekday())
        return datetime.combine(monday, time.min), now
    if period == "month":
        return datetime.combine(d.replace(day=1), time.min), now
    if period == "year":
        return datetime.combine(d.replace(month=1, day=1), time.min), now
    return datetime.combine(d, time.min), now


def chart_bucket_specs(ps: datetime, pe: datetime) -> List[Tuple[datetime, datetime, str]]:
    """返回 [bucket_start, bucket_end) 与轴标签，桶数上限约 12。"""
    out: List[Tuple[datetime, datetime, str]] = []
    if pe <= ps:
        pe = ps + timedelta(minutes=1)

    pe_excl = pe + timedelta(seconds=1)

    d0, d1 = ps.date(), pe.date()
    num_days = (d1 - d0).days + 1

    if num_days <= 1:
        day = d0
        midnight = datetime.combine(day, time.min)
        for i in range(6):
            bs = max(midnight + timedelta(hours=4 * i), ps)
            be_excl = min(midnight + timedelta(hours=4 * (i + 1)), pe_excl)
            if be_excl <= bs:
                continue
            label = f"{4 * i}-{4 * (i + 1)}h"
            out.append((bs, be_excl, label))
        if not out:
            out.append((ps, pe_excl, "时段"))
        return out[:12]

    if num_days <= 14:
        cur = d0
        while cur <= d1:
            bs = max(datetime.combine(cur, time.min), ps)
            be_excl = min(datetime.combine(cur + timedelta(days=1), time.min), pe_excl)
            if be_excl > bs:
                wk = ("一", "二", "三", "四", "五", "六", "日")[cur.weekday()]
                out.append((bs, be_excl, f"{cur.strftime('%m/%d')}({wk})"))
            cur += timedelta(days=1)
        return out[:24]

    nb = min(12, max(4, (num_days + 2) // 3))
    span = max(1, (num_days + nb - 1) // nb)
    cur = d0
    while cur <= d1 and len(out) < 24:
        chunk_last = min(cur + timedelta(days=span - 1), d1)
        bs = max(datetime.combine(cur, time.min), ps)
        be_excl = min(datetime.combine(chunk_last + timedelta(days=1), time.min), pe_excl)
        if be_excl > bs:
            label = f"{cur.strftime('%m/%d')}-{chunk_last.strftime('%m/%d')}"
            out.append((bs, be_excl, label))
        cur = chunk_last + timedelta(days=1)
    return out[:12]


async def online_rate_at_instant(session: AsyncSession, instant: datetime, offline_sec: int) -> float:
    thr = instant - timedelta(seconds=offline_sec)
    tot = int((await session.scalar(select(func.count()).select_from(Device))) or 0)
    if tot == 0:
        return 0.0
    on = int(
        (await session.scalar(select(func.count()).select_from(Device).where(Device.last_seen_at >= thr))) or 0
    )
    return round(100.0 * on / tot, 1)


async def count_users_between(session: AsyncSession, bs: datetime, be_excl: datetime) -> int:
    return int(
        (
            await session.scalar(
                select(func.count()).select_from(User).where(User.created_at >= bs, User.created_at < be_excl)
            )
        )
        or 0
    )


async def count_commands_between(session: AsyncSession, bs: datetime, be_excl: datetime) -> int:
    return int(
        (
            await session.scalar(
                select(func.count())
                .select_from(DeviceOperationLog)
                .where(
                    DeviceOperationLog.action == "command.sent",
                    DeviceOperationLog.created_at >= bs,
                    DeviceOperationLog.created_at < be_excl,
                )
            )
        )
        or 0
    )


async def build_chart_series(
    session: AsyncSession,
    p_start: datetime,
    p_end: datetime,
    offline_sec: int,
) -> dict:
    specs = chart_bucket_specs(p_start, p_end)
    labels: List[str] = []
    online_vals: List[float] = []
    user_vals: List[int] = []
    cmd_vals: List[int] = []

    for bs, be_excl, lab in specs:
        labels.append(lab)
        te = be_excl - timedelta(seconds=1)
        if te < bs:
            te = bs
        online_vals.append(await online_rate_at_instant(session, te, offline_sec))
        user_vals.append(await count_users_between(session, bs, be_excl))
        cmd_vals.append(await count_commands_between(session, bs, be_excl))

    if len(specs) <= 1:
        cap_u = "按时段"
    elif (p_end.date() - p_start.date()).days <= 0:
        cap_u = "今日按 4 小时分段"
    elif (p_end - p_start).days <= 14:
        cap_u = "按日"
    else:
        cap_u = "按多日汇总"

    return {
        "labels": labels,
        "online_rate": online_vals,
        "new_users": user_vals,
        "commands": cmd_vals,
        "captions": {
            "line": f"在线率 · {cap_u}（桶末时点）",
            "users": f"新增用户 · {cap_u}",
            "commands": f"指令下发 · {cap_u}",
        },
    }
