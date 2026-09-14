export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WORKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND = ["sat", "sun"];

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function callWS(hass, command, payload = {}) {
  return hass.callWS({ type: `family_routines/${command}`, ...payload });
}

const FONT_LINK_ID = "family-routines-symbols";

export function ensureSymbolFont(names) {
  const wanted = [...new Set(names.filter((name) => /^[a-z_]+$/.test(name)))].sort();
  if (!wanted.length) {
    return;
  }
  const href =
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" +
    `&icon_names=${wanted.join(",")}&display=block`;
  let link = document.getElementById(FONT_LINK_ID);
  if (link?.href === href) {
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function iconMarkup(icon, extraClass = "") {
  const name = String(icon ?? "");
  const content = /^[a-z_]+$/.test(name)
    ? name
    : /^[0-9a-f]{4,5}$/i.test(name)
      ? String.fromCodePoint(parseInt(name, 16))
      : "";
  return `<span class="ms ${extraClass}" aria-hidden="true">${escapeHtml(content)}</span>`;
}

export function sameDays(a, b) {
  return a.length === b.length && a.every((day) => b.includes(day));
}

export function weekdaySummary(t, days) {
  if (!days?.length || days.length === 7) {
    return t("every_day");
  }
  if (sameDays(days, WORKDAYS)) {
    return t("workdays");
  }
  if (sameDays(days, WEEKEND)) {
    return t("weekend");
  }
  return WEEKDAYS.filter((day) => days.includes(day))
    .map((day) => t(`day_${day}`))
    .join(", ");
}

export function weekdayPicker(t, name, selected) {
  const chips = WEEKDAYS.map(
    (day) => `
      <label class="chip-toggle">
        <input type="checkbox" name="${name}" value="${day}" ${selected.includes(day) ? "checked" : ""}>
        <span>${t(`day_${day}`)}</span>
      </label>`
  ).join("");
  return `
    <div class="chips">${chips}</div>
    <div class="quick">
      <button type="button" class="link" data-days="all" data-for="${name}">${t("every_day")}</button>
      <button type="button" class="link" data-days="workdays" data-for="${name}">${t("workdays")}</button>
      <button type="button" class="link" data-days="weekend" data-for="${name}">${t("weekend")}</button>
    </div>`;
}

export function bindWeekdayQuickPicks(root) {
  root.querySelectorAll("button[data-days]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset =
        button.dataset.days === "workdays"
          ? WORKDAYS
          : button.dataset.days === "weekend"
            ? WEEKEND
            : [];
      root
        .querySelectorAll(`input[name="${button.dataset.for}"]`)
        .forEach((input) => {
          input.checked = preset.includes(input.value);
        });
    });
  });
}

export function checkedValues(root, name) {
  const values = [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(
    (input) => input.value
  );
  return name.startsWith("weekdays") && values.length === 7 ? [] : values;
}

export function emitToast(element, message) {
  element.dispatchEvent(
    new CustomEvent("fr-toast", { detail: { message }, bubbles: true, composed: true })
  );
}

export const baseStyles = `
  :host { display: block; }
  * { box-sizing: border-box; }
  .ms {
    font-family: "Material Symbols Outlined";
    font-weight: normal;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    direction: ltr;
    font-feature-settings: "liga";
    -webkit-font-smoothing: antialiased;
    display: inline-block;
    width: 1em;
    overflow: hidden;
  }
  .card {
    background: var(--card-background-color, #fff);
    border-radius: var(--ha-card-border-radius, 12px);
    border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
    box-shadow: var(--ha-card-box-shadow, none);
    padding: 16px;
    display: grid;
    gap: 12px;
  }
  .stack { display: grid; gap: 16px; max-width: 960px; margin: 0 auto; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 18px; font-weight: 500; }
  h3 { margin: 0; font-size: 15px; font-weight: 500; }
  .muted { color: var(--secondary-text-color, #727272); font-size: 13px; }
  .empty { color: var(--secondary-text-color, #727272); padding: 8px 0; }
  button {
    font: inherit;
    font-size: 14px;
    padding: 8px 14px;
    border-radius: 18px;
    border: none;
    cursor: pointer;
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  button.secondary {
    background: transparent;
    color: var(--primary-color, #03a9f4);
    border: 1px solid var(--divider-color, #ccc);
  }
  button.danger { background: var(--error-color, #db4437); }
  button.link {
    background: none;
    color: var(--primary-color, #03a9f4);
    padding: 4px 6px;
    border-radius: 4px;
  }
  button.icon {
    background: none;
    color: var(--secondary-text-color, #727272);
    padding: 6px;
    border-radius: 50%;
  }
  button.icon:hover { background: var(--secondary-background-color, rgba(0,0,0,.05)); }
  button:disabled { opacity: .4; cursor: default; }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
  }
  input[type="text"], input[type="time"], select {
    font: inherit;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, inherit);
    width: 100%;
  }
  .person-dot {
    width: 12px; height: 12px; border-radius: 50%;
    display: inline-block; flex-shrink: 0;
  }
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--secondary-background-color, #eee);
    color: var(--secondary-text-color, #555);
    white-space: nowrap;
  }
  .badge.live { background: var(--success-color, #43a047); color: #fff; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip-toggle input { position: absolute; opacity: 0; pointer-events: none; }
  .chip-toggle > span {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 16px;
    border: 1px solid var(--divider-color, #ccc);
    cursor: pointer; font-size: 14px; user-select: none;
  }
  .chip-toggle input:checked + span {
    background: var(--primary-color, #03a9f4);
    border-color: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }
  .chip-toggle input:focus-visible + span { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
  .chip-toggle .ms { font-size: 20px; }
  .quick { display: flex; gap: 4px; flex-wrap: wrap; }
  .overlay {
    position: fixed; inset: 0; z-index: 10;
    background: rgba(0, 0, 0, .45);
    display: flex; align-items: flex-start; justify-content: center;
    padding: 5vh 16px; overflow-y: auto;
  }
  .dialog {
    width: 100%; max-width: 520px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, inherit);
    border-radius: 16px; padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, .3);
    display: grid; gap: 16px;
  }
  .field { display: grid; gap: 6px; }
  .field > label, .field > .label { font-size: 13px; color: var(--secondary-text-color, #727272); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .actions .spacer { flex: 1; }
  .hint { font-size: 12px; color: var(--secondary-text-color, #727272); }
`;
