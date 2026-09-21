from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_time_change
from homeassistant.util import dt as dt_util

from .const import (
    CARD_KIND_STATUS,
    CARD_KIND_TASK,
    CONF_COLOR,
    CONF_DEVICE_NAME,
    CONF_NAME,
    CONF_SHORT_NAME,
    CONF_SIGNPOST_ICON,
    CONF_STATUS_CARD_UID,
    CONTEXT_TIMEOUT,
    DEFAULT_COLOR,
    DEFAULT_SIGNPOST_ICON,
    DOMAIN,
    EVENT_CARD_UNKNOWN,
    EVENT_SCAN,
    GLOBAL_DATA_KEY,
    SIGNAL_ROUTINES_CHANGED,
    SCAN_DONE,
    SCAN_LEARNED,
    SCAN_PERSON,
    SCAN_REPEAT,
    SCAN_UNKNOWN,
    SCAN_WRONG_PLACE,
    SIGNAL_STATE_CHANGED,
    SUBENTRY_TYPE_PERSON,
    SUBENTRY_TYPE_STATION,
)
from .icons import SIGNPOST_ICONS, TASK_ICON_GROUPS, TASK_ICONS, character
from .models import Card, Routine
from .routine import PersonRef, StationRef, build_view, idle_view, select_routine
from .schedule import in_window, parse_time, previous_window_start, window_weekday
from .store import CardStore, DayStore, RoutineStore


