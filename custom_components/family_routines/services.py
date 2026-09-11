from __future__ import annotations

import voluptuous as vol
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import (
    DEFAULT_WINDOW_END,
    DEFAULT_WINDOW_START,
    DOMAIN,
    SERVICE_ADD_ROUTINE,
    SERVICE_ADD_TASK,
    SERVICE_COMPLETE,
    SERVICE_GET_ROUTINES,
    SERVICE_KEEPALIVE,
    SERVICE_LEARN_CARD,
    SERVICE_REMOVE_ROUTINE,
    SERVICE_REMOVE_TASK,
    SERVICE_RESET,
    SERVICE_SCAN,
    SERVICE_SELECT_PERSON,
)
from .coordinator import FamilyRoutinesCoordinator
from .icons import TASK_ICONS, codepoint

SCAN_SCHEMA = vol.Schema(
    {
        vol.Required("uid"): cv.string,
        vol.Required("station"): cv.string,
    }
)

LEARN_CARD_SCHEMA = vol.Schema(
    {
        vol.Optional("uid"): cv.string,
        vol.Optional("routine_id"): cv.string,
        vol.Optional("task_id"): cv.string,
        vol.Optional("person_id"): cv.string,
    }
)

COMPLETE_SCHEMA = vol.Schema(
    {
        vol.Required("routine_id"): cv.string,
        vol.Required("task_id"): cv.string,
        vol.Required("person_id"): cv.string,
        vol.Optional("completed", default=True): cv.boolean,
    }
)

SELECT_PERSON_SCHEMA = vol.Schema(
    {
        vol.Required("station"): cv.string,
        vol.Optional("person_id"): cv.string,
        vol.Optional("direction", default=1): vol.All(
            vol.Coerce(int), vol.In([-1, 1])
        ),
    }
)

KEEPALIVE_SCHEMA = vol.Schema({vol.Required("station"): cv.string})

RESET_SCHEMA = vol.Schema(
    {
        vol.Optional("routine_id"): cv.string,
        vol.Optional("person_id"): cv.string,
    }
)

ADD_ROUTINE_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("window_start", default=DEFAULT_WINDOW_START): cv.string,
        vol.Optional("window_end", default=DEFAULT_WINDOW_END): cv.string,
        vol.Optional("person_ids", default=list): vol.All(
            cv.ensure_list, [cv.string]
        ),
        vol.Optional("weekdays", default=list): cv.weekdays,
    }
)

REMOVE_ROUTINE_SCHEMA = vol.Schema({vol.Required("routine_id"): cv.string})

ADD_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("routine_id"): cv.string,
        vol.Required("label"): cv.string,
        vol.Required("icon"): cv.string,
        vol.Optional("stations", default=list): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional("weekdays", default=list): cv.weekdays,
    }
)

REMOVE_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("routine_id"): cv.string,
        vol.Required("task_id"): cv.string,
    }
)


def _station_id(coordinator: FamilyRoutinesCoordinator, reference: str) -> str:
    station = coordinator.resolve_station(reference)
    if station is None:
        raise ServiceValidationError(f"unknown station: {reference}")
    return station.id


def _person_id(coordinator: FamilyRoutinesCoordinator, reference: str) -> str:
    person = coordinator.resolve_person(reference)
    if person is None:
        raise ServiceValidationError(f"unknown person: {reference}")
    return person.id


