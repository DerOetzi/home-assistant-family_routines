from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import WEEKDAYS
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import SIGNAL_ROUTINES_CHANGED, SIGNAL_STATE_CHANGED
from .coordinator import async_get_coordinator
from .icons import codepoint
from .schedule import parse_time

ERR_INVALID = "invalid"


def _time(value: Any) -> str:
    text = str(value)
    try:
        parsed = parse_time(text)
    except ValueError as err:
        raise vol.Invalid(str(err)) from err
    return parsed.strftime("%H:%M")


def _icon(value: Any) -> str:
    text = str(value).strip()
    if not codepoint(text):
        raise vol.Invalid(f"unknown icon: {text}")
    return text


WEEKDAY_LIST = vol.All([vol.In(WEEKDAYS)])
ID_LIST = vol.All([str])


def _handler(
    func: Callable[[HomeAssistant, dict], Awaitable[Any]],
) -> Callable:
    @websocket_api.async_response
    @wraps(func)
    async def _wrapped(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) -> None:
        try:
            result = await func(hass, msg)
        except HomeAssistantError as err:
            connection.send_error(msg["id"], ERR_INVALID, str(err))
            return
        connection.send_result(msg["id"], result)

    return _wrapped


@callback
def async_setup(hass: HomeAssistant) -> None:
    for command in (
        ws_state,
        ws_subscribe,
        ws_routine_add,
        ws_routine_update,
        ws_routine_delete,
        ws_routine_reorder,
        ws_task_add,
        ws_task_update,
        ws_task_delete,
        ws_task_reorder,
        ws_card_learn,
        ws_card_capture,
        ws_card_cancel_learn,
        ws_card_delete,
        ws_complete,
        ws_reset,
    ):
        websocket_api.async_register_command(hass, command)


@websocket_api.websocket_command({vol.Required("type"): "family_routines/state"})
@_handler
async def ws_state(hass: HomeAssistant, msg: dict) -> dict:
    return async_get_coordinator(hass).panel_state()


