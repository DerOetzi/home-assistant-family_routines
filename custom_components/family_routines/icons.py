from __future__ import annotations

SIGNPOST_ICONS: dict[str, str] = {
    "arrow_upward": "e5d8",
    "arrow_downward": "e5db",
    "arrow_forward": "e5c8",
    "arrow_back": "e5c4",
}

TASK_ICON_GROUPS: dict[str, dict[str, str]] = {
    "body": {
        "apparel": "ef7b",
        "footprint": "f87d",
        "self_care": "f86d",
        "face": "f008",
        "dentistry": "e0a6",
        "wash": "f1b1",
        "soap": "f1b2",
        "shower": "f061",
        "bathtub": "ea41",
        "wc": "e63d",
    },
    "food": {
        "breakfast_dining": "ea54",
        "free_breakfast": "eb44",
        "brunch_dining": "ea73",
        "lunch_dining": "ea61",
        "nutrition": "e110",
        "dishwasher": "e9a0",
    },
    "school": {
        "backpack": "f19c",
        "school": "e80c",
        "menu_book": "ea19",
        "schedule": "efd6",
        "directions_walk": "e536",
        "directions_bike": "e52f",
        "directions_bus": "eff6",
        "umbrella": "f1ad",
    },
    "home": {
        "home": "e9b2",
        "bed": "efdf",
        "cleaning_services": "f0ff",
        "toys": "e332",
        "potted_plant": "f8aa",
        "pets": "e91d",
        "family_restroom": "f1a2",
    },
    "free_time": {
        "sports_soccer": "ea2f",
        "pool": "eb48",
        "music_note": "e405",
        "waving_hand": "e766",
    },
    "other": {
        "star": "f09a",
        "favorite": "e87e",
        "check_circle": "f0be",
        "emoji_events": "ea23",
        "bolt": "ea0b",
    },
}

TASK_ICONS: dict[str, str] = {
    name: value for group in TASK_ICON_GROUPS.values() for name, value in group.items()
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
