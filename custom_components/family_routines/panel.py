from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.core import HomeAssistant

PANEL_URL_PATH = "family-routines"
STATIC_URL_PATH = "/family_routines_panel"
PANEL_DIR = Path(__file__).parent / "panel_frontend"

SIDEBAR_TITLES = {"de": "Routinen"}
DEFAULT_SIDEBAR_TITLE = "Routines"


async def async_setup(hass: HomeAssistant) -> None:
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_PATH, str(PANEL_DIR), cache_headers=False)]
    )
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="family-routines-panel",
        sidebar_title=SIDEBAR_TITLES.get(hass.config.language, DEFAULT_SIDEBAR_TITLE),
        sidebar_icon="mdi:format-list-checks",
        module_url=f"{STATIC_URL_PATH}/family-routines-panel.js",
        require_admin=False,
    )


def async_remove(hass: HomeAssistant) -> None:
    async_remove_panel(hass, PANEL_URL_PATH)
