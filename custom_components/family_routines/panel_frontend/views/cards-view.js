import { translator } from "../translations.js";
import { baseStyles, callWS, emitToast, escapeHtml, iconMarkup } from "../shared.js";

class CardsView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._state = null;
    this._form = { kind: "task", routineId: "", taskId: "", personId: "" };
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", (event) => this._onClick(event));
    this.shadowRoot.addEventListener("change", (event) => this._onChange(event));
  }

  set hass(hass) {
    this._hass = hass;
  }

  set state(state) {
    if (state === this._state) {
      return;
    }
    const previous = this._state;
    this._state = state;
    if (previous?.pending_learn && !state.pending_learn && state.cards.length > previous.cards.length) {
      emitToast(this, translator(this._hass)("card_learned"));
    }
    this._normalizeForm();
    this._render();
  }

  get _t() {
    return translator(this._hass);
  }

  _normalizeForm() {
    const { routines, persons } = this._state;
    const form = this._form;
    const routine = routines.find((item) => item.id === form.routineId) || routines[0];
    form.routineId = routine?.id || "";
    const tasks = routine?.tasks || [];
    if (!tasks.some((task) => task.id === form.taskId)) {
      const covered = new Set(
        this._state.cards.filter((card) => card.routine_id === form.routineId).map((card) => card.task_id)
      );
      form.taskId = (tasks.find((task) => !covered.has(task.id)) || tasks[0])?.id || "";
    }
    const allowed = form.kind === "status" ? persons.map((p) => p.id) : [];
    if (!allowed.includes(form.personId)) {
      form.personId = allowed[0] || "";
    }
  }

  _describeTarget() {
    const t = this._t;
    const { routines, persons } = this._state;
    const pending = this._state.pending_learn;
    if (!pending.routine_id) {
      const person = persons.find((item) => item.id === pending.person_id);
      return person?.name || "?";
    }
    const routine = routines.find((item) => item.id === pending.routine_id);
    const task = routine?.tasks.find((item) => item.id === pending.task_id);
    return `${routine?.name || "?"} / ${task?.label || "?"}`;
  }

  _render() {
    const t = this._t;
    const { routines, persons, cards } = this._state;
    const personById = Object.fromEntries(persons.map((person) => [person.id, person]));
    const form = this._form;
    const routine = routines.find((item) => item.id === form.routineId);

    let learn;
    if (this._state.pending_learn) {
      learn = `
        <div class="waiting">
          <ha-icon icon="mdi:contactless-payment"></ha-icon>
          <div class="grow">
            <h3>${t("waiting_title")}</h3>
            <p class="muted">${escapeHtml(t("waiting_body", { target: this._describeTarget() }))}</p>
          </div>
          <button class="secondary" data-action="cancel">${t("cancel")}</button>
        </div>`;
    } else if (!persons.length || (!routines.length && form.kind === "task")) {
      learn = `<p class="empty">${!persons.length ? t("no_persons") : t("no_routines")}</p>`;
    } else {
      const last = this._state.last_unknown_uid;
      learn = `
        <div class="field">
          <span class="label">${t("card_kind")}</span>
          <div class="chips">
            <label class="chip-toggle"><input type="radio" name="kind" value="task" ${form.kind === "task" ? "checked" : ""}><span>${t("card_kind_task")}</span></label>
            <label class="chip-toggle"><input type="radio" name="kind" value="status" ${form.kind === "status" ? "checked" : ""}><span>${t("card_kind_status")}</span></label>
          </div>
        </div>
        ${
          form.kind === "task"
            ? `
          <div class="two">
            <div class="field">
              <label for="routine">${t("routine")}</label>
              <select id="routine" name="routine">
                ${routines.map((item) => `<option value="${item.id}" ${item.id === form.routineId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="task">${t("task")}</label>
              <select id="task" name="task">
                ${(routine?.tasks || []).map((item) => `<option value="${item.id}" ${item.id === form.taskId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </div>
          </div>`
            : ""
        }
        ${
          form.kind === "status"
            ? `
          <div class="field">
            <label for="person">${t("person")}</label>
            <select id="person" name="person">
              ${persons.map((person) => `<option value="${person.id}" ${person.id === form.personId ? "selected" : ""}>${escapeHtml(person.name)}</option>`).join("")}
            </select>
          </div>`
            : ""
        }
        <div class="actions">
          ${last ? `<button class="secondary" data-action="use-last">${t("use_last_card")}</button>` : ""}
          <button data-action="wait" ${form.kind === "task" && !form.taskId ? "disabled" : ""}><ha-icon icon="mdi:contactless-payment"></ha-icon>${t("wait_for_card")}</button>
        </div>
        ${last ? `<p class="hint">${escapeHtml(t("last_unknown", { uid: last }))}</p>` : ""}`;
    }

    const cardRow = (card) => {
      const routineOfCard = routines.find((item) => item.id === card.routine_id);
      const person = personById[card.person_id || routineOfCard?.person_id];
      return `
        <div class="card-row">
          <code>${escapeHtml(card.uid)}</code>
          <span class="grow person-chip">
            ${person ? `<span class="person-dot" style="background:${escapeHtml(person.color)}"></span>${escapeHtml(person.name)}` : `<span class="muted">${t("no_person")}</span>`}
          </span>
          <button class="icon" data-action="delete" data-uid="${escapeHtml(card.uid)}" title="${t("delete")}" aria-label="${t("delete")}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        </div>`;
    };

    const routineSections = routines
      .map((item) => {
        const missing = [];
        const rows = item.tasks
          .map((task) => {
            const taskCards = cards.filter((card) => card.routine_id === item.id && card.task_id === task.id);
            if (!taskCards.length) {
              missing.push(task);
              return "";
            }
            return `
              <div class="task-group">
                <div class="row">${iconMarkup(task.icon)}<h3>${escapeHtml(task.label)}</h3></div>
                ${taskCards.map(cardRow).join("")}
              </div>`;
          })
          .join("");
        const missingRow = missing.length
          ? `<p class="muted">${t("tasks_without_card")}: ${missing.map((task) => escapeHtml(task.label)).join(", ")}</p>`
          : "";
        return `
          <section class="card">
            <h2>${escapeHtml(item.name)}</h2>
            ${rows || `<p class="empty">${t("no_cards")}</p>`}
            ${missingRow}
          </section>`;
      })
      .join("");

    const statusCards = cards.filter((card) => card.kind === "status");

    this.shadowRoot.innerHTML = `
      <style>
        ${baseStyles}
        .waiting { display: flex; align-items: center; gap: 12px; }
        .waiting ha-icon { --mdc-icon-size: 40px; color: var(--primary-color, #03a9f4); animation: pulse 1.6s ease-in-out infinite; }
        @keyframes pulse { 50% { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) { .waiting ha-icon { animation: none; } }
        .task-group { display: grid; gap: 4px; }
        .task-group .ms { font-size: 22px; }
        .card-row {
          display: flex; align-items: center; gap: 10px;
          padding: 4px 4px 4px 12px; border-radius: 10px;
          background: var(--secondary-background-color, rgba(0,0,0,.03));
        }
        .card-row code { font-size: 13px; font-variant-numeric: tabular-nums; }
        .person-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
        @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
      </style>
      <div class="stack">
        <section class="card"><h2>${t("learn_card")}</h2>${learn}</section>
        ${routineSections}
        ${
          statusCards.length
            ? `<section class="card"><h2>${t("status_cards")}</h2>${statusCards.map(cardRow).join("")}</section>`
            : ""
        }
      </div>
    `;
  }

  _onChange(event) {
    const target = event.target;
    if (target.name === "kind") {
      this._form.kind = target.value;
      this._form.personId = "";
    } else if (target.name === "routine") {
      this._form.routineId = target.value;
      this._form.taskId = "";
    } else if (target.name === "task") {
      this._form.taskId = target.value;
      return;
    } else if (target.name === "person") {
      this._form.personId = target.value;
      return;
    } else {
      return;
    }
    this._normalizeForm();
    this._render();
  }

  _binding() {
    const form = this._form;
    return form.kind === "task"
      ? { routine_id: form.routineId, task_id: form.taskId }
      : { person_id: form.personId };
  }

  async _onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const t = this._t;
    try {
      if (button.dataset.action === "wait") {
        await callWS(this._hass, "cards/learn", this._binding());
      } else if (button.dataset.action === "use-last") {
        await callWS(this._hass, "cards/learn", { uid: this._state.last_unknown_uid, ...this._binding() });
        emitToast(this, t("card_learned"));
      } else if (button.dataset.action === "cancel") {
        await callWS(this._hass, "cards/cancel_learn");
      } else if (button.dataset.action === "delete") {
        if (confirm(t("delete_card_confirm", { uid: button.dataset.uid }))) {
          await callWS(this._hass, "cards/delete", { uid: button.dataset.uid });
        }
      }
    } catch (err) {
      emitToast(this, t("error", { message: err.message || err }));
    }
  }
}

customElements.define("fr-cards-view", CardsView);
