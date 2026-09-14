import { translator } from "../translations.js";
import {
  baseStyles,
  bindWeekdayQuickPicks,
  callWS,
  checkedValues,
  emitToast,
  escapeHtml,
  iconMarkup,
  weekdayPicker,
  weekdaySummary,
} from "../shared.js";

class RoutinesView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._state = null;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        ${baseStyles}
        .task-list { display: grid; gap: 4px; }
        .task-row {
          display: flex; align-items: center; gap: 10px;
          padding: 6px 4px 6px 10px; border-radius: 10px;
          background: var(--secondary-background-color, rgba(0,0,0,.03));
        }
        .task-row .ms { font-size: 26px; color: var(--primary-text-color, inherit); }
        .task-row .meta { display: grid; gap: 2px; }
        .task-row .order { display: flex; }
        .person-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
        .icon-groups { display: grid; gap: 14px; max-height: 46vh; overflow-y: auto; padding: 2px 4px 2px 2px; }
        .icon-group { display: grid; gap: 6px; }
        .icon-group h4 { margin: 0; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: var(--secondary-text-color, #727272); }
        .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
        .icon-choice input { position: absolute; opacity: 0; pointer-events: none; }
        .icon-choice > span {
          display: grid; justify-items: center; gap: 4px; padding: 10px 4px;
          border-radius: 12px; border: 2px solid var(--divider-color, #ddd);
          cursor: pointer; font-size: 11px; text-align: center; word-break: break-word;
        }
        .icon-choice .ms { font-size: 32px; }
        .icon-choice input:checked + span { border-color: var(--primary-color, #03a9f4); background: var(--secondary-background-color, rgba(0,0,0,.04)); }
        .icon-choice input:focus-visible + span { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        .error { color: var(--error-color, #db4437); font-size: 13px; min-height: 1em; }
        @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
      </style>
      <div class="stack" id="content"></div>
      <div id="dialog"></div>
    `;
    this.shadowRoot.getElementById("content").addEventListener("click", (event) => this._onClick(event));
  }

  set hass(hass) {
    this._hass = hass;
  }

  set state(state) {
    if (state === this._state) {
      return;
    }
    this._state = state;
    this._render();
  }

  get _t() {
    return translator(this._hass);
  }

  _render() {
    const t = this._t;
    const { routines, persons, stations } = this._state;
    const personById = Object.fromEntries(persons.map((person) => [person.id, person]));
    const stationById = Object.fromEntries(stations.map((station) => [station.id, station]));

    const cards = routines
      .map((routine) => {
        const people = routine.person_ids
          .map((id) => personById[id])
          .filter(Boolean)
          .map(
            (person) =>
              `<span class="person-chip"><span class="person-dot" style="background:${escapeHtml(person.color)}"></span>${escapeHtml(person.name)}</span>`
          )
          .join("");
        const tasks = routine.tasks.length
          ? routine.tasks
              .map((task, index) => {
                const where = task.stations.length
                  ? task.stations.map((id) => escapeHtml(stationById[id]?.name || id)).join(", ")
                  : t("anywhere");
                return `
                  <div class="task-row">
                    ${iconMarkup(task.icon)}
                    <div class="meta grow">
                      <span>${escapeHtml(task.label)}</span>
                      <span class="muted">${where} · ${weekdaySummary(t, task.weekdays)}</span>
                    </div>
                    <div class="order">
                      <button class="icon" data-action="task-up" data-routine="${routine.id}" data-task="${task.id}" title="${t("move_up")}" aria-label="${t("move_up")}" ${index === 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
                      <button class="icon" data-action="task-down" data-routine="${routine.id}" data-task="${task.id}" title="${t("move_down")}" aria-label="${t("move_down")}" ${index === routine.tasks.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button>
                    </div>
                    <button class="icon" data-action="task-edit" data-routine="${routine.id}" data-task="${task.id}" title="${t("edit")}" aria-label="${t("edit")}"><ha-icon icon="mdi:pencil"></ha-icon></button>
                  </div>`;
              })
              .join("")
          : `<p class="empty">${t("no_tasks")}</p>`;
        return `
          <section class="card">
            <div class="row">
              <h2 class="grow">${escapeHtml(routine.name)}</h2>
              <button class="icon" data-action="routine-edit" data-routine="${routine.id}" title="${t("edit_routine")}" aria-label="${t("edit_routine")}"><ha-icon icon="mdi:pencil"></ha-icon></button>
            </div>
            <div class="row muted">
              <span>${routine.window_start}–${routine.window_end}</span><span>·</span>
              <span>${weekdaySummary(t, routine.weekdays)}</span>
            </div>
            <div class="row">${people}</div>
            <div class="task-list">${tasks}</div>
            <div class="row"><button class="secondary" data-action="task-add" data-routine="${routine.id}"><ha-icon icon="mdi:plus"></ha-icon>${t("add_task")}</button></div>
          </section>`;
      })
      .join("");

    this.shadowRoot.getElementById("content").innerHTML = `
      ${persons.length ? "" : `<p class="empty">${t("no_persons")}</p>`}
      ${cards || `<p class="empty">${t("no_routines")}</p>`}
      <div class="row"><button data-action="routine-add"><ha-icon icon="mdi:plus"></ha-icon>${t("add_routine")}</button></div>
    `;
  }

  _routine(id) {
    return this._state.routines.find((routine) => routine.id === id);
  }

  async _onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const { action, routine: routineId, task: taskId } = button.dataset;
    const routine = this._routine(routineId);
    if (action === "routine-add") {
      this._openRoutineDialog(null);
    } else if (action === "routine-edit") {
      this._openRoutineDialog(routine);
    } else if (action === "task-add") {
      this._openTaskDialog(routine, null);
    } else if (action === "task-edit") {
      this._openTaskDialog(routine, routine.tasks.find((task) => task.id === taskId));
    } else if (action === "task-up" || action === "task-down") {
      const ids = routine.tasks.map((task) => task.id);
      const from = ids.indexOf(taskId);
      const to = action === "task-up" ? from - 1 : from + 1;
      if (to < 0 || to >= ids.length) {
        return;
      }
      [ids[from], ids[to]] = [ids[to], ids[from]];
      await this._call("tasks/reorder", { routine_id: routineId, task_ids: ids }).catch(() => {});
    }
  }

  async _call(command, payload) {
    try {
      return await callWS(this._hass, command, payload);
    } catch (err) {
      emitToast(this, this._t("error", { message: err.message || err }));
      throw err;
    }
  }

  _closeDialog() {
    this.shadowRoot.getElementById("dialog").innerHTML = "";
  }

  _showDialog(markup, onSave, onDelete) {
    const t = this._t;
    const host = this.shadowRoot.getElementById("dialog");
    host.innerHTML = `
      <div class="overlay">
        <form class="dialog" novalidate>
          ${markup}
          <div class="error" id="form-error"></div>
          <div class="actions">
            ${onDelete ? `<button type="button" class="danger" id="delete">${t("delete")}</button>` : ""}
            <span class="spacer"></span>
            <button type="button" class="secondary" id="cancel">${t("cancel")}</button>
            <button type="submit">${t("save")}</button>
          </div>
        </form>
      </div>`;
    const form = host.querySelector("form");
    bindWeekdayQuickPicks(form);
    host.querySelector(".overlay").addEventListener("click", (event) => {
      if (event.target.classList.contains("overlay")) {
        this._closeDialog();
      }
    });
    host.querySelector("#cancel").addEventListener("click", () => this._closeDialog());
    host.querySelector("#delete")?.addEventListener("click", async () => {
      try {
        if (await onDelete()) {
          this._closeDialog();
        }
      } catch (err) {
        host.querySelector("#form-error").textContent = err.message || String(err);
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = form.querySelector("#form-error");
      error.textContent = "";
      try {
        const message = await onSave(form);
        if (message) {
          error.textContent = message;
          return;
        }
        this._closeDialog();
      } catch (err) {
        error.textContent = err.message || String(err);
      }
    });
    form.querySelector("input[type=text]")?.focus();
  }

  _openRoutineDialog(routine) {
    const t = this._t;
    const { persons } = this._state;
    const selectedPersons = routine ? routine.person_ids : persons.map((person) => person.id);
    const markup = `
      <h2>${routine ? t("edit_routine") : t("add_routine")}</h2>
      <div class="field">
        <label for="name">${t("routine_name")}</label>
        <input type="text" id="name" value="${escapeHtml(routine?.name || "")}" autocomplete="off">
      </div>
      <div class="two">
        <div class="field">
          <label for="start">${t("window_start")}</label>
          <input type="time" id="start" value="${routine?.window_start || "04:00"}">
        </div>
        <div class="field">
          <label for="end">${t("window_end")}</label>
          <input type="time" id="end" value="${routine?.window_end || "10:00"}">
        </div>
      </div>
      <p class="hint">${t("window_hint")}</p>
      <div class="field">
        <span class="label">${t("weekdays")}</span>
        ${weekdayPicker(t, "weekdays", routine?.weekdays || [])}
      </div>
      <div class="field">
        <span class="label">${t("persons")}</span>
        <div class="chips">
          ${persons
            .map(
              (person) => `
                <label class="chip-toggle">
                  <input type="checkbox" name="persons" value="${person.id}" ${selectedPersons.includes(person.id) ? "checked" : ""}>
                  <span><span class="person-dot" style="background:${escapeHtml(person.color)}"></span>${escapeHtml(person.name)}</span>
                </label>`
            )
            .join("")}
        </div>
      </div>`;

    this._showDialog(
      markup,
      async (form) => {
        const name = form.querySelector("#name").value.trim();
        if (!name) {
          return t("name_required");
        }
        const payload = {
          name,
          window_start: form.querySelector("#start").value || "00:00",
          window_end: form.querySelector("#end").value || "00:00",
          weekdays: checkedValues(form, "weekdays"),
          person_ids: checkedValues(form, "persons"),
        };
        if (routine) {
          await callWS(this._hass, "routines/update", { routine_id: routine.id, ...payload });
        } else {
          await callWS(this._hass, "routines/add", payload);
        }
        return "";
      },
      routine
        ? async () => {
            if (!confirm(t("delete_routine_confirm", { routine: routine.name }))) {
              return false;
            }
            await this._call("routines/delete", { routine_id: routine.id });
            return true;
          }
        : null
    );
  }

  _openTaskDialog(routine, task) {
    const t = this._t;
    const { stations, task_icons: icons, task_icon_groups: groups } = this._state;
    const currentIcon = task?.icon || icons[0];
    const iconGroups = icons.includes(currentIcon)
      ? groups
      : [...groups, { id: "other", icons: [currentIcon] }];
    const iconLabel = (icon) => {
      const label = t(`icon_${icon}`);
      return label === `icon_${icon}` ? icon : label;
    };
    const markup = `
      <h2>${task ? t("edit_task") : t("add_task")}</h2>
      <p class="muted">${escapeHtml(routine.name)}</p>
      <div class="field">
        <label for="label">${t("task_label")}</label>
        <input type="text" id="label" value="${escapeHtml(task?.label || "")}" autocomplete="off" maxlength="24">
      </div>
      <div class="field">
        <span class="label">${t("task_icon")}</span>
        <div class="icon-groups">
          ${iconGroups
            .map(
              (group) => `
                <div class="icon-group">
                  <h4>${t(`icon_group_${group.id}`)}</h4>
                  <div class="icon-grid">
                    ${group.icons
                      .map(
                        (icon) => `
                          <label class="icon-choice" title="${escapeHtml(icon)}">
                            <input type="radio" name="icon" value="${escapeHtml(icon)}" ${icon === currentIcon ? "checked" : ""}>
                            <span>${iconMarkup(icon)}${escapeHtml(iconLabel(icon))}</span>
                          </label>`
                      )
                      .join("")}
                  </div>
                </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="field">
        <span class="label">${t("stations")}</span>
        <div class="chips">
          ${stations
            .map(
              (station) => `
                <label class="chip-toggle">
                  <input type="checkbox" name="stations" value="${station.id}" ${task?.stations.includes(station.id) ? "checked" : ""}>
                  <span>${iconMarkup(station.signpost_icon)}${escapeHtml(station.name)}</span>
                </label>`
            )
            .join("")}
        </div>
        <p class="hint">${t("stations_hint")}</p>
      </div>
      <div class="field">
        <span class="label">${t("weekdays")}</span>
        ${weekdayPicker(t, "weekdays", task?.weekdays || [])}
      </div>`;

    this._showDialog(
      markup,
      async (form) => {
        const label = form.querySelector("#label").value.trim();
        if (!label) {
          return t("label_required");
        }
        const payload = {
          label,
          icon: form.querySelector("input[name=icon]:checked")?.value || currentIcon,
          stations: checkedValues(form, "stations"),
          weekdays: checkedValues(form, "weekdays"),
        };
        if (task) {
          await callWS(this._hass, "tasks/update", { routine_id: routine.id, task_id: task.id, ...payload });
        } else {
          await callWS(this._hass, "tasks/add", { routine_id: routine.id, ...payload });
        }
        return "";
      },
      task
        ? async () => {
            if (!confirm(t("delete_task_confirm", { task: task.label }))) {
              return false;
            }
            await this._call("tasks/delete", { routine_id: routine.id, task_id: task.id });
            return true;
          }
        : null
    );
  }
}

customElements.define("fr-routines-view", RoutinesView);