@websocket_api.websocket_command({vol.Required("type"): "family_routines/subscribe"})
@callback
def ws_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    @callback
    def _forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], {}))

    unsubs = [
        async_dispatcher_connect(hass, SIGNAL_STATE_CHANGED, _forward),
        async_dispatcher_connect(hass, SIGNAL_ROUTINES_CHANGED, _forward),
    ]

    @callback
    def _unsubscribe() -> None:
        for unsub in unsubs:
            unsub()

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/routines/add",
        vol.Required("name"): vol.All(str, vol.Length(min=1)),
        vol.Required("window_start"): _time,
        vol.Required("window_end"): _time,
        vol.Optional("person_id", default=""): str,
        vol.Optional("weekdays", default=[]): WEEKDAY_LIST,
    }
)
@_handler
async def ws_routine_add(hass: HomeAssistant, msg: dict) -> dict:
    routine = await async_get_coordinator(hass).async_add_routine(
        msg["name"],
        window_start=msg["window_start"],
        window_end=msg["window_end"],
        person_id=msg["person_id"],
        weekdays=msg["weekdays"],
    )
    return {"routine_id": routine.id}


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/routines/update",
        vol.Required("routine_id"): str,
        vol.Optional("name"): vol.All(str, vol.Length(min=1)),
        vol.Optional("window_start"): _time,
        vol.Optional("window_end"): _time,
        vol.Optional("person_id"): str,
        vol.Optional("weekdays"): WEEKDAY_LIST,
    }
)
@_handler
async def ws_routine_update(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_update_routine(
        msg["routine_id"],
        name=msg.get("name"),
        window_start=msg.get("window_start"),
        window_end=msg.get("window_end"),
        person_id=msg.get("person_id"),
        weekdays=msg.get("weekdays"),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/routines/delete",
        vol.Required("routine_id"): str,
    }
)
@_handler
async def ws_routine_delete(hass: HomeAssistant, msg: dict) -> None:
    if not await async_get_coordinator(hass).async_remove_routine(msg["routine_id"]):
        raise HomeAssistantError(f"unknown routine: {msg['routine_id']}")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/routines/reorder",
        vol.Required("routine_ids"): ID_LIST,
    }
)
@_handler
async def ws_routine_reorder(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_reorder_routines(msg["routine_ids"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/tasks/add",
        vol.Required("routine_id"): str,
        vol.Required("label"): vol.All(str, vol.Length(min=1)),
        vol.Required("icon"): _icon,
        vol.Optional("stations", default=[]): ID_LIST,
        vol.Optional("weekdays", default=[]): WEEKDAY_LIST,
    }
)
@_handler
async def ws_task_add(hass: HomeAssistant, msg: dict) -> dict:
    task = await async_get_coordinator(hass).async_add_task(
        msg["routine_id"],
        label=msg["label"],
        icon=msg["icon"],
        stations=msg["stations"],
        weekdays=msg["weekdays"],
    )
    if task is None:
        raise HomeAssistantError(f"unknown routine: {msg['routine_id']}")
    return {"task_id": task.id}


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/tasks/update",
        vol.Required("routine_id"): str,
        vol.Required("task_id"): str,
        vol.Optional("label"): vol.All(str, vol.Length(min=1)),
        vol.Optional("icon"): _icon,
        vol.Optional("stations"): ID_LIST,
        vol.Optional("weekdays"): WEEKDAY_LIST,
    }
)
@_handler
async def ws_task_update(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_update_task(
        msg["routine_id"],
        msg["task_id"],
        label=msg.get("label"),
        icon=msg.get("icon"),
        stations=msg.get("stations"),
        weekdays=msg.get("weekdays"),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/tasks/delete",
        vol.Required("routine_id"): str,
        vol.Required("task_id"): str,
    }
)
@_handler
async def ws_task_delete(hass: HomeAssistant, msg: dict) -> None:
    removed = await async_get_coordinator(hass).async_remove_task(
        msg["routine_id"], msg["task_id"]
    )
    if not removed:
        raise HomeAssistantError(f"unknown task: {msg['task_id']}")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/tasks/reorder",
        vol.Required("routine_id"): str,
        vol.Required("task_ids"): ID_LIST,
    }
)
@_handler
async def ws_task_reorder(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_reorder_tasks(
        msg["routine_id"], msg["task_ids"]
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/cards/learn",
        vol.Optional("uid"): vol.Any(None, str),
        vol.Optional("routine_id"): vol.Any(None, str),
        vol.Optional("task_id"): vol.Any(None, str),
        vol.Optional("person_id"): vol.Any(None, str),
    }
)
@_handler
async def ws_card_learn(hass: HomeAssistant, msg: dict) -> dict:
    card = await async_get_coordinator(hass).async_learn_card(
        msg.get("uid") or None,
        routine_id=msg.get("routine_id") or None,
        task_id=msg.get("task_id") or None,
        person_id=msg.get("person_id") or None,
    )
    return {"uid": card.uid if card else None, "pending": card is None}


@websocket_api.websocket_command(
    {vol.Required("type"): "family_routines/cards/capture"}
)
@_handler
async def ws_card_capture(hass: HomeAssistant, msg: dict) -> dict:
    return {"seq": async_get_coordinator(hass).async_start_capture()}


@websocket_api.websocket_command(
    {vol.Required("type"): "family_routines/cards/cancel_learn"}
)
@_handler
async def ws_card_cancel_learn(hass: HomeAssistant, msg: dict) -> None:
    async_get_coordinator(hass).async_cancel_learn()


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/cards/delete",
        vol.Required("uid"): str,
    }
)
@_handler
async def ws_card_delete(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_remove_card(msg["uid"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/complete",
        vol.Required("routine_id"): str,
        vol.Required("task_id"): str,
        vol.Required("completed"): bool,
    }
)
@_handler
async def ws_complete(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_complete(
        msg["routine_id"], msg["task_id"], msg["completed"]
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_routines/reset",
        vol.Required("routine_id"): str,
    }
)
@_handler
async def ws_reset(hass: HomeAssistant, msg: dict) -> None:
    await async_get_coordinator(hass).async_reset(msg["routine_id"])
