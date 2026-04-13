"""管理后台大屏：按时间桶从数据库聚合在线设备数、新增用户、指令下发。"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, DeviceOperationLog, User


def resolve_dashboard_window(
    period: str,
    now: datetime,
    range_from: Optional[datetime],
    range_to: Optional[datetime],
) -> Tuple[datetime, datetime]:
    if range_from is not None and range_to is not None:
        a, b = range_from, range_to
        if a > b:
            a, b = b, a
        return a, b
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


def _intraday_buckets(ps: datetime, pe: datetime, pe_excl: datetime, day: date) -> List[Tuple[datetime, datetime, str]]:
    """单日实时：按整点小时分段（00:00–01:00 …），最多 24 桶。"""
    midnight = datetime.combine(day, time.min)
    out: List[Tuple[datetime, datetime, str]] = []
    for i in range(24):
        bs = max(midnight + timedelta(hours=i), ps)
        be_excl = min(midnight + timedelta(hours=i + 1), pe_excl)
        if be_excl > bs:
            out.append((bs, be_excl, f"{i:02d}:00"))
    if not out:
        out.append((ps, pe_excl, "时段"))
    return out


def _daily_bucket_list(ps: datetime, pe: datetime, pe_excl: datetime) -> List[Tuple[datetime, datetime, str]]:
    d0, d1 = ps.date(), pe.date()
    out: List[Tuple[datetime, datetime, str]] = []
    cur = d0
    while cur <= d1:
        bs = max(datetime.combine(cur, time.min), ps)
        be_excl = min(datetime.combine(cur + timedelta(days=1), time.min), pe_excl)
        if be_excl > bs:
            wk = ("一", "二", "三", "四", "五", "六", "日")[cur.weekday()]
            out.append((bs, be_excl, f"{cur.strftime('%m/%d')}({wk})"))
        cur += timedelta(days=1)
    return out


def _wide_span_chunks(ps: datetime, pe: datetime, pe_excl: datetime) -> List[Tuple[datetime, datetime, str]]:
    d0, d1 = ps.date(), pe.date()
    num_days = (d1 - d0).days + 1
    nb = min(12, max(4, (num_days + 2) // 3))
    span = max(1, (num_days + nb - 1) // nb)
    out: List[Tuple[datetime, datetime, str]] = []
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


def _year_month_buckets(ps: datetime, pe: datetime, pe_excl: datetime) -> List[Tuple[datetime, datetime, str]]:
    out: List[Tuple[datetime, datetime, str]] = []
    cur = date(ps.year, ps.month, 1)
    end_d = pe.date()
    while cur <= end_d and len(out) < 12:
        bs = max(datetime.combine(cur, time.min), ps)
        if cur.month == 12:
            next_m = date(cur.year + 1, 1, 1)
        else:
            next_m = date(cur.year, cur.month + 1, 1)
        be_excl = min(datetime.combine(next_m, time.min), pe_excl)
        if be_excl > bs:
            out.append((bs, be_excl, f"{cur.month}月"))
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return out


def chart_bucket_specs(
    ps: datetime,
    pe: datetime,
    period: str,
    range_from: Optional[datetime],
    range_to: Optional[datetime],
) -> List[Tuple[datetime, datetime, str]]:
    """按「统计周期」分桶，避免「本周」在周一仍走 0–4h 的误判。"""
    if pe <= ps:
        pe = ps + timedelta(minutes=1)
    pe_excl = pe + timedelta(seconds=1)

    if range_from is not None and range_to is not None:
        if range_from.date() == range_to.date():
            return _intraday_buckets(ps, pe, pe_excl, range_from.date())[:24]
        nd = (range_to.date() - range_from.date()).days + 1
        if nd <= 14:
            return _daily_bucket_list(ps, pe, pe_excl)[:24]
        return _wide_span_chunks(ps, pe, pe_excl)

    if period == "today":
        return _intraday_buckets(ps, pe, pe_excl, ps.date())[:24]

    if period in ("week", "d7"):
        return _daily_bucket_list(ps, pe, pe_excl)[:14]

    if period == "month":
        nd = (pe.date() - ps.date()).days + 1
        if nd <= 14:
            return _daily_bucket_list(ps, pe, pe_excl)
        return _wide_span_chunks(ps, pe, pe_excl)

    if period == "d30":
        return _wide_span_chunks(ps, pe, pe_excl)

    if period == "year":
        return _year_month_buckets(ps, pe, pe_excl)

    return _daily_bucket_list(ps, pe, pe_excl)[:24]


def caption_for_period(
    period: str,
    range_from: Optional[datetime],
    range_to: Optional[datetime],
) -> str:
    if range_from is not None and range_to is not None:
        if range_from.date() == range_to.date():
            return "当日按小时"
        if (range_to.date() - range_from.date()).days + 1 <= 14:
            return "自定义区间按日"
        return "自定义区间分段"
    return {
        "today": "今日按小时",
        "week": "本周按日",
        "d7": "近 7 日按日",
        "d30": "近 30 日分段",
        "month": "本月分段",
        "year": "本年按月",
    }.get(period, "按日")


async def online_count_at_instant(session: AsyncSession, instant: datetime, offline_sec: int) -> int:
    """桶末时点：last_seen 在离线阈值内的设备数量（与在线判定口径一致）。"""
    thr = instant - timedelta(seconds=offline_sec)
    return int(
        (await session.scalar(select(func.count()).select_from(Device).where(Device.last_seen_at >= thr))) or 0
    )


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
    period: str,
    range_from: Optional[datetime],
    range_to: Optional[datetime],
) -> dict:
    specs = chart_bucket_specs(p_start, p_end, period, range_from, range_to)
    labels: List[str] = []
    online_count_vals: List[int] = []
    user_vals: List[int] = []
    cmd_vals: List[int] = []

    for bs, be_excl, lab in specs:
        labels.append(lab)
        te = be_excl - timedelta(seconds=1)
        if te < bs:
            te = bs
        online_count_vals.append(await online_count_at_instant(session, te, offline_sec))
        user_vals.append(await count_users_between(session, bs, be_excl))
        cmd_vals.append(await count_commands_between(session, bs, be_excl))

    cap_u = caption_for_period(period, range_from, range_to)

    return {
        "labels": labels,
        "online_count": online_count_vals,
        "new_users": user_vals,
        "commands": cmd_vals,
        "captions": {
            "line": f"在线设备数 · {cap_u}（桶末时点）",
            "users": f"新增用户 · {cap_u}",
            "commands": f"指令下发 · {cap_u}",
        },
    }
