import { translator } from "./translations.js";
import { callWS, ensureSymbolFont } from "./shared.js";
import "./views/today-view.js";
import "./views/routines-view.js";
import "./views/card-image.js";

const DAILY_TABS = ["today"];
const CONFIG_TABS = ["routines", "designer"];
const TAB_ALIASES = { cards: "routines" };
const TABS = [...DAILY_TABS, ...CONFIG_TABS];
const FIXED_ICONS = ["arrow_upward", "arrow_downward", "arrow_forward", "arrow_back", "celebration"];

class FamilyRoutinesPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._state = null;
    this._stateJson = "";
    this._tab = DAILY_TABS[0];
    this._routePrefix = "/family-routines";
    this._unsubscribe = null;
    this._reloadTimer = null;
    this._toastTimer = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._build();
    }
    this._subscribe();
    this._render();
  }

  disconnectedCallback() {
    this._unsubscribe?.then((unsub) => unsub()).catch(() => {});
    this._unsubscribe = null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this.shadowRoot) {
      this._render();
    }
    if (first) {
      this._subscribe();
      this._reload();
    }
  }

  get hass() {
    return this._hass;
  }

  set narrow(narrow) {
    this._narrow = narrow;
    this._render();
  }

  set route(route) {
    if (route?.prefix) {
      this._routePrefix = route.prefix;
    }
    const segment = String(route?.path || "").split("/").filter(Boolean)[0];
    const tab = TAB_ALIASES[segment] || segment;
    if (tab && TABS.includes(tab) && tab !== this._tab) {
      this._tab = tab;
      this._render();
    }
  }

  _subscribe() {
    if (this._unsubscribe || !this._hass?.connection || !this.isConnected) {
      return;
    }
    this._unsubscribe = this._hass.connection.subscribeMessage(
      () => this._scheduleReload(),
      { type: "family_routines/subscribe" }
    );
  }

  _scheduleReload() {
    clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(() => this._reload(), 150);
  }

  async _reload() {
    if (!this._hass) {
      return;
    }
    let state;
    try {
      state = await callWS(this._hass, "state");
    } catch (err) {
      this._showToast(translator(this._hass)("error", { message: err.message || err }));
      return;
    }
    const json = JSON.stringify(state);
    if (this._state && json === this._stateJson) {
      return;
    }
    this._state = state;
    this._stateJson = json;
    ensureSymbolFont([
      ...FIXED_ICONS,
      ...this._state.task_icons,
      ...this._state.routines.flatMap((routine) => routine.tasks.map((task) => task.icon)),
    ]);
    this._render();
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 100%;
          background: var(--primary-background-color, #fafafa);
          color: var(--primary-text-color, #212121);
          font-family: var(--ha-font-family-body, Roboto, sans-serif);
        }
        .toolbar {
          display: flex; align-items: center; gap: 8px;
          height: var(--header-height, 56px); padding: 0 12px;
          background: var(--app-header-background-color, var(--primary-color, #03a9f4));
          color: var(--app-header-text-color, var(--text-primary-color, #fff));
        }
        .title { font-size: 20px; flex: 1; }
        #config-toggle {
          display: inline-flex; padding: 8px; border-radius: 50%;
          background: none; border: none; color: inherit; cursor: pointer;
        }
        #config-toggle.active { background: rgba(255, 255, 255, .2); }
        #config-toggle:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
        nav {
          display: flex; overflow-x: auto;
          background: var(--app-header-background-color, var(--primary-color, #03a9f4));
          color: var(--app-header-text-color, var(--text-primary-color, #fff));
        }
        nav[hidden], #toast[hidden] { display: none; }
        nav button {
          flex: 1; min-width: 96px; padding: 12px 16px;
          font: inherit; font-size: 14px; letter-spacing: .02em;
          background: none; border: none; color: inherit; opacity: .75;
          border-bottom: 2px solid transparent; cursor: pointer;
        }
        nav button.active { opacity: 1; border-bottom-color: currentColor; }
        nav button:focus-visible { outline: 2px solid currentColor; outline-offset: -4px; }
        main { padding: 16px; }
        main > * { display: none; }
        main > .active { display: block; }
        #toast {
          position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
          max-width: calc(100% - 32px);
          background: var(--primary-text-color, #212121); color: var(--primary-background-color, #fff);
          padding: 12px 18px; border-radius: 8px; z-index: 20;
          box-shadow: 0 4px 16px rgba(0,0,0,.3);
        }
        .loading { padding: 32px; text-align: center; color: var(--secondary-text-color, #727272); }
      </style>
      <div class="toolbar">
        <ha-menu-button></ha-menu-button>
        <div class="title" id="title"></div>
        <button id="config-toggle"><ha-icon icon="mdi:cog"></ha-icon></button>
      </div>
      <nav id="nav" hidden></nav>
      <main>
        <div class="loading" id="loading"></div>
        <fr-today-view data-tab="today"></fr-today-view>
        <fr-routines-view data-tab="routines"></fr-routines-view>
        <fr-card-image data-tab="designer"></fr-card-image>
      </main>
      <div id="toast" hidden></div>
    `;
    this.shadowRoot.getElementById("nav").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-tab]");
      if (button) {
        this._selectTab(button.dataset.tab);
      }
    });
    this.shadowRoot.getElementById("config-toggle").addEventListener("click", () => {
      this._selectTab(CONFIG_TABS.includes(this._tab) ? DAILY_TABS[0] : CONFIG_TABS[0]);
    });
    this.shadowRoot.addEventListener("fr-toast", (event) => {
      this._showToast(event.detail.message);
    });
  }

  _selectTab(tab) {
    if (tab === this._tab) {
      return;
    }
    this._tab = tab;
    history.pushState(null, "", `${this._routePrefix}/${tab}`);
    this.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._hass) {
      return;
    }
    const t = translator(this._hass);
    const root = this.shadowRoot;
    root.getElementById("title").textContent = t("panel_title");
    const menu = root.querySelector("ha-menu-button");
    menu.hass = this._hass;
    menu.narrow = this._narrow;

    const configMode = CONFIG_TABS.includes(this._tab);
    const toggle = root.getElementById("config-toggle");
    toggle.classList.toggle("active", configMode);
    toggle.title = t("configuration");
    toggle.setAttribute("aria-label", t("configuration"));
    toggle.setAttribute("aria-pressed", String(configMode));

    const nav = root.getElementById("nav");
    const navTabs = configMode ? CONFIG_TABS : DAILY_TABS;
    nav.hidden = navTabs.length < 2;
    const navMarkup = navTabs
      .map((tab) => `<button data-tab="${tab}" class="${tab === this._tab ? "active" : ""}">${t(`tab_${tab}`)}</button>`)
      .join("");
    if (nav.innerHTML !== navMarkup) {
      nav.innerHTML = navMarkup;
    }

    const loading = root.getElementById("loading");
    loading.textContent = t("loading");
    loading.classList.toggle("active", !this._state);

    root.querySelectorAll("main > [data-tab]").forEach((view) => {
      view.classList.toggle("active", Boolean(this._state) && view.dataset.tab === this._tab);
      view.hass = this._hass;
      if (this._state) {
        view.state = this._state;
      }
    });
  }

  _showToast(message) {
    const toast = this.shadowRoot.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  }
}

if (!customElements.get("family-routines-panel")) {
  customElements.define("family-routines-panel", FamilyRoutinesPanel);
}
