import { translator } from "../translations.js";
import { baseStyles, emitToast, escapeHtml } from "../shared.js";

const SIZE = 709;
const BORDER = 34;
const RADIUS = 52;
const INNER_RADIUS = 26;
const BAND = 156;
const BAND_CENTER = 68;
const BAND_GAP = 16;
const LABEL_OFFSET = 26;
const NAME_OFFSET = 34;
const GLYPH_SIZE = 92;
const LABEL_FONT = '600 60px "Roboto", sans-serif';
const NAME_FONT = '500 38px "Roboto", sans-serif';
const QUESTION_FONT = '700 340px "Roboto", sans-serif';
const GLYPH_FONT = `${GLYPH_SIZE}px "Material Symbols Outlined"`;
const UMLAUTS = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
const INNER = {
  x: BORDER,
  y: BORDER,
  width: SIZE - 2 * BORDER,
  height: SIZE - BORDER - BAND,
};
const MAX_ZOOM = 6;
const WHEEL_ZOOM = 0.0015;

function clamp(value, min, max) {
  return min > max ? (min + max) / 2 : Math.min(Math.max(value, min), max);
}

function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function parseColor(value) {
  const text = String(value ?? "").trim();
  const hex = text.replace("#", "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [...hex].map((digit) => parseInt(digit + digit, 16));
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  }
  const match = text.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(",").map((part) => parseFloat(part));
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      return parts.slice(0, 3);
    }
  }
  return null;
}

function readableInk(color) {
  const rgb = parseColor(color);
  if (!rgb) {
    return "#ffffff";
  }
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? "#1b1b1b" : "#ffffff";
}

function slug(value) {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "karte";
}

async function loadFont(spec, text) {
  try {
    await document.fonts.load(spec, text);
  } catch (err) {
    return;
  }
}

