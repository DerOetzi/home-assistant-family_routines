from __future__ import annotations

DOMAIN = "family_routines"

STORAGE_VERSION = 1

GLOBAL_DATA_KEY = "_global"

SUBENTRY_TYPE_PERSON = "person"
SUBENTRY_TYPE_STATION = "station"

PLATFORMS: list[str] = []

CONF_NAME = "name"
CONF_COLOR = "color"
CONF_STATUS_CARD_UID = "status_card_uid"
CONF_SHORT_NAME = "short_name"
CONF_SIGNPOST_ICON = "signpost_icon"
CONF_DEVICE_NAME = "device_name"
CONF_TASKS_PER_STATION = "tasks_per_station"

DEFAULT_COLOR = "#186079"
DEFAULT_SIGNPOST_ICON = "arrow_forward"

STATE_IDLE = "idle"
STATE_TASK = "task"
STATE_ELSEWHERE = "elsewhere"
STATE_DONE = "done"

DOT_DONE = "x"
DOT_OPEN_HERE = "o"
DOT_OPEN_ELSEWHERE = "."
DOT_LEFT_BEHIND = "!"

CONTEXT_TIMEOUT = 60
RESET_HOUR = 3
RESET_MINUTE = 30

SERVICE_SCAN = "scan"
SERVICE_LEARN_CARD = "learn_card"
SERVICE_COMPLETE = "complete"
SERVICE_SELECT_PERSON = "select_person"
SERVICE_KEEPALIVE = "keepalive"
SERVICE_RESET = "reset"
