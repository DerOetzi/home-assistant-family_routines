from __future__ import annotations

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import SIGNAL_ROUTINES_CHANGED, SIGNAL_STATE_CHANGED
from .coordinator import FamilyRoutinesCoordinator, async_get_coordinator
from .entities import person_device_info
from .schedule import window_weekday


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = async_get_coordinator(hass)
    known: set[tuple[str, str]] = set()

    @callback
    def _sync_routines() -> None:
        persons = coordinator.persons()
        new = []
        for routine in coordinator.routines.ordered():
            for person_id in routine.person_ids:
                person = persons.get(person_id)
                if person is None or (routine.id, person_id) in known:
                    continue
                known.add((routine.id, person_id))
                new.append(
                    RoutineTodoList(coordinator, routine.id, routine.name, person)
                )
        if new:
            async_add_entities(new)

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
        routine_name: str,
        person,
    ) -> None:
        self._coordinator = coordinator
        self._routine_id = routine_id
        self._person_id = person.id
        self._attr_name = routine_name
        self._attr_unique_id = f"{person.id}_routine_{routine_id}"
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
