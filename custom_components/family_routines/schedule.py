from __future__ import annotations

from datetime import datetime, time, timedelta

from homeassistant.const import WEEKDAYS
from homeassistant.util import dt as dt_util


def parse_time(value: str) -> time:
    parsed = dt_util.parse_time(value)
    if parsed is None:
        raise ValueError(f"invalid time of day: {value}")
    return parsed


def in_window(now: datetime, window_start: str, window_end: str) -> bool:
    start = parse_time(window_start)
    end = parse_time(window_end)
    current = now.timetz().replace(tzinfo=None)

    if start == end:
        return True
    if start < end:
        return start <= current < end
    return current >= start or current < end


def previous_window_start(now: datetime, window_start: str) -> datetime:
    start = parse_time(window_start)
    candidate = now.replace(
        hour=start.hour,
        minute=start.minute,
        second=start.second,
        microsecond=0,
    )
    if candidate > now:
        candidate -= timedelta(days=1)
    return candidate


def window_weekday(now: datetime, window_start: str) -> str:
    return WEEKDAYS[previous_window_start(now, window_start).weekday()]
