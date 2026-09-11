from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigSubentryFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.selector import (
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .const import (
    CONF_COLOR,
    CONF_DEVICE_NAME,
    CONF_NAME,
    CONF_SHORT_NAME,
    CONF_SIGNPOST_ICON,
    CONF_STATUS_CARD_UID,
    DEFAULT_COLOR,
    DEFAULT_SIGNPOST_ICON,
    DOMAIN,
    SUBENTRY_TYPE_PERSON,
    SUBENTRY_TYPE_STATION,
)
from .icons import SIGNPOST_ICONS

SIGNPOST_SELECTOR = SelectSelector(
    SelectSelectorConfig(
        options=list(SIGNPOST_ICONS),
        translation_key="signpost_icon",
        mode=SelectSelectorMode.DROPDOWN,
    )
)

STEP_PERSON_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NAME): str,
        vol.Required(CONF_COLOR, default=DEFAULT_COLOR): str,
        vol.Optional(CONF_STATUS_CARD_UID, default=""): str,
    }
)

STEP_STATION_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NAME): str,
        vol.Required(CONF_SHORT_NAME): str,
        vol.Required(
            CONF_SIGNPOST_ICON, default=DEFAULT_SIGNPOST_ICON
        ): SIGNPOST_SELECTOR,
        vol.Required(CONF_DEVICE_NAME): str,
    }
)


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="Family Routines", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        return {
            SUBENTRY_TYPE_PERSON: PersonSubentryFlow,
            SUBENTRY_TYPE_STATION: StationSubentryFlow,
        }


class FamilyRoutinesSubentryFlow(ConfigSubentryFlow):
    schema: vol.Schema

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title=user_input[CONF_NAME], data=dict(user_input)
            )

        return self.async_show_form(step_id="user", data_schema=self.schema)

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        subentry = self._get_reconfigure_subentry()

        if user_input is not None:
            return self.async_update_and_abort(
                self._get_entry(),
                subentry,
                title=user_input[CONF_NAME],
                data=dict(user_input),
            )

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                self.schema, subentry.data
            ),
        )


class PersonSubentryFlow(FamilyRoutinesSubentryFlow):
    schema = STEP_PERSON_DATA_SCHEMA


class StationSubentryFlow(FamilyRoutinesSubentryFlow):
    schema = STEP_STATION_DATA_SCHEMA
