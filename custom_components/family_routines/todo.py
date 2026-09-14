from __future__ import annotations

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SIGNAL_ROUTINES_CHANGED, SIGNAL_STATE_CHANGED
from .coordinator import FamilyRoutinesCoordinator, async_get_coordinator
from .entities import person_device_info
from .schedule import window_weekday


UNIQUE_ID_MARKER = "_routine_"


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = async_get_coordinator(hass)
    registry = er.async_get(hass)
    known: set[tuple[str, str]] = set()

    @callback
    def _sync_routines() -> None:
        persons = coordinator.persons()
        live: set[tuple[str, str]] = set()
        pending: dict[str, list[RoutineTodoList]] = {}
        for routine in coordinator.routines.ordered():
            for person_id in routine.person_ids:
                person = persons.get(person_id)
                if person is None:
                    continue
                key = (routine.id, person_id)
                live.add(key)
                if key in known:
                    continue
                known.add(key)
                pending.setdefault(person_id, []).append(
                    RoutineTodoList(coordinator, routine.id, person)
                )

        for entry in er.async_entries_for_config_entry(registry, config_entry.entry_id):
            if entry.domain != "todo" or entry.platform != DOMAIN:
                continue
            person_id, marker, routine_id = entry.unique_id.partition(UNIQUE_ID_MARKER)
            if not marker or (routine_id, person_id) in live:
                continue
            known.discard((routine_id, person_id))
            registry.async_remove(entry.entity_id)

        for person_id, entities in pending.items():
            async_add_entities(entities, config_subentry_id=person_id)

    _sync_routines()
    config_entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_ROUTINES_CHANGED, _sync_routines)
    )


class RoutineTodoList(TodoListEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_supported_features = TodoListEntityFeature.UPDATE_TODO_ITEM

    def __init__(
        self,
        coordinator: FamilyRoutinesCoordinator,
        routine_id: str,
        person,
    ) -> None:
        self._coordinator = coordinator
        self._routine_id = routine_id
        self._person_id = person.id
        self._attr_unique_id = f"{person.id}{UNIQUE_ID_MARKER}{routine_id}"
        self._attr_device_info = person_device_info(person.id, person.name)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_STATE_CHANGED, self._handle_update
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def name(self) -> str | None:
        routine = self._coordinator.routines.get(self._routine_id)
        return routine.name if routine else None

    @property
    def available(self) -> bool:
        return self._coordinator.routines.get(self._routine_id) is not None

    @property
    def todo_items(self) -> list[TodoItem] | None:
        routine = self._coordinator.routines.get(self._routine_id)
        if routine is None:
            return None

        completed = self._coordinator.day.completed(self._routine_id, self._person_id)
        return [
            TodoItem(
                uid=task.id,
                summary=task.label,
                status=(
                    TodoItemStatus.COMPLETED
                    if task.id in completed
                    else TodoItemStatus.NEEDS_ACTION
                ),
            )
            for task in routine.tasks_on(
                window_weekday(dt_util.now(), routine.window_start)
            )
        ]

    async def async_update_todo_item(self, item: TodoItem) -> None:
        if item.uid is None:
            return
        await self._coordinator.async_complete(
            self._routine_id,
            item.uid,
            self._person_id,
            item.status == TodoItemStatus.COMPLETED,
        )
