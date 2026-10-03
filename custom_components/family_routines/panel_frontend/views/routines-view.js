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
    this._taskCards = null;
    this._expanded = new Set();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        ${baseStyles}
        .task-list { display: grid; gap: 4px; }
        details.tasks > summary {
          display: flex; align-items: center; gap: 8px;
          list-style: none; cursor: pointer; user-select: none;
          padding: 6px 4px; margin: -6px -4px; border-radius: 8px;
          font-size: 14px; font-weight: 500;
        }
        details.tasks > summary::-webkit-details-marker { display: none; }
        details.tasks > summary:hover { background: var(--secondary-background-color, rgba(0,0,0,.04)); }
        details.tasks > summary:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        details.tasks .chevron { transition: transform .15s ease; color: var(--secondary-text-color, #727272); }
        details.tasks[open] .chevron { transform: rotate(90deg); }
        details.tasks .tasks-body { display: grid; gap: 12px; margin-top: 14px; }
        @media (prefers-reduced-motion: reduce) { details.tasks .chevron { transition: none; } }
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
        .card-count {
          display: inline-flex; align-items: center; gap: 2px;
          padding: 2px 8px 2px 6px; border-radius: 10px;
          font-size: 13px; font-variant-numeric: tabular-nums;
          color: var(--secondary-text-color, #727272);
        }
        .card-count ha-icon { --mdc-icon-size: 18px; }
        .card-count.missing { color: var(--warning-color, #ff9800); background: rgba(255, 152, 0, .14); }
        .card-list { display: grid; gap: 4px; }
        .card-row {
          display: flex; align-items: center; gap: 10px;
          padding: 4px 4px 4px 12px; border-radius: 10px;
          background: var(--secondary-background-color, rgba(0,0,0,.03));
        }
        .card-row code { font-size: 13px; font-variant-numeric: tabular-nums; }
        .person-block { display: grid; gap: 6px; }
        .person-block + .person-block { border-top: 1px solid var(--divider-color, #e0e0e0); padding-top: 12px; }
        .waiting { display: flex; align-items: center; gap: 12px; }
        .waiting ha-icon { --mdc-icon-size: 36px; color: var(--primary-color, #03a9f4); animation: pulse 1.6s ease-in-out infinite; }
        @keyframes pulse { 50% { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) { .waiting ha-icon { animation: none; } }
        @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
      </style>
      <div class="stack" id="content"></div>
      <div id="dialog"></div>
    `;
    this.shadowRoot.getElementById("content").addEventListener("click", (event) => this._onClick(event));
    this.shadowRoot.getElementById("dialog").addEventListener("click", (event) => this._onDialogClick(event));
    this.shadowRoot.getElementById("content").addEventListener("toggle", (event) => this._onToggle(event), true);
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
    this._render();
    this._syncCapture();
  }

  get _t() {
    return translator(this._hass);
  }

  _cardCount(count) {
    return `<span class="card-count ${count ? "" : "missing"}" title="${escapeHtml(this._t("card_count", { count }))}"><ha-icon icon="mdi:nfc-variant"></ha-icon>${count}</span>`;
  }

  _cardRow(uid, action, extra = "") {
    const t = this._t;
    return `
      <div class="card-row">
        <code>${escapeHtml(uid)}</code>
        <span class="grow">${extra}</span>
        <button type="button" class="icon" data-action="${action}" data-uid="${escapeHtml(uid)}" title="${t("delete")}" aria-label="${t("delete")}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
      </div>`;
  }

  _waiting(body, action) {
    const t = this._t;
    return `
      <div class="waiting">
        <ha-icon icon="mdi:contactless-payment"></ha-icon>
        <div class="grow">
          <h3>${t("waiting_title")}</h3>
          <p class="muted">${escapeHtml(body)}</p>
        </div>
        <button type="button" class="secondary" data-action="${action}">${t("cancel")}</button>
      </div>`;
  }

  _personCards() {
    const t = this._t;
    const { persons, cards, last_unknown_uid: last, pending_learn: pending } = this._state;
    if (!persons.length) {
      return "";
    }
    const blocks = persons
      .map((person) => {
        const own = cards.filter((card) => card.kind === "status" && card.person_id === person.id);
        const waiting = pending && !pending.routine_id && pending.person_id === person.id;
        return `
          <div class="person-block">
            <div class="row">
              <span class="grow person-chip"><span class="person-dot" style="background:${escapeHtml(person.color)}"></span>${escapeHtml(person.name)}</span>
              ${this._cardCount(own.length)}
            </div>
            ${own.length ? `<div class="card-list">${own.map((card) => this._cardRow(card.uid, "person-card-delete")).join("")}</div>` : ""}
            ${
              waiting
                ? this._waiting(t("waiting_body", { target: person.name }), "person-cancel")
                : `
            <div class="row">
              ${last ? `<button class="secondary" data-action="person-use-last" data-person="${person.id}">${t("use_last_card")}</button>` : ""}
              <button class="secondary" data-action="person-wait" data-person="${person.id}"><ha-icon icon="mdi:contactless-payment"></ha-icon>${t("wait_for_card")}</button>
            </div>`
            }
          </div>`;
      })
      .join("");
    return `
      <section class="card">
        <h2>${t("status_cards")}</h2>
        ${blocks}
        ${last ? `<p class="hint">${escapeHtml(t("last_unknown", { uid: last }))}</p>` : ""}
      </section>`;
  }

  _render() {
    const t = this._t;
    const { routines, persons, stations, cards: allCards } = this._state;
    const personById = Object.fromEntries(persons.map((person) => [person.id, person]));
    const stationById = Object.fromEntries(stations.map((station) => [station.id, station]));

    const cards = routines
      .map((routine) => {
        const person = personById[routine.person_id];
        const people = person
          ? `<span class="person-chip"><span class="person-dot" style="background:${escapeHtml(person.color)}"></span>${escapeHtml(person.name)}</span>`
          : `<span class="muted">${t("no_person")}</span>`;
        let missing = 0;
        const tasks = routine.tasks.length
          ? routine.tasks
              .map((task, index) => {
                const cardCount = allCards.filter(
                  (card) => card.routine_id === routine.id && card.task_id === task.id
                ).length;
                if (!cardCount) {
                  missing += 1;
                }
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
                    ${this._cardCount(cardCount)}
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
            <details class="tasks" data-routine="${routine.id}" ${this._expanded.has(routine.id) ? "open" : ""}>
              <summary>
                <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
                <span>${t("tasks")}</span>
                <span class="badge">${routine.tasks.length}</span>
                <span class="grow"></span>
                ${missing ? `<span class="card-count missing"><ha-icon icon="mdi:nfc-variant"></ha-icon>${escapeHtml(t("without_card", { count: missing }))}</span>` : ""}
              </summary>
              <div class="tasks-body">
                <div class="task-list">${tasks}</div>
                <div class="row"><button class="secondary" data-action="task-add" data-routine="${routine.id}"><ha-icon icon="mdi:plus"></ha-icon>${t("add_task")}</button></div>
              </div>
            </details>
          </section>`;
      })
      .join("");

    this.shadowRoot.getElementById("content").innerHTML = `
      ${persons.length ? "" : `<p class="empty">${t("no_persons")}</p>`}
      ${cards || `<p class="empty">${t("no_routines")}</p>`}
      <div class="row"><button data-action="routine-add"><ha-icon icon="mdi:plus"></ha-icon>${t("add_routine")}</button></div>
      ${this._personCards()}
    `;
  }

  _onToggle(event) {
    const id = event.target.dataset?.routine;
    if (!event.target.matches?.("details.tasks") || !id) {
      return;
    }
    if (event.target.open) {
      this._expanded.add(id);
    } else {
      this._expanded.delete(id);
    }
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
    if (action.startsWith("person-")) {
      await this._onPersonCardAction(button).catch(() => {});
    } else if (action === "routine-add") {
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

  async _onPersonCardAction(button) {
    const t = this._t;
    const { action, person: personId, uid } = button.dataset;
    if (action === "person-wait") {
      await this._call("cards/learn", { person_id: personId });
    } else if (action === "person-use-last") {
      await this._call("cards/learn", { uid: this._state.last_unknown_uid, person_id: personId });
      emitToast(this, t("card_learned"));
    } else if (action === "person-cancel") {
      await this._call("cards/cancel_learn");
    } else if (action === "person-card-delete" && confirm(t("delete_card_confirm", { uid }))) {
      await this._call("cards/delete", { uid });
    }
  }

  _renderTaskCards() {
    const box = this.shadowRoot.getElementById("task-cards");
    const draft = this._taskCards;
    if (!box || !draft) {
      return;
    }
    const t = this._t;
    const { cards, last_unknown_uid: last } = this._state;
    const bound = draft.taskId
      ? cards
          .filter(
            (card) =>
              card.routine_id === draft.routineId && card.task_id === draft.taskId && !draft.removed.has(card.uid)
          )
          .map((card) => this._cardRow(card.uid, "draft-card-remove"))
      : [];
    const added = draft.added.map((uid) =>
      this._cardRow(uid, "draft-card-remove", `<span class="badge">${t("card_new")}</span>`)
    );
    const rows = [...bound, ...added];
    const useLast = last && !draft.added.includes(last);
    box.innerHTML = `
      ${rows.length ? `<div class="card-list">${rows.join("")}</div>` : `<p class="empty">${t("no_cards")}</p>`}
      ${
        draft.capturing
          ? this._waiting(t("capture_body"), "draft-card-cancel")
          : `
      <div class="row">
        ${useLast ? `<button type="button" class="secondary" data-action="draft-card-last">${t("use_last_card")}</button>` : ""}
        <button type="button" class="secondary" data-action="draft-card-wait"><ha-icon icon="mdi:contactless-payment"></ha-icon>${t("wait_for_card")}</button>
      </div>
      ${useLast ? `<p class="hint">${escapeHtml(t("last_unknown", { uid: last }))}</p>` : ""}`
      }`;
  }

  _syncCapture() {
    const draft = this._taskCards;
    if (!draft) {
      return;
    }
    if (draft.capturing) {
      const capture = this._state.last_capture;
      if (capture && capture.seq > draft.captureSeq) {
        draft.capturing = false;
        if (!draft.added.includes(capture.uid)) {
          draft.added.push(capture.uid);
        }
      } else if (this._state.capturing) {
        draft.sawCapturing = true;
      } else if (draft.sawCapturing) {
        draft.capturing = false;
      }
    }
    this._renderTaskCards();
  }

  async _onDialogClick(event) {
    const button = event.target.closest("button[data-action]");
    const draft = this._taskCards;
    if (!button || !draft) {
      return;
    }
    const { action, uid } = button.dataset;
    if (action === "draft-card-remove") {
      if (draft.added.includes(uid)) {
        draft.added = draft.added.filter((item) => item !== uid);
      } else {
        draft.removed.add(uid);
      }
    } else if (action === "draft-card-last") {
      const last = this._state.last_unknown_uid;
      if (last && !draft.added.includes(last)) {
        draft.added.push(last);
      }
    } else if (action === "draft-card-wait") {
      try {
        const { seq } = await this._call("cards/capture");
        Object.assign(draft, { capturing: true, captureSeq: seq, sawCapturing: false });
      } catch (err) {
        return;
      }
    } else if (action === "draft-card-cancel") {
      draft.capturing = false;
      await this._call("cards/cancel_learn").catch(() => {});
    } else {
      return;
    }
    this._syncCapture();
  }

  async _saveTaskCards(routineId, taskId) {
    const draft = this._taskCards;
    const known = new Set(this._state.cards.map((card) => card.uid));
    for (const uid of [...draft.removed]) {
      if (known.has(uid)) {
        await callWS(this._hass, "cards/delete", { uid });
      }
      draft.removed.delete(uid);
    }
    for (const uid of [...draft.added]) {
      await callWS(this._hass, "cards/learn", { uid, routine_id: routineId, task_id: taskId });
      draft.added = draft.added.filter((item) => item !== uid);
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
    if (this._taskCards?.capturing) {
      callWS(this._hass, "cards/cancel_learn").catch(() => {});
    }
    this._taskCards = null;
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
    const selectedPerson = routine ? routine.person_id : persons[0]?.id || "";
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
        <label for="person">${t("person")}</label>
        <select id="person">
          ${persons
            .map(
              (person) =>
                `<option value="${person.id}" ${person.id === selectedPerson ? "selected" : ""}>${escapeHtml(person.name)}</option>`
            )
            .join("")}
        </select>
      </div>`;

    this._showDialog(
      markup,
      async (form) => {
        const name = form.querySelector("#name").value.trim();
        if (!name) {
          return t("name_required");
        }
        const personId = form.querySelector("#person")?.value || "";
        if (!personId) {
          return t("person_required");
        }
        const payload = {
          name,
          window_start: form.querySelector("#start").value || "00:00",
          window_end: form.querySelector("#end").value || "00:00",
          weekdays: checkedValues(form, "weekdays"),
          person_id: personId,
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
      </div>
      <div class="field">
        <span class="label">${t("cards")}</span>
        <div id="task-cards"></div>
        <p class="hint">${t("cards_on_save")}</p>
      </div>`;

    let taskId = task?.id || "";
    this._taskCards = {
      routineId: routine.id,
      taskId,
      removed: new Set(),
      added: [],
      capturing: false,
      captureSeq: 0,
      sawCapturing: false,
    };
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
        if (taskId) {
          await callWS(this._hass, "tasks/update", { routine_id: routine.id, task_id: taskId, ...payload });
        } else {
          ({ task_id: taskId } = await callWS(this._hass, "tasks/add", { routine_id: routine.id, ...payload }));
          this._taskCards.taskId = taskId;
        }
        await this._saveTaskCards(routine.id, taskId);
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
    this._renderTaskCards();
  }
}

customElements.define("fr-routines-view", RoutinesView);
