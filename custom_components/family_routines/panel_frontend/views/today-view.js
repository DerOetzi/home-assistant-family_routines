import { translator } from "../translations.js";
import { baseStyles, callWS, emitToast, escapeHtml, iconMarkup, weekdaySummary } from "../shared.js";

class TodayView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._state = null;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", (event) => this._onClick(event));
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

  _render() {
    const t = translator(this._hass);
    const { persons, routines } = this._state;
    const personById = Object.fromEntries(persons.map((person) => [person.id, person]));
    const ordered = [...routines].sort((a, b) => Number(b.active) - Number(a.active));

    let body;
    if (!persons.length) {
      body = `<p class="empty">${t("no_persons")}</p>`;
    } else if (!routines.length) {
      body = `<p class="empty">${t("no_routines")}</p>`;
    } else {
      body = ordered.map((routine) => this._routineCard(t, routine, personById)).join("");
    }

    this.shadowRoot.innerHTML = `
      <style>
        ${baseStyles}
        .routine.inactive { opacity: .72; }
        .person-row { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--divider-color, #eee); }
        .person-head { display: flex; align-items: center; gap: 8px; }
        .progress { font-variant-numeric: tabular-nums; }
        .tasks { display: flex; flex-wrap: wrap; gap: 8px; }
        .task {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px 8px 10px; border-radius: 20px;
          border: 2px solid var(--person-color);
          background: transparent; color: var(--primary-text-color, inherit);
          font-size: 14px;
        }
        .task.done { background: var(--person-color); color: #fff; }
        .task .ms { font-size: 20px; }
      </style>
      <div class="stack">${body}</div>
    `;
  }

  _routineCard(t, routine, personById) {
    const status = routine.active
      ? `<span class="badge live">${t("running_now")}</span>`
      : `<span class="badge">${routine.weekdays.length && !routine.weekdays.includes(routine.weekday) ? t("not_today") : t("closed")}</span>`;
    const todayIds = new Set(routine.today_task_ids);
    const tasks = routine.tasks.filter((task) => todayIds.has(task.id));

    const person = personById[routine.person_id];
    const completed = new Set(routine.completed || []);
    const doneCount = tasks.filter((task) => completed.has(task.id)).length;
    const chips = tasks.length
      ? tasks
          .map(
            (task) => `
              <button class="task ${completed.has(task.id) ? "done" : ""}"
                data-action="toggle" data-routine="${routine.id}" data-task="${task.id}"
                data-done="${completed.has(task.id) ? "1" : ""}"
                aria-pressed="${completed.has(task.id)}">
                ${iconMarkup(task.icon)}<span>${escapeHtml(task.label)}</span>
              </button>`
          )
          .join("")
      : `<span class="muted">${t("no_tasks_today")}</span>`;
    const rows = `
      <div class="person-row" style="--person-color:${escapeHtml(person?.color || "#9e9e9e")}">
        <div class="person-head">
          <span class="person-dot" style="background:${escapeHtml(person?.color || "#9e9e9e")}"></span>
          <h3 class="grow">${person ? escapeHtml(person.name) : t("no_person")}</h3>
          <span class="muted progress">${doneCount} / ${tasks.length}</span>
        </div>
        <div class="tasks">${chips}</div>
      </div>`;

    return `
      <section class="card routine ${routine.active ? "" : "inactive"}">
        <div class="row">
          <h2 class="grow">${escapeHtml(routine.name)}</h2>
          ${status}
        </div>
        <div class="row muted">
          <span>${routine.window_start}–${routine.window_end}</span>
          <span>·</span>
          <span>${weekdaySummary(t, routine.weekdays)}</span>
          <span class="grow"></span>
          <button class="link" data-action="reset" data-routine="${routine.id}">${t("reset")}</button>
        </div>
        ${rows}
      </section>`;
  }

  async _onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const t = translator(this._hass);
    const { action, routine: routineId, task } = button.dataset;
    const routine = this._state.routines.find((item) => item.id === routineId);
    try {
      if (action === "toggle") {
        button.disabled = true;
        await callWS(this._hass, "complete", {
          routine_id: routineId,
          task_id: task,
          completed: !button.dataset.done,
        });
      } else if (action === "reset") {
        if (confirm(t("reset_confirm", { routine: routine?.name }))) {
          await callWS(this._hass, "reset", { routine_id: routineId });
        }
      }
    } catch (err) {
      button.disabled = false;
      emitToast(this, t("error", { message: err.message || err }));
    }
  }
}

customElements.define("fr-today-view", TodayView);
