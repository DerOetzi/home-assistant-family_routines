from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN


def person_device_info(subentry_id: str, name: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, subentry_id)},
        name=name,
        manufacturer="Family Routines",
        model="Person",
    )


def station_device_info(subentry_id: str, name: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, subentry_id)},
        name=name,
        manufacturer="Family Routines",
        model="Station",
    )