@callback
def async_setup(hass: HomeAssistant, coordinator: FamilyRoutinesCoordinator) -> None:
    async def _scan(call: ServiceCall) -> None:
        await coordinator.async_scan(call.data["uid"], call.data["station"])

    async def _learn_card(call: ServiceCall) -> None:
        routine_id = call.data.get("routine_id")
        task_id = call.data.get("task_id")
        person_reference = call.data.get("person_id")
        person_id = (
            _person_id(coordinator, person_reference) if person_reference else None
        )

        if not (routine_id and task_id) and person_id is None:
            raise ServiceValidationError(
                "learn_card needs either routine_id plus task_id, or person_id"
            )

        if routine_id:
            routine = coordinator.routines.get(routine_id)
            if routine is None:
                raise ServiceValidationError(f"unknown routine: {routine_id}")
            if task_id and routine.get_task(task_id) is None:
                raise ServiceValidationError(f"unknown task: {task_id}")

        uid = call.data.get("uid") or coordinator.last_unknown_uid
        binding = {
            "routine_id": routine_id,
            "task_id": task_id,
            "person_id": person_id,
        }

        if uid is None:
            coordinator.pending_learn = binding
            return

        existing = coordinator.cards.get(uid)
        if existing is not None:
            raise ServiceValidationError(
                f"card {uid} is already assigned to "
                f"{coordinator.describe_card(existing)}"
            )

        await coordinator.async_bind_card(uid, **binding)

    async def _complete(call: ServiceCall) -> None:
        routine_id = call.data["routine_id"]
        routine = coordinator.routines.get(routine_id)
        if routine is None:
            raise ServiceValidationError(f"unknown routine: {routine_id}")

        task_id = call.data["task_id"]
        if routine.get_task(task_id) is None:
            raise ServiceValidationError(f"unknown task: {task_id}")

        await coordinator.async_complete(
            routine_id,
            task_id,
            _person_id(coordinator, call.data["person_id"]),
            call.data["completed"],
        )

    async def _select_person(call: ServiceCall) -> None:
        person_reference = call.data.get("person_id")
        coordinator.async_select_person(
            _station_id(coordinator, call.data["station"]),
            person_id=(
                _person_id(coordinator, person_reference) if person_reference else None
            ),
            direction=call.data["direction"],
        )

    async def _keepalive(call: ServiceCall) -> None:
        coordinator.async_keepalive(_station_id(coordinator, call.data["station"]))

    async def _reset(call: ServiceCall) -> None:
        person_reference = call.data.get("person_id")
        person_id = (
            _person_id(coordinator, person_reference) if person_reference else None
        )

        routine_id = call.data.get("routine_id")
        if routine_id is not None:
            if coordinator.routines.get(routine_id) is None:
                raise ServiceValidationError(f"unknown routine: {routine_id}")
            await coordinator.async_reset(routine_id, person_id)
            return

        for routine in coordinator.routines.routines:
            await coordinator.async_reset(routine.id, person_id)

    async def _add_routine(call: ServiceCall) -> ServiceResponse:
        person_ids = [
            _person_id(coordinator, reference) for reference in call.data["person_ids"]
        ]
        routine = await coordinator.async_add_routine(
            call.data["name"],
            window_start=call.data["window_start"],
            window_end=call.data["window_end"],
            person_ids=person_ids,
            weekdays=call.data["weekdays"],
        )
        return {"routine_id": routine.id}

    async def _remove_routine(call: ServiceCall) -> None:
        if not await coordinator.async_remove_routine(call.data["routine_id"]):
            raise ServiceValidationError(f"unknown routine: {call.data['routine_id']}")

    async def _add_task(call: ServiceCall) -> ServiceResponse:
        routine_id = call.data["routine_id"]
        if coordinator.routines.get(routine_id) is None:
            raise ServiceValidationError(f"unknown routine: {routine_id}")

        stations = [
            _station_id(coordinator, reference) for reference in call.data["stations"]
        ]
        icon = call.data["icon"]
        if not codepoint(icon):
            raise ServiceValidationError(
                f"unknown icon: {icon}. Pick one of "
                f"{', '.join(sorted(TASK_ICONS))} or give a hex codepoint."
            )

        task = await coordinator.async_add_task(
            routine_id,
            label=call.data["label"],
            icon=icon,
            stations=stations,
            weekdays=call.data["weekdays"],
        )
        return {"task_id": task.id if task else None}

    async def _remove_task(call: ServiceCall) -> None:
        removed = await coordinator.async_remove_task(
            call.data["routine_id"], call.data["task_id"]
        )
        if not removed:
            raise ServiceValidationError(f"unknown task: {call.data['task_id']}")

    async def _get_routines(_call: ServiceCall) -> ServiceResponse:
        return coordinator.dump()

    hass.services.async_register(DOMAIN, SERVICE_SCAN, _scan, schema=SCAN_SCHEMA)
    hass.services.async_register(
        DOMAIN, SERVICE_LEARN_CARD, _learn_card, schema=LEARN_CARD_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_COMPLETE, _complete, schema=COMPLETE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SELECT_PERSON, _select_person, schema=SELECT_PERSON_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_KEEPALIVE, _keepalive, schema=KEEPALIVE_SCHEMA
    )
    hass.services.async_register(DOMAIN, SERVICE_RESET, _reset, schema=RESET_SCHEMA)
    hass.services.async_register(
        DOMAIN,
        SERVICE_ADD_ROUTINE,
        _add_routine,
        schema=ADD_ROUTINE_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_REMOVE_ROUTINE,
        _remove_routine,
        schema=REMOVE_ROUTINE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_ADD_TASK,
        _add_task,
        schema=ADD_TASK_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REMOVE_TASK, _remove_task, schema=REMOVE_TASK_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_ROUTINES,
        _get_routines,
        supports_response=SupportsResponse.ONLY,
    )


@callback
def async_unload(hass: HomeAssistant) -> None:
    for service in (
        SERVICE_SCAN,
        SERVICE_LEARN_CARD,
        SERVICE_COMPLETE,
        SERVICE_SELECT_PERSON,
        SERVICE_KEEPALIVE,
        SERVICE_RESET,
        SERVICE_ADD_ROUTINE,
        SERVICE_REMOVE_ROUTINE,
        SERVICE_ADD_TASK,
        SERVICE_REMOVE_TASK,
        SERVICE_GET_ROUTINES,
    ):
        hass.services.async_remove(DOMAIN, service)
