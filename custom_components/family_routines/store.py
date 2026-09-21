from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CARD_KIND_STATUS,
    CARD_KIND_TASK,
    DEFAULT_WINDOW_END,
    DEFAULT_WINDOW_START,
    DOMAIN,
    STORAGE_VERSION,
)
from .models import Card, Routine, Task


class RoutineStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.routines")
        self.routines: list[Routine] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if not data:
            return
        self.routines = [
            Routine(**self._routine_fields(routine))
            for routine in data.get("routines", [])
        ]

    @staticmethod
    def _routine_fields(routine: dict) -> dict:
        fields = {
            **routine,
            "tasks": [Task(**task) for task in routine.get("tasks", [])],
        }
        legacy = fields.pop("person_ids", None)
        if "person_id" not in fields:
            fields["person_id"] = next(iter(legacy or []), "")
        return fields

    async def async_save(self) -> None:
        await self._store.async_save(
            {"routines": [dataclasses.asdict(r) for r in self.routines]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def ordered(self) -> list[Routine]:
        return sorted(self.routines, key=lambda routine: routine.sort_index)

    def get(self, routine_id: str) -> Routine | None:
        for routine in self.routines:
            if routine.id == routine_id:
                return routine
        return None

    def for_person(self, person_id: str) -> list[Routine]:
        return [r for r in self.ordered() if r.person_id == person_id]

    def add(
        self,
        name: str,
        *,
        window_start: str = DEFAULT_WINDOW_START,
        window_end: str = DEFAULT_WINDOW_END,
        person_id: str = "",
        weekdays: list[str] | None = None,
    ) -> Routine:
        routine = Routine(
            id=uuid.uuid4().hex,
            name=name,
            sort_index=len(self.routines),
            window_start=window_start,
            window_end=window_end,
            person_id=person_id,
            weekdays=list(weekdays) if weekdays else [],
        )
        self.routines.append(routine)
        return routine

    def update(
        self,
        routine_id: str,
        *,
        name: str | None = None,
        window_start: str | None = None,
        window_end: str | None = None,
        person_id: str | None = None,
        weekdays: list[str] | None = None,
    ) -> Routine | None:
        routine = self.get(routine_id)
        if routine is None:
            return None
        if name is not None:
            routine.name = name
        if window_start is not None:
            routine.window_start = window_start
        if window_end is not None:
            routine.window_end = window_end
        if person_id is not None:
            routine.person_id = person_id
        if weekdays is not None:
            routine.weekdays = list(weekdays)
        return routine

    def remove(self, routine_id: str) -> bool:
        routine = self.get(routine_id)
        if routine is None:
            return False
        self.routines.remove(routine)
        return True

    def reorder(self, routine_ids: list[str]) -> None:
        for index, routine_id in enumerate(routine_ids):
            routine = self.get(routine_id)
            if routine is not None:
                routine.sort_index = index

    def add_task(
        self,
        routine_id: str,
        *,
        label: str,
        icon: str,
        stations: list[str] | None = None,
        weekdays: list[str] | None = None,
    ) -> Task | None:
        routine = self.get(routine_id)
        if routine is None:
            return None
        task = Task(
            id=uuid.uuid4().hex,
            label=label,
            icon=icon,
            sort_index=len(routine.tasks),
            stations=list(stations) if stations else [],
            weekdays=list(weekdays) if weekdays else [],
        )
        routine.tasks.append(task)
        return task

    def update_task(
        self,
        routine_id: str,
        task_id: str,
        *,
        label: str | None = None,
        icon: str | None = None,
        stations: list[str] | None = None,
        weekdays: list[str] | None = None,
    ) -> Task | None:
        routine = self.get(routine_id)
        if routine is None:
            return None
        task = routine.get_task(task_id)
        if task is None:
            return None
        if label is not None:
            task.label = label
        if icon is not None:
            task.icon = icon
        if stations is not None:
            task.stations = list(stations)
        if weekdays is not None:
            task.weekdays = list(weekdays)
        return task

    def remove_task(self, routine_id: str, task_id: str) -> bool:
        routine = self.get(routine_id)
        if routine is None:
            return False
        task = routine.get_task(task_id)
        if task is None:
            return False
        routine.tasks.remove(task)
        return True

    def reorder_tasks(self, routine_id: str, task_ids: list[str]) -> None:
        routine = self.get(routine_id)
        if routine is None:
            return
        for index, task_id in enumerate(task_ids):
            task = routine.get_task(task_id)
            if task is not None:
                task.sort_index = index

    def drop_station(self, station_id: str) -> bool:
        changed = False
        for routine in self.routines:
            for task in routine.tasks:
                if station_id in task.stations:
                    task.stations.remove(station_id)
                    changed = True
        return changed


class CardStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.cards")
        self.cards: list[Card] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.cards = [Card(**card) for card in data.get("cards", [])]

    async def async_save(self) -> None:
        await self._store.async_save(
            {"cards": [dataclasses.asdict(c) for c in self.cards]}
        )

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def get(self, uid: str) -> Card | None:
        for card in self.cards:
            if card.uid == uid:
                return card
        return None

    def find_task_card(self, routine_id: str, task_id: str) -> Card | None:
        for card in self.cards:
            if (
                card.kind == CARD_KIND_TASK
                and card.routine_id == routine_id
                and card.task_id == task_id
            ):
                return card
        return None

    def find_status_card(self, person_id: str) -> Card | None:
        for card in self.cards:
            if card.kind == CARD_KIND_STATUS and card.person_id == person_id:
                return card
        return None

    def add_task_card(self, uid: str, *, routine_id: str, task_id: str) -> Card:
        card = Card(
            uid=uid,
            kind=CARD_KIND_TASK,
            routine_id=routine_id,
            task_id=task_id,
        )
        self.cards.append(card)
        return card

    def add_status_card(self, uid: str, *, person_id: str) -> Card:
        card = Card(uid=uid, kind=CARD_KIND_STATUS, person_id=person_id)
        self.cards.append(card)
        return card

    def remove(self, uid: str) -> bool:
        card = self.get(uid)
        if card is None:
            return False
        self.cards.remove(card)
        return True

    def drop_routine(self, routine_id: str) -> bool:
        stale = [c for c in self.cards if c.routine_id == routine_id]
        for card in stale:
            self.cards.remove(card)
        return bool(stale)

    def drop_task(self, routine_id: str, task_id: str) -> bool:
        stale = [
            c for c in self.cards if c.routine_id == routine_id and c.task_id == task_id
        ]
        for card in stale:
            self.cards.remove(card)
        return bool(stale)


class DayStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.day")
        self.routines: dict[str, dict] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.routines = data.get("routines", {})

    async def async_save(self) -> None:
        await self._store.async_save({"routines": self.routines})

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def _routine_state(self, routine_id: str) -> dict:
        state = self.routines.setdefault(routine_id, {"last_reset": None, "tasks": {}})
        legacy = state.pop("persons", None)
        if legacy:
            merged: dict[str, str] = {}
            for completed in legacy.values():
                merged.update(completed)
            state["tasks"] = {**merged, **state.get("tasks", {})}
        state.setdefault("tasks", {})
        return state

    def last_reset(self, routine_id: str) -> datetime | None:
        stamp = self._routine_state(routine_id).get("last_reset")
        if not stamp:
            return None
        return dt_util.parse_datetime(stamp)

    def completed(self, routine_id: str) -> dict[str, str]:
        return self._routine_state(routine_id)["tasks"]

    def is_done(self, routine_id: str, task_id: str) -> bool:
        return task_id in self.completed(routine_id)

    def set_done(self, routine_id: str, task_id: str) -> bool:
        completed = self.completed(routine_id)
        if task_id in completed:
            return False
        completed[task_id] = dt_util.utcnow().isoformat()
        return True

    def clear_done(self, routine_id: str, task_id: str) -> bool:
        return self.completed(routine_id).pop(task_id, None) is not None

    def reset(self, routine_id: str, *, stamp: datetime | None = None) -> None:
        state = self._routine_state(routine_id)
        state["tasks"] = {}
        state["last_reset"] = (stamp or dt_util.utcnow()).isoformat()

    def drop_routine(self, routine_id: str) -> None:
        self.routines.pop(routine_id, None)

    def drop_task(self, routine_id: str, task_id: str) -> None:
        self.completed(routine_id).pop(task_id, None)
