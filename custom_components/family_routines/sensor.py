from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import SIGNAL_STATE_CHANGED, SUBENTRY_TYPE_PERSON, SUBENTRY_TYPE_STATION
from .coordinator import FamilyRoutinesCoordinator, async_get_coordinator
from .entities import person_device_info, station_device_info


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator = async_get_coordinator(hass)

    for subentry_id, subentry in config_entry.subentries.items():
        if subentry.subentry_type == SUBENTRY_TYPE_STATION:
            async_add_entities(
                [StationSensor(coordinator, subentry_id, subentry.title)],
                config_subentry_id=subentry_id,
            )
        elif subentry.subentry_type == SUBENTRY_TYPE_PERSON:
            async_add_entities(
                [PersonProgressSensor(coordinator, subentry_id, subentry.title)],
                config_subentry_id=subentry_id,
            )


class FamilyRoutinesSensor(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, coordinator: FamilyRoutinesCoordinator, subentry_id: str) -> None:
        self._coordinator = coordinator
        self._subentry_id = subentry_id

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_STATE_CHANGED, self._handle_update
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()


class StationSensor(FamilyRoutinesSensor):
    _attr_translation_key = "station"

    def __init__(
        self, coordinator: FamilyRoutinesCoordinator, subentry_id: str, name: str
    ) -> None:
        super().__init__(coordinator, subentry_id)
        self._attr_unique_id = f"{subentry_id}_station"
        self._attr_device_info = station_device_info(subentry_id, name)

    @property
    def native_value(self) -> str:
        state, _attributes = self._coordinator.view_for_station(self._subentry_id)
        return state

    @property
    def extra_state_attributes(self) -> dict:
        _state, attributes = self._coordinator.view_for_station(self._subentry_id)
        return attributes


class PersonProgressSensor(FamilyRoutinesSensor):
    _attr_translation_key = "progress"
    _attr_native_unit_of_measurement = "%"

    def __init__(
        self, coordinator: FamilyRoutinesCoordinator, subentry_id: str, name: str
    ) -> None:
        super().__init__(coordinator, subentry_id)
        self._attr_unique_id = f"{subentry_id}_progress"
        self._attr_device_info = person_device_info(subentry_id, name)

    @property
    def native_value(self) -> int:
        done, total = self._coordinator.progress(self._subentry_id)
        if not total:
            return 0
        return round(done * 100 / total)

    @property
    def extra_state_attributes(self) -> dict:
        done, total = self._coordinator.progress(self._subentry_id)
        return {"done_count": done, "total": total}
