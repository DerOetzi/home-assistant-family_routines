from __future__ import annotations

DOMAIN = "family_routines"

STORAGE_VERSION = 1

GLOBAL_DATA_KEY = "_global"

SUBENTRY_TYPE_PERSON = "person"
SUBENTRY_TYPE_STATION = "station"

PLATFORMS: list[str] = ["sensor", "event", "todo"]

CONF_NAME = "name"
CONF_COLOR = "color"
CONF_STATUS_CARD_UID = "status_card_uid"
CONF_SHORT_NAME = "short_name"
CONF_SIGNPOST_ICON = "signpost_icon"
CONF_DEVICE_NAME = "device_name"

DEFAULT_COLOR = "#186079"
DEFAULT_SIGNPOST_ICON = "arrow_forward"
DEFAULT_WINDOW_START = "04:00"
DEFAULT_WINDOW_END = "10:00"

DONE_ICON = "celebration"

STATE_IDLE = "idle"
STATE_TASK = "task"
STATE_ELSEWHERE = "elsewhere"
STATE_DONE = "done"

DOT_DONE = "x"
DOT_OPEN_HERE = "o"
DOT_OPEN_ELSEWHERE = "."
DOT_LEFT_BEHIND = "!"

ATTR_ROUTINE = "routine"
ATTR_PERSON = "person"
ATTR_TASK = "task"
ATTR_GLYPH = "glyph"
ATTR_LABEL = "label"
ATTR_COLOR = "color"
ATTR_DOTS = "dots"
ATTR_GLYPHS = "glyphs"
ATTR_LABELS = "labels"
ATTR_INDEX = "index"
ATTR_DONE_COUNT = "done_count"
ATTR_TOTAL = "total"

LABEL_SEPARATOR = "|"

CARD_KIND_TASK = "task"
CARD_KIND_STATUS = "status"

CONTEXT_TIMEOUT = 60

SERVICE_SCAN = "scan"
SERVICE_LEARN_CARD = "learn_card"
SERVICE_COMPLETE = "complete"
SERVICE_SELECT_PERSON = "select_person"
SERVICE_KEEPALIVE = "keepalive"
SERVICE_RESET = "reset"
SERVICE_ADD_ROUTINE = "add_routine"
SERVICE_REMOVE_ROUTINE = "remove_routine"
SERVICE_ADD_TASK = "add_task"
SERVICE_REMOVE_TASK = "remove_task"
SERVICE_GET_ROUTINES = "get_routines"

SIGNAL_ROUTINES_CHANGED = f"{DOMAIN}_routines_changed"
SIGNAL_STATE_CHANGED = f"{DOMAIN}_state_changed"

EVENT_CARD_UNKNOWN = f"{DOMAIN}_card_unknown"
EVENT_SCAN = f"{DOMAIN}_scan"
