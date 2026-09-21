from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .const import (
    ATTR_COLOR,
    ATTR_DONE_COUNT,
    ATTR_DOTS,
    ATTR_GLYPH,
    ATTR_GLYPHS,
    ATTR_INDEX,
    ATTR_LABEL,
    ATTR_LABELS,
    ATTR_PERSON,
    ATTR_ROUTINE,
    ATTR_TASK,
    ATTR_TOTAL,
    DEFAULT_COLOR,
    DONE_ICON,
    DOT_DONE,
    DOT_LEFT_BEHIND,
    DOT_OPEN_ELSEWHERE,
    DOT_OPEN_HERE,
    LABEL_SEPARATOR,
    STATE_DONE,
    STATE_ELSEWHERE,
    STATE_IDLE,
    STATE_TASK,
)
from .icons import character
from .models import Routine, Task
from .schedule import in_window, window_weekday

DONE_LABELS = {
    "de": "Geschafft",
    "nl": "Klaar",
}
DEFAULT_DONE_LABEL = "All done"


@dataclass(frozen=True)
class PersonRef:
    id: str
    name: str
    color: str


@dataclass(frozen=True)
class StationRef:
    id: str
    name: str
    short_name: str
    signpost_icon: str
    device_name: str


def done_label(language: str) -> str:
    return DONE_LABELS.get(language, DEFAULT_DONE_LABEL)


def candidate_routines(
    routines: list[Routine], now: datetime, person_id: str | None
) -> list[Routine]:
    matching = []
    for routine in routines:
        if not in_window(now, routine.window_start, routine.window_end):
            continue
        weekday = window_weekday(now, routine.window_start)
        if not routine.runs_on(weekday):
            continue
        if not routine.tasks_on(weekday):
            continue
        if person_id is not None and routine.person_id != person_id:
            continue
        matching.append(routine)
    return matching


def select_routine(
    routines: list[Routine],
    now: datetime,
    person_id: str | None,
    is_done,
) -> Routine | None:
    candidates = candidate_routines(routines, now, person_id)
    if not candidates:
        return None
    if person_id is None:
        return candidates[0]

    for routine in candidates:
        weekday = window_weekday(now, routine.window_start)
        if any(
            not is_done(routine.id, task.id) for task in routine.tasks_on(weekday)
        ):
            return routine
    return candidates[0]


def dot_for(
    task: Task, position: int, tasks: list[Task], station_id: str, done: bool
) -> str:
    if done:
        return DOT_DONE
    if task.runs_at(station_id):
        return DOT_OPEN_HERE
    if any(later.runs_at(station_id) for later in tasks[position + 1 :]):
        return DOT_LEFT_BEHIND
    return DOT_OPEN_ELSEWHERE


def signpost_for(
    task: Task, station_id: str, stations: dict[str, StationRef]
) -> StationRef | None:
    for candidate_id in task.stations:
        if candidate_id == station_id:
            continue
        station = stations.get(candidate_id)
        if station is not None:
            return station
    return None


def idle_view() -> tuple[str, dict]:
    return STATE_IDLE, {
        ATTR_ROUTINE: "",
        ATTR_PERSON: "",
        ATTR_TASK: "",
        ATTR_GLYPH: "",
        ATTR_LABEL: "",
        ATTR_COLOR: DEFAULT_COLOR,
        ATTR_DOTS: "",
        ATTR_GLYPHS: "",
        ATTR_LABELS: "",
        ATTR_INDEX: -1,
        ATTR_DONE_COUNT: 0,
        ATTR_TOTAL: 0,
    }


def build_view(
    routine: Routine,
    person: PersonRef,
    station: StationRef,
    stations: dict[str, StationRef],
    completed: dict[str, str],
    language: str,
    weekday: str,
) -> tuple[str, dict]:
    tasks = routine.tasks_on(weekday)
    if not tasks:
        return idle_view()

    dots = []
    for position, task in enumerate(tasks):
        dots.append(
            dot_for(task, position, tasks, station.id, task.id in completed)
        )

    done_count = sum(1 for task in tasks if task.id in completed)

    state = STATE_DONE
    index = -1
    task_id = ""
    glyph = character(DONE_ICON)
    label = done_label(language)

    here = next(
        (
            (position, task)
            for position, task in enumerate(tasks)
            if task.id not in completed and task.runs_at(station.id)
        ),
        None,
    )
    elsewhere = next(
        (task for task in tasks if task.id not in completed),
        None,
    )

    if here is not None:
        index, task = here
        state = STATE_TASK
        task_id = task.id
        glyph = character(task.icon)
        label = task.label
    elif elsewhere is not None:
        state = STATE_ELSEWHERE
        task_id = elsewhere.id
        target = signpost_for(elsewhere, station.id, stations)
        if target is not None:
            glyph = character(target.signpost_icon)
            label = target.short_name
        else:
            glyph = character(elsewhere.icon)
            label = elsewhere.label

    return state, {
        ATTR_ROUTINE: routine.id,
        ATTR_PERSON: person.name,
        ATTR_TASK: task_id,
        ATTR_GLYPH: glyph,
        ATTR_LABEL: label,
        ATTR_COLOR: person.color,
        ATTR_DOTS: "".join(dots),
        ATTR_GLYPHS: LABEL_SEPARATOR.join(character(t.icon) for t in tasks),
        ATTR_LABELS: LABEL_SEPARATOR.join(t.label for t in tasks),
        ATTR_INDEX: index,
        ATTR_DONE_COUNT: done_count,
        ATTR_TOTAL: len(tasks),
    }