class FamilyRoutinesCoordinator:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.routines = RoutineStore(hass)
        self.cards = CardStore(hass)
        self.day = DayStore(hass)
        self.last_unknown_uid: str | None = None
        self.pending_learn: dict | None = None
        self._context: dict[str, str] = {}
        self._context_timers: dict[str, Callable[[], None]] = {}
        self._reset_timers: list[Callable[[], None]] = []
        self._scan_seq = 0
        self._last_scan: dict[str, str] = {}

    async def async_load(self) -> None:
        await self.routines.async_load()
        await self.cards.async_load()
        await self.day.async_load()
        await self.async_sync_subentries()
        await self.async_catch_up_resets()
        self.async_schedule_resets()

    async def async_sync_subentries(self) -> None:
        persons = self.persons()
        stations = self.stations()

        routines_changed = False
        for routine in self.routines.routines:
            if routine.person_id and routine.person_id not in persons:
                routine.person_id = ""
                routines_changed = True
            for task in routine.tasks:
                stale = [s for s in task.stations if s not in stations]
                for station_id in stale:
                    task.stations.remove(station_id)
                    routines_changed = True

        cards_changed = False
        for card in self.cards.cards:
            if card.kind == CARD_KIND_TASK and card.person_id:
                card.person_id = None
                cards_changed = True

        for person_id in list(self.persons()):
            subentry = self.entry.subentries.get(person_id)
            if subentry is None:
                continue
            uid = (subentry.data.get(CONF_STATUS_CARD_UID) or "").strip()
            if not uid:
                continue
            existing = self.cards.get(uid)
            if existing is not None:
                continue
            previous = self.cards.find_status_card(person_id)
            if previous is not None:
                self.cards.remove(previous.uid)
            self.cards.add_status_card(uid, person_id=person_id)
            cards_changed = True

        for card in list(self.cards.cards):
            if card.person_id and card.person_id not in persons:
                self.cards.remove(card.uid)
                cards_changed = True
                continue
            if not card.routine_id:
                continue
            routine = self.routines.get(card.routine_id)
            if routine is None or (
                card.task_id and routine.get_task(card.task_id) is None
            ):
                self.cards.remove(card.uid)
                cards_changed = True

        if routines_changed:
            await self.routines.async_save()
        if cards_changed:
            await self.cards.async_save()

    @callback
    def async_shutdown(self) -> None:
        for cancel in self._context_timers.values():
            cancel()
        self._context_timers.clear()
        self._cancel_reset_timers()

    def _cancel_reset_timers(self) -> None:
        for cancel in self._reset_timers:
            cancel()
        self._reset_timers.clear()

    def persons(self) -> dict[str, PersonRef]:
        found: dict[str, PersonRef] = {}
        for subentry_id, subentry in self.entry.subentries.items():
            if subentry.subentry_type != SUBENTRY_TYPE_PERSON:
                continue
            found[subentry_id] = PersonRef(
                id=subentry_id,
                name=subentry.data.get(CONF_NAME, subentry.title),
                color=subentry.data.get(CONF_COLOR, DEFAULT_COLOR),
            )
        return found

    def stations(self) -> dict[str, StationRef]:
        found: dict[str, StationRef] = {}
        for subentry_id, subentry in self.entry.subentries.items():
            if subentry.subentry_type != SUBENTRY_TYPE_STATION:
                continue
            name = subentry.data.get(CONF_NAME, subentry.title)
            found[subentry_id] = StationRef(
                id=subentry_id,
                name=name,
                short_name=subentry.data.get(CONF_SHORT_NAME, name),
                signpost_icon=subentry.data.get(
                    CONF_SIGNPOST_ICON, DEFAULT_SIGNPOST_ICON
                ),
                device_name=subentry.data.get(CONF_DEVICE_NAME, ""),
            )
        return found

    def resolve_station(self, reference: str) -> StationRef | None:
        stations = self.stations()
        if reference in stations:
            return stations[reference]
        for station in stations.values():
            if reference in (station.device_name, station.name, station.short_name):
                return station
        return None

    def resolve_person(self, reference: str) -> PersonRef | None:
        persons = self.persons()
        if reference in persons:
            return persons[reference]
        for person in persons.values():
            if person.name == reference:
                return person
        return None

    def context_person_id(self, station_id: str) -> str | None:
        return self._context.get(station_id)

    def active_routine(self, station_id: str) -> Routine | None:
        return select_routine(
            self.routines.ordered(),
            dt_util.now(),
            self.context_person_id(station_id),
            self.day.is_done,
        )

    def view_for_station(self, station_id: str) -> tuple[str, dict]:
        if self.context_person_id(station_id) is None:
            return idle_view()

        stations = self.stations()
        station = stations.get(station_id)
        routine = self.active_routine(station_id)
        if station is None or routine is None:
            return idle_view()

        person = self.persons().get(routine.person_id)
        if person is None:
            return idle_view()

        return build_view(
            routine,
            person,
            station,
            stations,
            self.day.completed(routine.id),
            self.hass.config.language,
            window_weekday(dt_util.now(), routine.window_start),
        )

    def progress(self, person_id: str) -> tuple[int, int]:
        done = 0
        total = 0
        now = dt_util.now()
        for routine in self.routines.for_person(person_id):
            if not in_window(now, routine.window_start, routine.window_end):
                continue
            weekday = window_weekday(now, routine.window_start)
            if not routine.runs_on(weekday):
                continue
            tasks = routine.tasks_on(weekday)
            completed = self.day.completed(routine.id)
            total += len(tasks)
            done += sum(1 for task in tasks if task.id in completed)
        return done, total

    @callback
    def async_set_context(self, station_id: str, person_id: str | None) -> None:
        cancel = self._context_timers.pop(station_id, None)
        if cancel is not None:
            cancel()

        if person_id is None:
            self._context.pop(station_id, None)
            self.async_notify()
            return

        self._context[station_id] = person_id
        self._context_timers[station_id] = async_call_later(
            self.hass, CONTEXT_TIMEOUT, self._make_context_expiry(station_id)
        )
        self.async_notify()

    def _make_context_expiry(self, station_id: str):
        @callback
        def _expire(_now: datetime) -> None:
            self._context_timers.pop(station_id, None)
            self._context.pop(station_id, None)
            self.async_notify()

        return _expire

    @callback
    def async_keepalive(self, station_id: str) -> None:
        if station_id in self._context:
            self.async_set_context(station_id, self._context[station_id])

    @callback
    def async_notify(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_STATE_CHANGED)

    @callback
    def async_notify_routines(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_ROUTINES_CHANGED)
        self.async_notify()

    def last_scan(self, station_id: str) -> str:
        return self._last_scan.get(station_id, "")

    def _record_scan(self, station_id: str, result: str) -> None:
        self._scan_seq += 1
        self._last_scan[station_id] = f"{self._scan_seq}:{result}"

    async def async_scan(self, uid: str, station_reference: str) -> None:
        station = self.resolve_station(station_reference)
        if station is None:
            return

        card = self.cards.get(uid)
        self.hass.bus.async_fire(
            EVENT_SCAN,
            {"uid": uid, "station": station.id, "known": card is not None},
        )

        if card is None and self.pending_learn is not None:
            pending = self.pending_learn
            self.pending_learn = None
            await self.async_bind_card(uid, **pending)
            self._record_scan(station.id, SCAN_LEARNED)
            self.async_notify()
            return

        if card is None:
            self.last_unknown_uid = uid
            self._record_scan(station.id, SCAN_UNKNOWN)
            self.hass.bus.async_fire(
                EVENT_CARD_UNKNOWN, {"uid": uid, "station": station.id}
            )
            self.async_notify()
            return

        if card.kind == CARD_KIND_STATUS and card.person_id:
            self._record_scan(station.id, SCAN_PERSON)
            self.async_set_context(station.id, card.person_id)
            return

        await self._async_apply_task_card(card, station)

    async def _async_apply_task_card(self, card: Card, station: StationRef) -> None:
        routine = self.routines.get(card.routine_id or "")
        task = routine.get_task(card.task_id or "") if routine else None
        if routine is None or task is None or not routine.person_id:
            self._record_scan(station.id, SCAN_UNKNOWN)
            self.async_notify()
            return

        if not task.runs_at(station.id):
            self._record_scan(station.id, SCAN_WRONG_PLACE)
            self.async_set_context(station.id, routine.person_id)
            return

        if self.day.set_done(routine.id, task.id):
            await self.day.async_save()
            self._record_scan(station.id, SCAN_DONE)
        else:
            self._record_scan(station.id, SCAN_REPEAT)

        self.async_set_context(station.id, routine.person_id)

    def describe_card(self, card: Card) -> str:
        if card.kind == CARD_KIND_STATUS:
            person = self.persons().get(card.person_id or "")
            return person.name if person else card.person_id or "?"

        routine = self.routines.get(card.routine_id or "")
        if routine is None:
            return card.task_id or "?"
        task = routine.get_task(card.task_id or "")
        label = task.label if task else card.task_id or "?"
        return f"{routine.name} / {label}"

    async def async_bind_card(
        self,
        uid: str,
        *,
        routine_id: str | None = None,
        task_id: str | None = None,
        person_id: str | None = None,
    ) -> Card:
        if routine_id and task_id:
            card = self.cards.add_task_card(uid, routine_id=routine_id, task_id=task_id)
        else:
            card = self.cards.add_status_card(uid, person_id=person_id or "")

        await self.cards.async_save()
        if self.last_unknown_uid == uid:
            self.last_unknown_uid = None
        self.async_notify()
        return card

    async def async_complete(
        self, routine_id: str, task_id: str, completed: bool
    ) -> None:
        if completed:
            changed = self.day.set_done(routine_id, task_id)
        else:
            changed = self.day.clear_done(routine_id, task_id)

        if changed:
            await self.day.async_save()
            self.async_notify()

    @callback
    def async_select_person(
        self, station_id: str, *, person_id: str | None, direction: int
    ) -> None:
        if person_id is not None:
            self.async_set_context(station_id, person_id)
            return

        order = list(self.persons())
        if not order:
            return

        current = self.context_person_id(station_id)
        if current is None or current not in order:
            self.async_set_context(station_id, order[0 if direction >= 0 else -1])
            return

        position = (order.index(current) + direction) % len(order)
        self.async_set_context(station_id, order[position])

    async def async_add_routine(
        self,
        name: str,
        *,
        window_start: str,
        window_end: str,
        person_id: str,
        weekdays: list[str],
    ) -> Routine:
        routine = self.routines.add(
            name,
            window_start=window_start,
            window_end=window_end,
            person_id=person_id,
            weekdays=weekdays,
        )
        await self.routines.async_save()
        await self.async_catch_up_resets()
        self.async_schedule_resets()
        self.async_notify_routines()
        return routine

    async def async_remove_routine(self, routine_id: str) -> bool:
        if not self.routines.remove(routine_id):
            return False
        self.cards.drop_routine(routine_id)
        self.day.drop_routine(routine_id)
        await self.routines.async_save()
        await self.cards.async_save()
        await self.day.async_save()
        self.async_schedule_resets()
        self.async_notify_routines()
        return True

    async def async_add_task(
        self,
        routine_id: str,
        *,
        label: str,
        icon: str,
        stations: list[str],
        weekdays: list[str],
    ):
        task = self.routines.add_task(
            routine_id,
            label=label,
            icon=icon,
            stations=stations,
            weekdays=weekdays,
        )
        if task is not None:
            await self.routines.async_save()
            self.async_notify_routines()
        return task

    async def async_remove_task(self, routine_id: str, task_id: str) -> bool:
        if not self.routines.remove_task(routine_id, task_id):
            return False
        self.cards.drop_task(routine_id, task_id)
        self.day.drop_task(routine_id, task_id)
        await self.routines.async_save()
        await self.cards.async_save()
        await self.day.async_save()
        self.async_notify_routines()
        return True

    async def async_update_routine(
        self,
        routine_id: str,
        *,
        name: str | None = None,
        window_start: str | None = None,
        window_end: str | None = None,
        person_id: str | None = None,
        weekdays: list[str] | None = None,
    ) -> Routine:
        routine = self.routines.update(
            routine_id,
            name=name,
            window_start=window_start,
            window_end=window_end,
            person_id=person_id,
            weekdays=weekdays,
        )
        if routine is None:
            raise ServiceValidationError(f"unknown routine: {routine_id}")
        await self.routines.async_save()
        self.async_schedule_resets()
        self.async_notify_routines()
        return routine

    async def async_reorder_routines(self, routine_ids: list[str]) -> None:
        self.routines.reorder(routine_ids)
        await self.routines.async_save()
        self.async_notify_routines()

    async def async_update_task(
        self,
        routine_id: str,
        task_id: str,
        *,
        label: str | None = None,
        icon: str | None = None,
        stations: list[str] | None = None,
        weekdays: list[str] | None = None,
    ):
        task = self.routines.update_task(
            routine_id,
            task_id,
            label=label,
            icon=icon,
            stations=stations,
            weekdays=weekdays,
        )
        if task is None:
            raise ServiceValidationError(f"unknown task: {task_id}")
        await self.routines.async_save()
        self.async_notify_routines()
        return task

    async def async_reorder_tasks(self, routine_id: str, task_ids: list[str]) -> None:
        if self.routines.get(routine_id) is None:
            raise ServiceValidationError(f"unknown routine: {routine_id}")
        self.routines.reorder_tasks(routine_id, task_ids)
        await self.routines.async_save()
        self.async_notify_routines()

    async def async_learn_card(
        self,
        uid: str | None,
        *,
        routine_id: str | None = None,
        task_id: str | None = None,
        person_id: str | None = None,
    ) -> Card | None:
        if not (routine_id and task_id) and person_id is None:
            raise ServiceValidationError(
                "a card needs either a routine and a task, or a person"
            )
        if routine_id:
            routine = self.routines.get(routine_id)
            if routine is None:
                raise ServiceValidationError(f"unknown routine: {routine_id}")
            if task_id and routine.get_task(task_id) is None:
                raise ServiceValidationError(f"unknown task: {task_id}")
        if person_id is not None and person_id not in self.persons():
            raise ServiceValidationError(f"unknown person: {person_id}")

        binding = (
            {"routine_id": routine_id, "task_id": task_id}
            if routine_id and task_id
            else {"person_id": person_id}
        )
        if uid is None:
            self.pending_learn = binding
            self.async_notify()
            return None

        existing = self.cards.get(uid)
        if existing is not None:
            raise ServiceValidationError(
                f"card {uid} is already assigned to {self.describe_card(existing)}"
            )
        self.pending_learn = None
        return await self.async_bind_card(uid, **binding)

    @callback
    def async_cancel_learn(self) -> None:
        self.pending_learn = None
        self.async_notify()

    async def async_remove_card(self, uid: str) -> None:
        if not self.cards.remove(uid):
            raise ServiceValidationError(f"unknown card: {uid}")
        await self.cards.async_save()
        self.async_notify()

    def dump(self) -> dict:
        persons = self.persons()
        stations = self.stations()
        return {
            "persons": [
                {"id": p.id, "name": p.name, "color": p.color} for p in persons.values()
            ],
            "stations": [
                {
                    "id": s.id,
                    "name": s.name,
                    "short_name": s.short_name,
                    "device_name": s.device_name,
                }
                for s in stations.values()
            ],
            "routines": [
                {
                    "id": routine.id,
                    "name": routine.name,
                    "window_start": routine.window_start,
                    "window_end": routine.window_end,
                    "weekdays": routine.weekdays,
                    "person_id": routine.person_id,
                    "tasks": [
                        {
                            "id": task.id,
                            "label": task.label,
                            "icon": task.icon,
                            "glyph": character(task.icon),
                            "stations": task.stations,
                            "weekdays": task.weekdays,
                        }
                        for task in routine.ordered_tasks()
                    ],
                }
                for routine in self.routines.ordered()
            ],
            "cards": [
                {
                    "uid": card.uid,
                    "kind": card.kind,
                    "bound_to": self.describe_card(card),
                }
                for card in self.cards.cards
            ],
            "last_unknown_uid": self.last_unknown_uid,
        }

    def panel_state(self) -> dict:
        now = dt_util.now()
        persons = self.persons()
        stations = self.stations()
        routines = []
        for routine in self.routines.ordered():
            weekday = window_weekday(now, routine.window_start)
            open_now = in_window(now, routine.window_start, routine.window_end)
            today = routine.tasks_on(weekday)
            routines.append(
                {
                    "id": routine.id,
                    "name": routine.name,
                    "window_start": routine.window_start[:5],
                    "window_end": routine.window_end[:5],
                    "weekdays": routine.weekdays,
                    "person_id": routine.person_id,
                    "tasks": [
                        {
                            "id": task.id,
                            "label": task.label,
                            "icon": task.icon,
                            "glyph": character(task.icon),
                            "stations": task.stations,
                            "weekdays": task.weekdays,
                        }
                        for task in routine.ordered_tasks()
                    ],
                    "active": open_now and routine.runs_on(weekday),
                    "weekday": weekday,
                    "today_task_ids": [task.id for task in today],
                    "completed": sorted(self.day.completed(routine.id)),
                }
            )
        return {
            "persons": [
                {"id": p.id, "name": p.name, "color": p.color} for p in persons.values()
            ],
            "stations": [
                {
                    "id": s.id,
                    "name": s.name,
                    "short_name": s.short_name,
                    "signpost_icon": s.signpost_icon,
                }
                for s in stations.values()
            ],
            "routines": routines,
            "cards": [
                {
                    "uid": card.uid,
                    "kind": card.kind,
                    "person_id": card.person_id,
                    "routine_id": card.routine_id,
                    "task_id": card.task_id,
                    "bound_to": self.describe_card(card),
                }
                for card in self.cards.cards
            ],
            "task_icons": list(TASK_ICONS),
            "task_icon_groups": [
                {"id": group_id, "icons": list(icons)}
                for group_id, icons in TASK_ICON_GROUPS.items()
            ],
            "signpost_icons": sorted(SIGNPOST_ICONS),
            "last_unknown_uid": self.last_unknown_uid,
            "pending_learn": self.pending_learn,
        }

    async def async_reset(self, routine_id: str) -> None:
        self.day.reset(routine_id)
        await self.day.async_save()
        self.async_notify()

    async def async_catch_up_resets(self) -> None:
        now = dt_util.now()
        changed = False
        for routine in self.routines.routines:
            try:
                boundary = previous_window_start(now, routine.window_start)
            except ValueError:
                continue
            last = self.day.last_reset(routine.id)
            if last is None or last < boundary:
                self.day.reset(routine.id, stamp=boundary)
                changed = True
        if changed:
            await self.day.async_save()

    @callback
    def async_schedule_resets(self) -> None:
        self._cancel_reset_timers()
        for routine in self.routines.routines:
            try:
                start = parse_time(routine.window_start)
            except ValueError:
                continue
            self._reset_timers.append(
                async_track_time_change(
                    self.hass,
                    self._make_reset_handler(routine.id),
                    hour=start.hour,
                    minute=start.minute,
                    second=0,
                )
            )

    def _make_reset_handler(self, routine_id: str):
        async def _reset(_now: datetime) -> None:
            await self.async_reset(routine_id)

        return _reset


def async_get_coordinator(hass: HomeAssistant) -> FamilyRoutinesCoordinator:
    return hass.data[DOMAIN][GLOBAL_DATA_KEY]["coordinator"]
