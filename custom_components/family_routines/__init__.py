from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntry

from . import panel, services, websocket_api
from .const import DOMAIN, GLOBAL_DATA_KEY, PLATFORMS
from .coordinator import FamilyRoutinesCoordinator

FRONTEND_REGISTERED = "_frontend_registered"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = FamilyRoutinesCoordinator(hass, entry)
    await coordinator.async_load()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][GLOBAL_DATA_KEY] = {"entry": entry, "coordinator": coordinator}

    services.async_setup(hass, coordinator)

    if not hass.data[DOMAIN].get(FRONTEND_REGISTERED):
        websocket_api.async_setup(hass)
        await panel.async_setup(hass)
        hass.data[DOMAIN][FRONTEND_REGISTERED] = True

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))

    return True


async def async_remove_config_entry_device(
    hass: HomeAssistant, entry: ConfigEntry, device: DeviceEntry
) -> bool:
    return not any(
        domain == DOMAIN and identifier in entry.subentries
        for domain, identifier in device.identifiers
    )


async def _async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        global_data = hass.data[DOMAIN].pop(GLOBAL_DATA_KEY, None)
        if global_data is not None:
            global_data["coordinator"].async_shutdown()
        services.async_unload(hass)

    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    panel.async_remove(hass)
    hass.data.get(DOMAIN, {}).pop(FRONTEND_REGISTERED, None)
