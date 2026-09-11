from __future__ import annotations

SIGNPOST_ICONS: dict[str, str] = {
    "arrow_upward": "e5d8",
    "arrow_downward": "e5db",
    "arrow_forward": "e5c8",
    "arrow_back": "e5c4",
}

TASK_ICONS: dict[str, str] = {
    "apparel": "ef7b",
    "dentistry": "e0a6",
    "self_care": "f86d",
    "breakfast_dining": "ea54",
    "backpack": "f19c",
    "footprint": "f87d",
}

STATE_ICONS: dict[str, str] = {
    "celebration": "ea65",
}

ICONS: dict[str, str] = {**SIGNPOST_ICONS, **TASK_ICONS, **STATE_ICONS}


def codepoint(icon: str) -> str:
    if not icon:
        return ""

    known = ICONS.get(icon)
    if known is not None:
        return known

    candidate = icon.strip().lower().removeprefix("0x").removeprefix("u+")
    try:
        int(candidate, 16)
    except ValueError:
        return ""
    return candidate


def character(icon: str) -> str:
    value = codepoint(icon)
    if not value:
        return ""
    return chr(int(value, 16))