class CardImageView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._state = null;
    this._form = { kind: "task", routineId: "", taskId: "", personId: "" };
    this._bitmap = null;
    this._crop = { zoom: 1, cx: 0, cy: 0 };
    this._pointers = new Map();
    this._paintFrame = 0;
    this._drawToken = 0;
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.addEventListener("click", (event) => this._onClick(event));
    root.addEventListener("change", (event) => this._onChange(event));
    root.addEventListener("input", (event) => this._onInput(event));
    root.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    root.addEventListener("pointermove", (event) => this._onPointerMove(event));
    root.addEventListener("pointerup", (event) => this._onPointerUp(event));
    root.addEventListener("pointercancel", (event) => this._onPointerUp(event));
    root.addEventListener("wheel", (event) => this._onWheel(event), { passive: false });
  }

  set hass(hass) {
    this._hass = hass;
  }

  set state(state) {
    if (state === this._state) {
      return;
    }
    this._state = state;
    this._normalizeForm();
    this._render();
  }

  get _t() {
    return translator(this._hass);
  }

  get _status() {
    return this._form.kind === "status";
  }

  _routine() {
    return this._state.routines.find((item) => item.id === this._form.routineId) || null;
  }

  _task() {
    return this._routine()?.tasks.find((item) => item.id === this._form.taskId) || null;
  }

  _person() {
    const { persons } = this._state;
    if (this._status) {
      return persons.find((item) => item.id === this._form.personId) || null;
    }
    return persons.find((item) => item.id === this._routine()?.person_id) || null;
  }

  _normalizeForm() {
    const { routines } = this._state;
    const form = this._form;
    const routine = routines.find((item) => item.id === form.routineId) || routines[0];
    form.routineId = routine?.id || "";
    const tasks = routine?.tasks || [];
    if (!tasks.some((task) => task.id === form.taskId)) {
      form.taskId = tasks[0]?.id || "";
    }
    const allowed = this._status ? this._state.persons.map((person) => person.id) : [];
    if (!allowed.includes(form.personId)) {
      form.personId = allowed[0] || "";
    }
  }

  _render() {
    const t = this._t;
    const { routines, persons } = this._state;
    const routine = this._routine();
    const form = this._form;
    const status = this._status;
    let body;

    if (!persons.length) {
      body = `<p class="empty">${t("no_persons")}</p>`;
    } else if (!routines.length && !status) {
      body = `<p class="empty">${t("no_routines")}</p>`;
    } else {
      const personOptions = status ? persons : [];
      const ready = status
        ? Boolean(this._person())
        : Boolean(this._bitmap && this._task() && this._person());
      body = `
        <div class="field">
          <span class="label">${t("card_kind")}</span>
          <div class="chips">
            <label class="chip-toggle"><input type="radio" name="image-kind" value="task" ${status ? "" : "checked"}><span>${t("card_kind_task")}</span></label>
            <label class="chip-toggle"><input type="radio" name="image-kind" value="status" ${status ? "checked" : ""}><span>${t("card_kind_status")}</span></label>
          </div>
        </div>
        ${
          status
            ? ""
            : `
          <div class="two">
            <div class="field">
              <label for="image-routine">${t("routine")}</label>
              <select id="image-routine" name="image-routine">
                ${routines
                  .map(
                    (item) =>
                      `<option value="${item.id}" ${item.id === form.routineId ? "selected" : ""}>${escapeHtml(item.name)}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label for="image-task">${t("task")}</label>
              <select id="image-task" name="image-task" ${routine?.tasks.length ? "" : "disabled"}>
                ${(routine?.tasks || [])
                  .map(
                    (item) =>
                      `<option value="${item.id}" ${item.id === form.taskId ? "selected" : ""}>${escapeHtml(item.label)}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>`
        }
        ${
          status
            ? `
          <div class="field">
            <label for="image-person">${t("person")}</label>
            <select id="image-person" name="image-person">
              ${personOptions
                .map(
                  (person) =>
                    `<option value="${person.id}" ${person.id === form.personId ? "selected" : ""}>${escapeHtml(person.name)}</option>`
                )
                .join("")}
            </select>
          </div>`
            : `<p class="hint">${this._person() ? `${t("person")}: ${escapeHtml(this._person().name)}` : t("routine_without_person")}</p>`
        }
        ${status || routine?.tasks.length ? "" : `<p class="hint">${t("no_tasks")}</p>`}
        <div class="preview">
          <canvas id="canvas" class="${!status && this._bitmap ? "croppable" : ""}" width="${SIZE}" height="${SIZE}"></canvas>
          ${status || this._bitmap ? "" : `<p class="empty">${t("no_photo")}</p>`}
        </div>
        ${
          !status && this._bitmap
            ? `
        <div class="field">
          <label for="zoom">${t("zoom")}</label>
          <input type="range" id="zoom" name="photo-zoom" min="1" max="${MAX_ZOOM}" step="0.01" value="${this._crop.zoom}">
          <p class="hint">${t("crop_hint")}</p>
        </div>`
            : ""
        }
        <div class="actions">
          ${
            status
              ? ""
              : `
          <label class="upload">
            <input type="file" id="photo" name="photo" accept="image/*">
            <ha-icon icon="mdi:image-plus"></ha-icon>${this._bitmap ? t("replace_photo") : t("choose_photo")}
          </label>`
          }
          <button data-action="save" ${ready ? "" : "disabled"}><ha-icon icon="mdi:download"></ha-icon>${t("save_image")}</button>
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        ${baseStyles}
        .preview { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        canvas {
          width: 100%; max-width: 340px; height: auto;
          border-radius: 12px;
          background: var(--secondary-background-color, rgba(0,0,0,.03));
        }
        canvas.croppable { cursor: grab; touch-action: none; }
        canvas.croppable.dragging { cursor: grabbing; }
        input[type="range"] { width: 100%; max-width: 340px; accent-color: var(--primary-color, #03a9f4); }
        .upload {
          font-size: 14px; padding: 8px 14px; border-radius: 18px;
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          background: transparent;
          color: var(--primary-color, #03a9f4);
          border: 1px solid var(--divider-color, #ccc);
        }
        .upload input { position: absolute; opacity: 0; width: 0; height: 0; }
        .upload:focus-within { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        .actions { justify-content: flex-start; }
        @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
      </style>
      <div class="stack">
        <section class="card">
          <h2>${t("card_image")}</h2>
          <p class="muted">${t(status ? "card_image_status_hint" : "card_image_hint")}</p>
          ${body}
        </section>
      </div>
    `;
    this._pointers.clear();
    this._draw();
  }

  _cropView() {
    const bitmap = this._bitmap;
    const crop = this._crop;
    const scale = Math.max(INNER.width / bitmap.width, INNER.height / bitmap.height) * crop.zoom;
    const width = INNER.width / scale;
    const height = INNER.height / scale;
    return { scale, width, height, x: crop.cx - width / 2, y: crop.cy - height / 2 };
  }

  _clampCrop() {
    const bitmap = this._bitmap;
    const crop = this._crop;
    crop.zoom = clamp(crop.zoom, 1, MAX_ZOOM);
    const { width, height } = this._cropView();
    crop.cx = clamp(crop.cx, width / 2, bitmap.width - width / 2);
    crop.cy = clamp(crop.cy, height / 2, bitmap.height - height / 2);
  }

  _panBy(dx, dy) {
    const { scale } = this._cropView();
    this._crop.cx -= dx / scale;
    this._crop.cy -= dy / scale;
    this._clampCrop();
  }

  _zoomAt(zoom, px, py) {
    const before = this._cropView();
    const bx = before.x + (px - INNER.x) / before.scale;
    const by = before.y + (py - INNER.y) / before.scale;
    this._crop.zoom = clamp(zoom, 1, MAX_ZOOM);
    const after = this._cropView();
    this._crop.cx = bx - (px - INNER.x) / after.scale + after.width / 2;
    this._crop.cy = by - (py - INNER.y) / after.scale + after.height / 2;
    this._clampCrop();
  }

  _schedulePaint() {
    if (this._paintFrame) {
      return;
    }
    this._paintFrame = requestAnimationFrame(() => {
      this._paintFrame = 0;
      const slider = this.shadowRoot.getElementById("zoom");
      if (slider) {
        slider.value = String(this._crop.zoom);
      }
      this._draw();
    });
  }

  _croppable(event) {
    return Boolean(this._bitmap) && !this._status && event.target?.id === "canvas";
  }

  _canvasPoint(event) {
    const rect = event.target.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * SIZE) / rect.width,
      y: ((event.clientY - rect.top) * SIZE) / rect.height,
    };
  }

  _onPointerDown(event) {
    if (!this._croppable(event) || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    event.target.setPointerCapture?.(event.pointerId);
    event.target.classList.add("dragging");
    this._pointers.set(event.pointerId, this._canvasPoint(event));
  }

  _onPointerMove(event) {
    const previous = this._pointers.get(event.pointerId);
    if (!previous || !this._croppable(event)) {
      return;
    }
    const point = this._canvasPoint(event);
    const others = [...this._pointers].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
    this._pointers.set(event.pointerId, point);
    if (others.length) {
      const other = others[0];
      const oldMid = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
      const newMid = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
      const oldDist = Math.hypot(previous.x - other.x, previous.y - other.y);
      const newDist = Math.hypot(point.x - other.x, point.y - other.y);
      this._panBy(newMid.x - oldMid.x, newMid.y - oldMid.y);
      if (oldDist > 0 && newDist > 0) {
        this._zoomAt((this._crop.zoom * newDist) / oldDist, newMid.x, newMid.y);
      }
    } else {
      this._panBy(point.x - previous.x, point.y - previous.y);
    }
    this._schedulePaint();
  }

  _onPointerUp(event) {
    if (!this._pointers.delete(event.pointerId)) {
      return;
    }
    if (!this._pointers.size) {
      event.target?.classList?.remove("dragging");
    }
  }

  _onWheel(event) {
    if (!this._croppable(event)) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? SIZE : 1);
    const point = this._canvasPoint(event);
    this._zoomAt(this._crop.zoom * Math.exp(-delta * WHEEL_ZOOM), point.x, point.y);
    this._schedulePaint();
  }

  _onInput(event) {
    if (event.target.name !== "photo-zoom" || !this._bitmap) {
      return;
    }
    this._zoomAt(Number(event.target.value), INNER.x + INNER.width / 2, INNER.y + INNER.height / 2);
    this._schedulePaint();
  }

  async _draw() {
    const canvas = this.shadowRoot.getElementById("canvas");
    if (!canvas) {
      return;
    }
    const status = this._status;
    const task = status ? null : this._task();
    const person = this._person();
    const glyph = task?.glyph || "";
    const token = ++this._drawToken;
    await Promise.all([
      loadFont(status ? LABEL_FONT : NAME_FONT, person?.name || "Aa"),
      status ? loadFont(QUESTION_FONT, "?") : loadFont(LABEL_FONT, task?.label || "Aa"),
      glyph ? loadFont(GLYPH_FONT, glyph) : Promise.resolve(),
    ]);
    if (token !== this._drawToken || !canvas.isConnected) {
      return;
    }

    const color = person?.color || "#9e9e9e";
    const ink = readableInk(color);
    const ctx = canvas.getContext("2d");
    const inner = INNER;
    const bandCenter = SIZE - BAND + BAND_CENTER;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    roundedPath(ctx, 0, 0, SIZE, SIZE, RADIUS);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (status) {
      ctx.font = QUESTION_FONT;
      ctx.fillText("?", SIZE / 2, inner.y + inner.height / 2, inner.width);
      ctx.font = LABEL_FONT;
      ctx.fillText(person?.name || "", SIZE / 2, bandCenter, inner.width);
      ctx.restore();
      return;
    }

    ctx.save();
    roundedPath(ctx, inner.x, inner.y, inner.width, inner.height, INNER_RADIUS);
    ctx.clip();
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(inner.x, inner.y, inner.width, inner.height);
    if (this._bitmap) {
      const view = this._cropView();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        this._bitmap,
        view.x,
        view.y,
        view.width,
        view.height,
        inner.x,
        inner.y,
        inner.width,
        inner.height
      );
    }
    ctx.restore();

    const textWidth = glyph ? inner.width - 2 * (GLYPH_SIZE + BAND_GAP) : inner.width;
    ctx.fillStyle = ink;
    if (glyph) {
      ctx.font = GLYPH_FONT;
      ctx.fillText(glyph, inner.x + GLYPH_SIZE / 2, bandCenter);
    }
    ctx.font = LABEL_FONT;
    ctx.fillText(task?.label || "", SIZE / 2, bandCenter - LABEL_OFFSET, textWidth);
    ctx.font = NAME_FONT;
    ctx.fillText(person?.name || "", SIZE / 2, bandCenter + NAME_OFFSET, textWidth);
    ctx.restore();
  }

  async _onFile(input) {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (err) {
      try {
        bitmap = await createImageBitmap(file);
      } catch (fallbackErr) {
        emitToast(this, this._t("photo_failed"));
        return;
      }
    }
    this._bitmap?.close?.();
    this._bitmap = bitmap;
    this._crop = { zoom: 1, cx: bitmap.width / 2, cy: bitmap.height / 2 };
    this._render();
  }

  async _save() {
    const canvas = this.shadowRoot.getElementById("canvas");
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      emitToast(this, this._t("photo_failed"));
      return;
    }
    const parts = this._status
      ? [this._person()?.name, "person"]
      : [this._routine()?.name, this._task()?.label, this._person()?.name];
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${parts.map((part) => slug(part)).join("-")}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  _onChange(event) {
    const target = event.target;
    if (target.name === "photo") {
      this._onFile(target);
      return;
    }
    if (target.name === "image-kind") {
      this._form.kind = target.value;
      this._form.personId = "";
    } else if (target.name === "image-routine") {
      this._form.routineId = target.value;
      this._form.taskId = "";
      this._form.personId = "";
    } else if (target.name === "image-task") {
      this._form.taskId = target.value;
    } else if (target.name === "image-person") {
      this._form.personId = target.value;
    } else {
      return;
    }
    this._normalizeForm();
    this._render();
  }

  async _onClick(event) {
    if (!event.target.closest('button[data-action="save"]')) {
      return;
    }
    try {
      await this._save();
    } catch (err) {
      emitToast(this, this._t("error", { message: err.message || err }));
    }
  }
}

customElements.define("fr-card-image", CardImageView);
