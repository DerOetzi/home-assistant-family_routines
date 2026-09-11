from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import SIGNAL_ROUTINES_CHANGED
from .coordinator import FamilyRoutinesCoordinator, async_get_coordinator
from .entities import routine_device_info


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = async_get_coordinator(hass)
    known: set[str] = set()

    @callback
    def _sync_routines() -> None:
        new = []
        for routine in coordinator.routines.ordered():
            if routine.id in known:
                continue
            known.add(routine.id)
            new.append(RoutineResetButton(coordinator, routine.id, routine.name))
        if new:
            async_add_entities(new)

    _sync_routines()
    config_entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_ROUTINES_CHANGED, _sync_routines)
    )


class RoutineResetButton(ButtonEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "reset"

    def __init__(
        self, coordinator: FamilyRoutinesCoordinator, routine_id: str, name: str
    ) -> None:
        self._coordinator = coordinator
        self._routine_id = routine_id
        self._attr_unique_id = f"routine_{routine_id}_reset"
        self._attr_device_info = routine_device_info(routine_id, name)

    @property
    def available(self) -> bool:
        return self._coordinator.routines.get(self._routine_id) is not None

    async def async_press(self) -> None:
        await self._coordinator.async_reset(self._routine_id)
