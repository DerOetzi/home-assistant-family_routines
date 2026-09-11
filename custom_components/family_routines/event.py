from __future__ import annotations

from homeassistant.components.event import EventEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import EVENT_SCAN, SUBENTRY_TYPE_STATION
from .entities import station_device_info

EVENT_TYPE_KNOWN = "card"
EVENT_TYPE_UNKNOWN = "unknown_card"


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    for subentry_id, subentry in config_entry.subentries.items():
        if subentry.subentry_type != SUBENTRY_TYPE_STATION:
            continue
        async_add_entities(
            [StationScanEvent(subentry_id, subentry.title)],
            config_subentry_id=subentry_id,
        )


class StationScanEvent(EventEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_translation_key = "scan"
    _attr_event_types = [EVENT_TYPE_KNOWN, EVENT_TYPE_UNKNOWN]

    def __init__(self, subentry_id: str, name: str) -> None:
        self._subentry_id = subentry_id
        self._attr_unique_id = f"{subentry_id}_scan"
        self._attr_device_info = station_device_info(subentry_id, name)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            self.hass.bus.async_listen(EVENT_SCAN, self._handle_scan)
        )

    @callback
    def _handle_scan(self, event: Event) -> None:
        if event.data.get("station") != self._subentry_id:
            return
        event_type = EVENT_TYPE_KNOWN if event.data.get("known") else EVENT_TYPE_UNKNOWN
        self._trigger_event(event_type, {"uid": event.data.get("uid")})
        self.async_write_ha_state()
