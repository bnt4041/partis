// ===================== State =====================

let currentAbc = "";
let visualObj = null;
let synthControl = null;
let cursorPos = 0;
let chatHistory = [];

// Set once a score has been saved (or opened from the library), so "Guardar"
// overwrites that same record instead of creating a new one. Reset to null
// whenever the editor starts a genuinely new piece (compose/blank).
let currentScoreId = null;

// Notes currently selected on the score (by text range), so the context menu
// and the Delete key can act on them. Cleared on every setAbc() call since a
// re-render invalidates both the char offsets and the abcjs element refs.
let noteSelection = [];

// ===================== DOM refs =====================

const composeBtn = document.getElementById("compose-btn");
const blankBtn = document.getElementById("blank-btn");
const statusEl = document.getElementById("status");
const scoreTitle = document.getElementById("score-title");
const scoreActions = document.getElementById("score-actions");
const scoreContainer = document.getElementById("score-container");
const playbackStatusEl = document.getElementById("playback-status");

const abcTextarea = document.getElementById("abc-source");

const stageEl = document.getElementById("stage");
const sheetEl = document.getElementById("sheet");
const railEl = document.getElementById("rail");
const viewModeEl = document.getElementById("view-mode");
const zoomLabelEl = document.getElementById("zoom-label");

const propKeySelect = document.getElementById("prop-key");
const propTimeSelect = document.getElementById("prop-time");
const propTempoInput = document.getElementById("prop-tempo");
const voiceListEl = document.getElementById("voice-list");
const addVoiceBtn = document.getElementById("add-voice-btn");

const accidentalSelect = document.getElementById("accidental-select");
const barlineBtn = document.getElementById("barline-btn");
const repeatStartBtn = document.getElementById("repeat-start-btn");
const repeatEndBtn = document.getElementById("repeat-end-btn");

const chatMessagesEl = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatStatusEl = document.getElementById("chat-status");

const dragGhost = document.getElementById("drag-ghost");
const contextMenuEl = document.getElementById("context-menu");
const notePreviewEl = document.getElementById("note-preview");
const notePreviewLabelEl = document.getElementById("note-preview-label");
const tupletSelect = document.getElementById("tuplet-select");
const tupletHintEl = document.getElementById("tuplet-hint");

const KEY_OPTIONS = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Am", "Em", "Bm", "F#m", "Dm", "Gm", "Cm"];
const TIME_OPTIONS = ["4/4", "3/4", "2/4", "6/8", "9/8", "12/8"];
const QUICK_KEYS = ["C", "G", "D", "F", "Am", "Em", "Gm"];
const QUICK_TIMES = ["4/4", "3/4", "6/8", "2/4"];
const QUICK_TEMPOS = [60, 90, 120, 140, 160];

const PAGE_WIDTH = 794; // A4 at 96dpi, before zoom
const PAGE_STAFF_WIDTH = 690; // printable width inside the page margins
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEPS = [0.5, 0.65, 0.8, 0.9, 1, 1.15, 1.35, 1.6, 2, 2.5];

const viewState = { mode: "page", zoom: 1 };

const FONT_CHOICES = {
  inter: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  poppins: '"Poppins", "Inter", -apple-system, "Segoe UI", sans-serif',
  serif: '"Source Serif 4", Georgia, "Times New Roman", serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

// Family names handed to abcjs must not contain digits: it parses the font
// string as "family size", so "Source Serif 4 22" would read 4 as the size.
const SCORE_FONT_FAMILY = {
  inter: "Inter",
  poppins: "Poppins",
  serif: "Georgia",
  system: "Helvetica",
};

const lookState = { theme: "dark", font: "inter", scoreFont: "engraving", notation: "latina" };

const PANEL_DEFAULT_POS = {
  "panel-compose": { x: 92, y: 78 },
  "panel-library": { x: 105, y: 91 },
  "panel-score": { x: 118, y: 104 },
  "panel-staves": { x: 144, y: 130 },
  "panel-notes": { x: 170, y: 156 },
  "panel-source": { x: 196, y: 182 },
  "panel-look": { x: 222, y: 208 },
  "panel-org": { x: 248, y: 234 },
  "panel-chat": { x: null, y: 78 }, // x null = anchored to the right edge
};

const INSTRUMENTS = [
  { value: "", label: "Automático" },
  { value: "0", label: "Piano" },
  { value: "40", label: "Violín" },
  { value: "73", label: "Flauta" },
  { value: "24", label: "Guitarra" },
  { value: "52", label: "Voz (coro)" },
  { value: "42", label: "Violonchelo" },
  { value: "56", label: "Trompeta" },
];

// ===================== Utils =====================

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setChatStatus(message, isError = false) {
  chatStatusEl.textContent = message;
  chatStatusEl.classList.toggle("error", isError);
}

function setPlaybackStatus(message) {
  playbackStatusEl.textContent = message;
}

function base64ToBytes(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64ToBlobUrl(base64, mimeType) {
  return URL.createObjectURL(new Blob([base64ToBytes(base64)], { type: mimeType }));
}

function downloadText(filename, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===================== Workspace: panels, zoom, view mode =====================

function loadStoredState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveStoredState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, blocked cookies): not worth failing over */
  }
}

let panelState = loadStoredState("partis.panels", {});

function panelEl(id) {
  return document.getElementById(id);
}

function clampPanelIntoView(el, x, y) {
  const maxX = Math.max(8, window.innerWidth - el.offsetWidth - 8);
  const maxY = Math.max(64, window.innerHeight - 120);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(64, y), maxY) };
}

// Place a newly opened panel where it doesn't cover the ones already open:
// walk down the column, hopping below whatever it collides with, then try the
// next column across.
function findFreePosition(el) {
  const others = [...document.querySelectorAll(".floating-panel:not([hidden])")].filter((p) => p !== el);
  const gap = 12;
  const startX = 92;
  const startY = 78;
  const maxY = window.innerHeight - 140;

  for (let col = 0; col < 4; col++) {
    const x = startX + col * (el.offsetWidth + gap);
    if (x + el.offsetWidth > window.innerWidth - 8) break;
    let y = startY;
    for (let guard = 0; guard < 10; guard++) {
      const collision = others.find((p) => {
        const r = p.getBoundingClientRect();
        return x < r.right && x + el.offsetWidth > r.left && y < r.bottom && y + el.offsetHeight > r.top;
      });
      if (!collision) {
        if (y + el.offsetHeight <= maxY) return { x, y };
        break;
      }
      y = collision.getBoundingClientRect().bottom + gap;
      if (y > maxY) break;
    }
  }
  return { x: startX, y: startY };
}

function positionPanel(id) {
  const el = panelEl(id);
  if (!el || window.innerWidth <= 860) return; // bottom-sheet mode positions via CSS
  const stored = panelState[id] || {};

  let x = stored.x;
  let y = stored.y;

  if (x === undefined || y === undefined) {
    const fallback = PANEL_DEFAULT_POS[id];
    // Chat prefers the right edge, but only if nothing is already there.
    if (fallback && fallback.x === null) {
      const preferredX = window.innerWidth - el.offsetWidth - 24;
      const clear = ![...document.querySelectorAll(".floating-panel:not([hidden])")]
        .filter((p) => p !== el)
        .some((p) => {
          const r = p.getBoundingClientRect();
          return preferredX < r.right && preferredX + el.offsetWidth > r.left && fallback.y < r.bottom && fallback.y + el.offsetHeight > r.top;
        });
      if (clear) {
        x = preferredX;
        y = fallback.y;
      }
    }
    if (x === undefined || y === undefined) {
      const free = findFreePosition(el);
      x = free.x;
      y = free.y;
    }
  }

  const clamped = clampPanelIntoView(el, x, y);
  el.style.left = `${clamped.x}px`;
  el.style.top = `${clamped.y}px`;
}

function openPanel(id) {
  const el = panelEl(id);
  if (!el) return;
  el.hidden = false;
  positionPanel(id);
  panelState[id] = { ...(panelState[id] || {}), open: true };
  saveStoredState("partis.panels", panelState);
  syncRailButtons();
}

function closePanel(id) {
  const el = panelEl(id);
  if (!el) return;
  el.hidden = true;
  panelState[id] = { ...(panelState[id] || {}), open: false };
  saveStoredState("partis.panels", panelState);
  syncRailButtons();
}

function togglePanel(id) {
  const el = panelEl(id);
  if (!el) return;
  if (el.hidden) openPanel(id);
  else closePanel(id);
}

function syncRailButtons() {
  railEl.querySelectorAll(".rail-btn").forEach((btn) => {
    const el = panelEl(btn.dataset.panel);
    btn.classList.toggle("is-open", !!el && !el.hidden);
  });
}

function setupPanels() {
  railEl.querySelectorAll(".rail-btn").forEach((btn) => {
    btn.addEventListener("click", () => togglePanel(btn.dataset.panel));
  });

  document.querySelectorAll(".floating-panel").forEach((panel) => {
    panel.querySelector(".panel-close").addEventListener("click", () => closePanel(panel.id));

    // Bring the clicked panel to the front
    panel.addEventListener("mousedown", () => {
      document.querySelectorAll(".floating-panel").forEach((p) => (p.style.zIndex = "70"));
      panel.style.zIndex = "75";
    });

    const header = panel.querySelector(".panel-header");
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".panel-close") || window.innerWidth <= 860) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      const onMove = (ev) => {
        const clamped = clampPanelIntoView(panel, ev.clientX - offsetX, ev.clientY - offsetY);
        panel.style.left = `${clamped.x}px`;
        panel.style.top = `${clamped.y}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        panelState[panel.id] = {
          ...(panelState[panel.id] || {}),
          x: parseInt(panel.style.left, 10),
          y: parseInt(panel.style.top, 10),
        };
        saveStoredState("partis.panels", panelState);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });

  const anyStored = Object.values(panelState).some((p) => p && p.open);
  if (!anyStored) {
    openPanel("panel-compose");
  } else {
    Object.entries(panelState).forEach(([id, state]) => {
      if (state && state.open) openPanel(id);
    });
  }
  syncRailButtons();
}

// ---------- Theme & typography ----------

function applyLook() {
  document.documentElement.dataset.theme = lookState.theme;
  document.documentElement.style.setProperty("--font-ui", FONT_CHOICES[lookState.font] || FONT_CHOICES.inter);

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.textContent = lookState.theme === "dark" ? "☾" : "☀";
  themeToggle.title = lookState.theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  document.querySelectorAll("#theme-switch button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.theme === lookState.theme);
  });
  document.getElementById("font-select").value = lookState.font;
  document.getElementById("score-font-select").value = lookState.scoreFont;
  document.getElementById("notation-select").value = lookState.notation;

  saveStoredState("partis.look", lookState);
}

// abcjs only honours these under a `format` object (top-level keys are
// ignored). Fonts as "family size"; the notes always use its own music font.
function scoreFontOptions() {
  if (lookState.scoreFont !== "ui") return {};
  const family = SCORE_FONT_FAMILY[lookState.font] || "Inter";
  return {
    format: {
      titlefont: `${family} 22`,
      subtitlefont: `${family} 16`,
      composerfont: `${family} 13`,
      voicefont: `${family} 12`,
      tempofont: `${family} 13`,
      partsfont: `${family} 14`,
      annotationfont: `${family} 12`,
    },
  };
}

function setTheme(theme) {
  lookState.theme = theme === "light" ? "light" : "dark";
  applyLook();
}

function setupLookControls() {
  const stored = loadStoredState("partis.look", lookState);
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  lookState.theme = stored.theme || (prefersLight ? "light" : "dark");
  lookState.font = FONT_CHOICES[stored.font] ? stored.font : "inter";
  lookState.scoreFont = stored.scoreFont === "ui" ? "ui" : "engraving";
  lookState.notation = stored.notation === "inglesa" ? "inglesa" : "latina";

  document.getElementById("notation-select").addEventListener("change", (e) => {
    lookState.notation = e.target.value;
    applyLook();
    refreshNoteNaming();
  });

  document.getElementById("theme-toggle").addEventListener("click", () => {
    setTheme(lookState.theme === "dark" ? "light" : "dark");
  });

  document.querySelectorAll("#theme-switch button").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.theme));
  });

  document.getElementById("font-select").addEventListener("change", (e) => {
    lookState.font = e.target.value;
    applyLook();
    if (lookState.scoreFont === "ui") renderScore();
  });

  document.getElementById("score-font-select").addEventListener("change", (e) => {
    lookState.scoreFont = e.target.value;
    applyLook();
    renderScore();
  });

  applyLook();
}

function setViewMode(mode) {
  viewState.mode = mode;
  stageEl.classList.toggle("mode-page", mode === "page");
  stageEl.classList.toggle("mode-continuous", mode === "continuous");
  viewModeEl.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  saveStoredState("partis.view", viewState);
  applySheetSize();
  renderScore();
}

function setZoom(zoom) {
  viewState.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  zoomLabelEl.textContent = `${Math.round(viewState.zoom * 100)}%`;
  saveStoredState("partis.view", viewState);
  applySheetSize();
  renderScore();
}

function stepZoom(direction) {
  const current = viewState.zoom;
  if (direction > 0) {
    setZoom(ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_MAX);
  } else {
    const smaller = ZOOM_STEPS.filter((z) => z < current - 0.001);
    setZoom(smaller.length ? smaller[smaller.length - 1] : ZOOM_MIN);
  }
}

function zoomToFit() {
  const available = stageEl.clientWidth - 56;
  setZoom(viewState.mode === "page" ? available / PAGE_WIDTH : 1);
}

function applySheetSize() {
  if (viewState.mode === "page") {
    sheetEl.style.width = `${PAGE_WIDTH * viewState.zoom}px`;
    sheetEl.style.padding = `${52 * viewState.zoom}px ${46 * viewState.zoom}px`;
  } else {
    sheetEl.style.width = "";
    sheetEl.style.padding = "";
  }
}

// abcjs draws at `staffwidth * zoom` pixels and always justifies the music to
// exactly that width. In continuous mode we therefore ask for a width that
// grows with the number of measures, so the piece stays on a single ribbon
// that scrolls sideways instead of wrapping onto several systems.
const CONTINUOUS_PX_PER_MEASURE = 165;

function estimateMeasureCount() {
  const { voices } = parseAbcHeaders(currentAbc);
  return countMeasures(currentAbc, voices.length > 0 ? voices[0].id : null);
}

function computeStaffWidth() {
  if (viewState.mode === "page") return PAGE_STAFF_WIDTH;
  // Size purely by measure count, never by the stage's own width: abcjs
  // justifies notes to fill whatever width it's given, so stretching a
  // short piece to the viewport turns a couple of bars into a barely
  // readable smear. A short piece just ends up narrower than the stage
  // (fine, it's left-aligned); a long one overflows and the stage scrolls.
  const available = Math.max(320, stageEl.clientWidth - 120) / viewState.zoom;
  const needed = Math.max(1, estimateMeasureCount()) * CONTINUOUS_PX_PER_MEASURE;
  return Math.max(Math.min(available, 480), needed);
}

function setupWorkspaceControls() {
  const stored = loadStoredState("partis.view", viewState);
  viewState.mode = stored.mode === "continuous" ? "continuous" : "page";
  viewState.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(stored.zoom) || 1));

  viewModeEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setViewMode(btn.dataset.mode));
  });
  document.getElementById("zoom-in").addEventListener("click", () => stepZoom(1));
  document.getElementById("zoom-out").addEventListener("click", () => stepZoom(-1));
  document.getElementById("zoom-fit").addEventListener("click", zoomToFit);

  // Ctrl/Cmd + wheel zooms the score, like any editor
  stageEl.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    },
    { passive: false }
  );

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      document.querySelectorAll(".floating-panel:not([hidden])").forEach((p) => positionPanel(p.id));
      if (viewState.mode === "continuous") renderScore();
    }, 150);
  });

  stageEl.classList.toggle("mode-page", viewState.mode === "page");
  stageEl.classList.toggle("mode-continuous", viewState.mode === "continuous");
  viewModeEl.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === viewState.mode));
  zoomLabelEl.textContent = `${Math.round(viewState.zoom * 100)}%`;
  applySheetSize();
}

// ===================== ABC header parsing / editing =====================

function parseAbcHeaders(abc) {
  const lines = abc.split("\n");
  const headers = { X: "1", T: "", M: "4/4", L: "1/8", Q: "1/4=120", K: "C" };
  let keyLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([XTMLQK]):\s*(.*)$/);
    if (m) {
      headers[m[1]] = m[2].trim();
      if (m[1] === "K") {
        keyLineIdx = i;
        break;
      }
    }
  }

  const voices = [];
  const seen = new Set();
  if (keyLineIdx !== -1) {
    for (let i = keyLineIdx + 1; i < lines.length; i++) {
      const vm = lines[i].match(/^V:\s*(\S+)(.*)$/);
      if (vm && !seen.has(vm[1])) {
        seen.add(vm[1]);
        const rest = vm[2];
        const clefMatch = rest.match(/clef=(\S+)/);
        const nameMatch = rest.match(/name="([^"]*)"/);
        const programMatch = lines[i + 1] && lines[i + 1].match(/^%%MIDI\s+program\s+(\d+)/);
        voices.push({
          id: vm[1],
          clef: clefMatch ? clefMatch[1] : "treble",
          name: nameMatch ? nameMatch[1] : "",
          program: programMatch ? programMatch[1] : "",
        });
      }
    }
  }

  return { headers, voices, keyLineIdx };
}

function replaceHeaderLine(abc, field, value) {
  const re = new RegExp(`^${field}:.*$`, "m");
  if (re.test(abc)) {
    return abc.replace(re, `${field}:${value}`);
  }
  return `${field}:${value}\n${abc}`;
}

function updateVoiceHeader(abc, voiceId, { clef, name, program }) {
  const lines = abc.split("\n");
  const headerRe = new RegExp(`^V:\\s*${voiceId}\\b`);
  const idx = lines.findIndex((l) => headerRe.test(l));
  if (idx === -1) return abc;

  lines[idx] = `V:${voiceId} clef=${clef}${name ? ` name="${name}"` : ""}`;

  const nextIsProgram = lines[idx + 1] && /^%%MIDI\s+program\s+\d+/.test(lines[idx + 1]);
  if (program) {
    const programLine = `%%MIDI program ${program}`;
    if (nextIsProgram) lines[idx + 1] = programLine;
    else lines.splice(idx + 1, 0, programLine);
  } else if (nextIsProgram) {
    lines.splice(idx + 1, 1);
  }

  return lines.join("\n");
}

function getVoiceBlockRange(abc, voiceId) {
  const lines = abc.split("\n");
  const headerRe = new RegExp(`^V:\\s*${voiceId}\\b`);
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && headerRe.test(lines[i])) {
      start = i;
      continue;
    }
    if (start !== -1 && i > start && /^V:\s*\S+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

function removeVoiceBlock(abc, voiceId) {
  const { lines, start, end } = getVoiceBlockRange(abc, voiceId);
  if (start === -1) return abc;
  lines.splice(start, end - start);
  return lines.join("\n");
}

// Move the whole V:<sourceVoiceId> block (header + %%MIDI line + music) to just
// before/after the V:<targetVoiceId> block, reordering the staves top-to-bottom.
function reorderVoice(abc, sourceVoiceId, targetVoiceId, placeAfter) {
  if (sourceVoiceId === targetVoiceId) return abc;
  const { lines, start: sStart, end: sEnd } = getVoiceBlockRange(abc, sourceVoiceId);
  if (sStart === -1) return abc;
  const block = lines.slice(sStart, sEnd);
  const remainingAbc = [...lines.slice(0, sStart), ...lines.slice(sEnd)].join("\n");

  const { lines: remainingLines, start: tStart, end: tEnd } = getVoiceBlockRange(remainingAbc, targetVoiceId);
  if (tStart === -1) return abc;
  const insertAt = placeAfter ? tEnd : tStart;
  return [...remainingLines.slice(0, insertAt), ...block, ...remainingLines.slice(insertAt)].join("\n");
}

function moveVoice(voiceId, direction) {
  const { voices } = parseAbcHeaders(currentAbc);
  const idx = voices.findIndex((v) => v.id === voiceId);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= voices.length) return;
  setAbc(reorderVoice(currentAbc, voiceId, voices[targetIdx].id, direction > 0));
}

function countMeasures(abc, voiceId) {
  const { keyLineIdx } = parseAbcHeaders(abc);
  const lines = abc.split("\n");
  const bodyLines = keyLineIdx !== -1 ? lines.slice(keyLineIdx + 1) : lines;
  let collecting = voiceId === null;
  let text = "";
  for (const line of bodyLines) {
    const vm = line.match(/^V:\s*(\S+)/);
    if (vm) {
      collecting = vm[1] === voiceId;
      continue;
    }
    if (collecting) text += ` ${line}`;
  }
  const matches = text.match(/\|/g);
  return matches ? Math.max(1, Math.round(matches.length / 2)) : 4;
}

// How many L-units (the score's basic note-length unit) fit in one measure,
// e.g. M:4/4 with L:1/8 holds 8 eighth-note units.
function unitsPerMeasureFromHeaders(headers) {
  const mMatch = headers.M.match(/(\d+)\s*\/\s*(\d+)/);
  const beatsPerMeasure = mMatch ? parseInt(mMatch[1], 10) : 4;
  const beatUnit = mMatch ? parseInt(mMatch[2], 10) : 4;
  const lMatch = headers.L.match(/(\d+)\s*\/\s*(\d+)/);
  const lDen = lMatch ? parseInt(lMatch[2], 10) : 8;
  return Math.max(1, Math.round((beatsPerMeasure / beatUnit) * lDen));
}

function restsForMeasure(headers) {
  return `z${unitsPerMeasureFromHeaders(headers)}`;
}

// Parse an ABC duration suffix ("", "2", "/2", "3/2"...) into a plain
// multiple of the L-unit. Returns null if it isn't a form we understand, so
// callers can fall back to simpler behaviour instead of mis-measuring a bar.
function parseAbcDurationUnits(durationStr) {
  if (!durationStr) return 1;
  const m = durationStr.match(/^(\d*)(\/(\d*))?$/);
  if (!m) return null;
  const num = m[1] ? parseInt(m[1], 10) : 1;
  if (m[2] !== undefined) {
    const den = m[3] ? parseInt(m[3], 10) : 2;
    return num / den;
  }
  return num;
}

// The inverse of parseAbcDurationUnits: turn a unit count back into an ABC
// duration suffix, preferring the short forms ("/2" rather than "1/2") that
// match what the note palette itself writes.
function unitsToAbcDurationSuffix(units) {
  if (Math.abs(units - 1) < 1e-9) return "";
  if (Number.isInteger(units)) return String(units);
  for (const den of [2, 4, 8, 3, 6]) {
    const num = units * den;
    if (Math.abs(num - Math.round(num)) < 1e-6) {
      const n = Math.round(num);
      return n === 1 ? `/${den}` : `${n}/${den}`;
    }
  }
  return String(units);
}

// Where the measure containing `insertAt` starts: right after the last
// barline before it, or right after that voice's own V: header if there's no
// barline yet (so we never walk back into a previous voice's music).
function currentMeasureStart(fullText, insertAt) {
  const before = fullText.slice(0, insertAt);
  let start = before.lastIndexOf("|") + 1;
  const headerMatches = [...before.matchAll(/^V:\s*\S+.*$/gm)];
  if (headerMatches.length) {
    const last = headerMatches[headerMatches.length - 1];
    start = Math.max(start, last.index + last[0].length);
  }
  return start;
}

// Sum the note/rest duration (in L-units) written so far in `measureText`
// (normally the slice from currentMeasureStart() up to the insertion point).
// Returns null when it hits something it doesn't know how to account for
// (an unusual ornament, an odd duration...) so the caller can skip the
// auto-barline/tie feature for that insertion rather than risk miscounting.
function sumMeasureUnits(measureText) {
  let units = 0;
  let k = 0;
  while (k < measureText.length) {
    const ch = measureText[k];
    if (/\s/.test(ch)) {
      k += 1;
      continue;
    }
    if (ch === '"') {
      const end = measureText.indexOf('"', k + 1);
      if (end === -1) return null;
      k = end + 1;
      continue;
    }
    if (ch === "!") {
      const end = measureText.indexOf("!", k + 1);
      if (end === -1) return null;
      k = end + 1;
      continue;
    }
    if (ch === "(" && /\d/.test(measureText[k + 1] || "")) {
      k += 2; // tuplet marker, e.g. "(3" - takes no time itself
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "-" || ch === ">" || ch === "<") {
      k += 1;
      continue;
    }
    if (ch === "[") {
      const fieldMatch = measureText.slice(k).match(/^\[[A-Za-z]:[^\]]*\]/);
      if (fieldMatch) {
        k += fieldMatch[0].length;
        continue;
      }
      const end = measureText.indexOf("]", k + 1);
      if (end === -1) return null;
      const durMatch = measureText.slice(end + 1).match(/^(\d*\/?\d*)/);
      const durUnits = parseAbcDurationUnits(durMatch ? durMatch[1] : "");
      if (durUnits === null) return null;
      units += durUnits;
      k = end + 1 + (durMatch ? durMatch[0].length : 0);
      continue;
    }
    const noteMatch = measureText.slice(k).match(/^(\^{1,2}|_{1,2}|=)?[A-Ga-gxXzZ][,']*(\d*\/?\d*)/);
    if (noteMatch) {
      const durUnits = parseAbcDurationUnits(noteMatch[2]);
      if (durUnits === null) return null;
      units += durUnits;
      k += noteMatch[0].length;
      continue;
    }
    return null; // something we don't recognise: bail out rather than guess
  }
  return units;
}

function addVoice() {
  const { headers, voices } = parseAbcHeaders(currentAbc);
  const ids = voices.map((v) => v.id);
  let n = 1;
  while (ids.includes(String(n))) n++;
  const newId = String(n);
  const measureCount = voices.length > 0 ? countMeasures(currentAbc, voices[0].id) : 4;
  const restToken = restsForMeasure(headers);
  const restLine = `${Array(measureCount).fill(restToken).join(" | ")} |`;
  // No blank line between voice blocks: a blank line in ABC ends the tune,
  // so abcjs would silently drop every voice added after the first one.
  const block = `V:${newId} clef=treble name="Voz ${n}"\n${restLine}`;
  setAbc(`${currentAbc.replace(/\s*$/, "")}\n${block}\n`);
}

function removeVoice(voiceId) {
  setAbc(removeVoiceBlock(currentAbc, voiceId));
}

// ===================== Rendering =====================

const ABC_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

// Internal pitch numbering: 0 = uppercase "C" with no octave marks, 7 = one
// octave up (lowercase "c"), -7 = one octave down ("C,"), etc.
function absoluteToAbcPitch(absolute) {
  const octaveBlock = Math.floor(absolute / 7);
  const letterIndex = absolute - octaveBlock * 7;
  const letter = ABC_LETTERS[letterIndex];
  if (octaveBlock >= 1) {
    return letter.toLowerCase() + (octaveBlock - 1 > 0 ? "'".repeat(octaveBlock - 1) : "");
  }
  return letter.toUpperCase() + (-octaveBlock > 0 ? ",".repeat(-octaveBlock) : "");
}

// Top staff line of each clef, expressed in the same numbering as above
// (uppercase C/no marks = 0), using the standard "uppercase C = middle C" ABC
// convention: treble top line F5 = +10, bass top line A3 = -2, etc.
const CLEF_TOP_LINE_ABSOLUTE = { treble: 10, bass: -2, alto: 4, tenor: 2 };

// Shift a single ABC note token (e.g. "^C,2" or "e'/2") up/down by `steps`
// diatonic steps, keeping any leading accidental and trailing duration intact.
function shiftAbcNoteToken(token, steps) {
  const m = token.match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(.*)$/);
  if (!m || steps === 0) return token;
  const [, accidental = "", letter, octaveMarks, rest] = m;

  let octave = letter === letter.toLowerCase() ? 1 : 0;
  for (const ch of octaveMarks) {
    if (ch === "'") octave += 1;
    else if (ch === ",") octave -= 1;
  }

  const absolute = octave * 7 + ABC_LETTERS.indexOf(letter.toUpperCase()) + steps;
  return accidental + absoluteToAbcPitch(absolute) + rest;
}

// Map the rendered SVG (one <g> of 5 staff-line paths per voice, tagged with
// a leading .abcjs-top-line) to {topY, spacing, voiceId, clef, elements} per
// staff, so a drop point can be translated into "which voice / which pitch /
// insert before which character".
function buildStaffMap() {
  const svg = scoreContainer.querySelector("svg");
  if (!svg || !visualObj) return [];

  const topLineEls = [...svg.querySelectorAll(".abcjs-top-line")];
  const { voices } = parseAbcHeaders(currentAbc);
  const map = [];
  let flatIndex = 0;

  (visualObj.lines || []).forEach((line) => {
    (line.staff || []).forEach((st, si) => {
      const topLineEl = topLineEls[flatIndex];
      flatIndex += 1;
      if (!topLineEl) return;

      const group = topLineEl.parentElement;
      const linePaths = group ? [...group.querySelectorAll("path")] : [topLineEl];
      const ys = linePaths.map((p) => p.getBBox().y);
      const topY = Math.min(...ys);
      const bottomY = Math.max(...ys);
      const spacing = ys.length > 1 ? (bottomY - topY) / (ys.length - 1) : 12;

      const voice = voices[si];
      const elements = ((st.voices && st.voices[0]) || [])
        .filter((e) => e.abselem && typeof e.abselem.x === "number")
        .map((e) => ({ startChar: e.startChar, endChar: e.endChar, x: e.abselem.x }));

      map.push({
        topY,
        spacing,
        voiceId: voice ? voice.id : String(si + 1),
        clef: voice ? voice.clef : "treble",
        elements,
      });
    });
  });

  return map;
}

function screenToSvgPoint(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function svgPointToScreen(svg, x, y) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x, y };
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const transformed = pt.matrixTransform(ctm);
  return { x: transformed.x, y: transformed.y };
}

// Given a drop point in page coordinates, find the closest staff, compute the
// pitch from vertical distance to its top line, and find which existing
// note/rest/bar it should be inserted after based on horizontal position.
function computeDropInsertion(clientX, clientY) {
  const svg = scoreContainer.querySelector("svg");
  if (!svg) return null;
  const map = buildStaffMap();
  if (map.length === 0) return null;

  const pt = screenToSvgPoint(svg, clientX, clientY);

  let best = null;
  let bestDist = Infinity;
  for (const entry of map) {
    const center = entry.topY + entry.spacing * 2;
    const dist = Math.abs(pt.y - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  if (!best) return null;

  // Reject drops that aren't actually near a staff: without this, the vertical
  // distance keeps extrapolating and a drop over the title or the empty part
  // of the sheet lands octaves away (Si7, Mi-22...).
  const staffHeight = best.spacing * 4; // top line -> bottom line
  const tolerance = best.spacing * 3; // ~6 diatonic steps of ledger lines
  if (pt.y < best.topY - tolerance || pt.y > best.topY + staffHeight + tolerance) return null;

  const halfSpacing = best.spacing / 2 || 6;
  const MAX_STEPS_ABOVE = 6; // ledger lines above the top line
  const MIN_STEPS_BELOW = -14; // 8 steps of staff + 6 of ledger lines below
  const steps = Math.min(
    MAX_STEPS_ABOVE,
    Math.max(MIN_STEPS_BELOW, Math.round((best.topY - pt.y) / halfSpacing))
  );
  const topAbsolute = CLEF_TOP_LINE_ABSOLUTE[best.clef] ?? CLEF_TOP_LINE_ABSOLUTE.treble;
  const pitchAbsolute = topAbsolute + steps;
  const snappedSvgY = best.topY - steps * halfSpacing;

  let anchor = null;
  for (const el of best.elements) {
    if (el.x <= pt.x) anchor = el;
    else break;
  }
  const insertAt = anchor ? anchor.endChar : best.elements[0] ? best.elements[0].startChar : null;
  if (insertAt === null) return null;

  return { insertAt, pitchAbsolute, voiceId: best.voiceId, svg, svgX: pt.x, snappedSvgY };
}

const SOLFEGE_ES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

// e.g. absolute 4 -> "Sol4" / "G4", depending on the chosen note naming
// (same octave numbering as absoluteToAbcPitch: uppercase "C" = octave 4).
function solfegeName(absolute) {
  const octaveBlock = Math.floor(absolute / 7);
  const letterIndex = absolute - octaveBlock * 7;
  const name = lookState.notation === "inglesa" ? ABC_LETTERS[letterIndex] : SOLFEGE_ES[letterIndex];
  return `${name}${octaveBlock + 4}`;
}

// Translate an ABC key name ("Bb", "F#m"...) for display only; the value sent
// to the ABC always stays in the international form.
function keyLabel(abcKey) {
  if (lookState.notation === "inglesa") return abcKey;
  const m = abcKey.match(/^([A-G])(#|b)?(m)?$/);
  if (!m) return abcKey;
  const [, letter, accidental, minor] = m;
  const base = SOLFEGE_ES[ABC_LETTERS.indexOf(letter)];
  const acc = accidental === "#" ? "♯" : accidental === "b" ? "♭" : "";
  return `${base}${acc}${minor ? "m" : ""}`;
}

function showNotePreviewAt(result, overrideLabel) {
  const screenPt = svgPointToScreen(result.svg, result.svgX, result.snappedSvgY);
  notePreviewEl.style.left = `${screenPt.x}px`;
  notePreviewEl.style.top = `${screenPt.y}px`;
  notePreviewEl.hidden = false;

  notePreviewLabelEl.textContent = overrideLabel || solfegeName(result.pitchAbsolute);
  notePreviewLabelEl.style.left = `${screenPt.x}px`;
  notePreviewLabelEl.style.top = `${screenPt.y}px`;
  notePreviewLabelEl.hidden = false;
}

function hideNotePreview() {
  notePreviewEl.hidden = true;
  notePreviewLabelEl.hidden = true;
}

function buildNoteOrRestToken(kind, pitchAbsolute, accidental, durationSuffix) {
  if (kind === "rest") return `z${durationSuffix}`;
  return `${accidental}${absoluteToAbcPitch(pitchAbsolute)}${durationSuffix}`;
}

// Insert a note/rest at `insertAt`. If it doesn't fit in what's left of the
// current measure, close the measure with a barline instead (nothing left)
// or split it across the barline as two tied notes (partial fit) - so the
// user never has to manually fix up the bar after dropping a note that's too
// long for the space that's left.
function insertPaletteItem(insertAt, kind, duration, pitchAbsolute) {
  const accidental = kind === "rest" ? "" : accidentalSelect.value;
  const wantedUnits = parseAbcDurationUnits(duration);
  const { headers } = parseAbcHeaders(currentAbc);
  const capacity = unitsPerMeasureFromHeaders(headers);
  const measureStart = currentMeasureStart(currentAbc, insertAt);
  const used = wantedUnits === null ? null : sumMeasureUnits(currentAbc.slice(measureStart, insertAt));
  const remaining = used === null ? null : capacity - used;

  let text;
  if (remaining === null || remaining >= wantedUnits - 1e-6) {
    const token = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(wantedUnits));
    text = `${applyTupletMarker(token)} `;
  } else if (remaining <= 1e-6) {
    const token = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(wantedUnits));
    text = `| ${applyTupletMarker(token)} `;
  } else {
    const first = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(remaining));
    const second = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(wantedUnits - remaining));
    const tie = kind === "rest" ? "" : "-";
    text = `${applyTupletMarker(first)}${tie}| ${second} `;
  }

  if (accidental) accidentalSelect.value = "";
  setAbc(currentAbc.slice(0, insertAt) + text + currentAbc.slice(insertAt));
  cursorPos = insertAt + text.length;
}

// ===================== Tuplets (tresillo, quintillo...) =====================
//
// ABC marks a tuplet by prefixing the FIRST note/rest of the group with
// "(n" (e.g. "(3" for a triplet); every note keeps its normal written
// duration. Picking a group size arms it; each note/rest you place afterwards
// counts toward the group, and it disarms itself automatically once full.

let tupletState = { size: 0, remaining: 0 };

function updateTupletHint() {
  if (tupletState.remaining > 0) {
    tupletHintEl.textContent = `Coloca ${tupletState.remaining} nota(s) más para completar el grupo de ${tupletState.size}.`;
  } else {
    tupletHintEl.textContent = "";
  }
}

function applyTupletMarker(token) {
  if (tupletState.remaining > 0) {
    tupletState.remaining -= 1;
    if (tupletState.remaining === 0) tupletSelect.value = "0";
    updateTupletHint();
    return token;
  }
  const armedSize = parseInt(tupletSelect.value, 10) || 0;
  if (armedSize > 0) {
    tupletState = { size: armedSize, remaining: armedSize - 1 };
    updateTupletHint();
    return `(${armedSize}${token}`;
  }
  return token;
}

tupletSelect.addEventListener("change", () => {
  const size = parseInt(tupletSelect.value, 10) || 0;
  tupletState = { size: 0, remaining: 0 };
  tupletHintEl.textContent = size > 0 ? `El siguiente grupo de ${size} notas/silencios que coloques formará un grupo de ${size}.` : "";
});

function abcTokenToAbsolute(token) {
  const m = token.match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/);
  if (!m) return null;
  const [, , letter, octaveMarks] = m;
  let octave = letter === letter.toLowerCase() ? 1 : 0;
  for (const ch of octaveMarks) {
    if (ch === "'") octave += 1;
    else if (ch === ",") octave -= 1;
  }
  return octave * 7 + ABC_LETTERS.indexOf(letter.toUpperCase());
}

let playbackStatusFlashTimer = null;
function flashPlaybackStatus(message, ms = 1400) {
  clearTimeout(playbackStatusFlashTimer);
  setPlaybackStatus(message);
  playbackStatusFlashTimer = setTimeout(() => setPlaybackStatus(""), ms);
}

// ===================== Note selection (for the context menu & Delete) ======
//
// abcjs's own AbsoluteElement exposes highlight()/unhighlight() (it's what it
// uses internally to mark a dragged note), so we reuse that for our own
// selection highlight instead of drawing anything extra.

function unhighlightSelection() {
  noteSelection.forEach((n) => {
    try {
      if (n.abselem && n.abselem.unhighlight) n.abselem.unhighlight();
    } catch {
      /* the SVG behind it may already be gone after a re-render */
    }
  });
}

function clearNoteSelectionState() {
  unhighlightSelection();
  noteSelection = [];
}

function selectNoteRange(start, end, abselem, additive) {
  const idx = noteSelection.findIndex((n) => n.start === start && n.end === end);
  if (additive) {
    if (idx !== -1) {
      try {
        noteSelection[idx].abselem && noteSelection[idx].abselem.unhighlight();
      } catch {
        /* ignore */
      }
      noteSelection.splice(idx, 1);
      return;
    }
    noteSelection.push({ start, end, abselem });
  } else {
    if (idx !== -1 && noteSelection.length === 1) return; // already the sole selection
    unhighlightSelection();
    noteSelection = [{ start, end, abselem }];
  }
  try {
    if (abselem && abselem.highlight) abselem.highlight();
  } catch {
    /* ignore */
  }
}

function handleScoreInteraction(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
  if (!abcelem || typeof abcelem.startChar !== "number" || typeof abcelem.endChar !== "number") return;

  if (drag && typeof drag.step === "number" && drag.step !== 0) {
    // abcjs reports drag.step in screen-Y-down terms (it literally translates
    // the note by step*STEP pixels), so a drag toward the top of the screen
    // is a NEGATIVE step - the opposite of our diatonic numbering, where a
    // higher `absolute` means a higher pitch. Negate it here or every drag
    // commits the note a mirror image of where it was actually dropped.
    const original = currentAbc.slice(abcelem.startChar, abcelem.endChar);
    const shifted = shiftAbcNoteToken(original, -drag.step);
    if (shifted !== original) {
      setAbc(currentAbc.slice(0, abcelem.startChar) + shifted + currentAbc.slice(abcelem.endChar));
      const absolute = abcTokenToAbsolute(shifted);
      if (absolute !== null) flashPlaybackStatus(solfegeName(absolute));
    }
    return;
  }

  // Plain click (no drag): select this note - held ctrl/cmd/shift extends the
  // selection so several notes can be edited together from the context menu
  // or deleted together - and move the text-editor cursor right after it.
  const additive = !!(mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey));
  selectNoteRange(abcelem.startChar, abcelem.endChar, abcelem.abselem, additive);
  cursorPos = abcelem.endChar;
  abcTextarea.setSelectionRange(abcelem.startChar, abcelem.endChar);
}

function renderScore() {
  if (!currentAbc.trim()) {
    scoreContainer.innerHTML = "";
    visualObj = null;
    stageEl.classList.add("is-empty");
    return;
  }
  stageEl.classList.remove("is-empty");
  try {
    const tunes = ABCJS.renderAbc("score-container", currentAbc, {
      staffwidth: computeStaffWidth(),
      scale: viewState.zoom,
      dragging: true,
      selectTypes: ["note", "rest"],
      clickListener: handleScoreInteraction,
      selectionColor: "#5f8dff",
      ...scoreFontOptions(),
    });
    visualObj = tunes[0];
    updatePlaybackTune();
  } catch (err) {
    console.error("Error rendering ABC", err);
  }
}

// ---------- Playback cursor ----------
//
// abcjs reports the position of every note it plays through `cursorControl`.
// We draw a vertical line inside the SVG at that position and keep it in view,
// which is what makes the continuous ribbon usable while it plays.

function ensureCursorLine() {
  const svg = scoreContainer.querySelector("svg");
  if (!svg) return null;
  let line = svg.querySelector(".abcjs-cursor");
  if (!line) {
    line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "abcjs-cursor");
    line.setAttribute("x1", 0);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", 0);
    line.setAttribute("y2", 0);
    svg.appendChild(line);
  }
  return line;
}

function clearPlayingHighlight() {
  scoreContainer
    .querySelectorAll(".abcjs-note-playing")
    .forEach((el) => el.classList.remove("abcjs-note-playing"));
}

function hidePlaybackCursor() {
  const line = scoreContainer.querySelector(".abcjs-cursor");
  if (line) {
    line.setAttribute("x1", 0);
    line.setAttribute("x2", 0);
    line.setAttribute("y1", 0);
    line.setAttribute("y2", 0);
  }
  clearPlayingHighlight();
}

function scrollCursorIntoView(svg, ev) {
  const screen = svgPointToScreen(svg, ev.left, ev.top);
  const stageRect = stageEl.getBoundingClientRect();

  const leftEdge = stageRect.left + 80;
  const rightEdge = stageRect.right - stageRect.width * 0.3;
  if (screen.x > rightEdge) stageEl.scrollLeft += screen.x - rightEdge;
  else if (screen.x < leftEdge) stageEl.scrollLeft += screen.x - leftEdge;

  const bottom = svgPointToScreen(svg, ev.left, ev.top + ev.height).y;
  if (bottom > stageRect.bottom - 20) stageEl.scrollTop += bottom - (stageRect.bottom - 20);
  else if (screen.y < stageRect.top + 20) stageEl.scrollTop += screen.y - (stageRect.top + 20);
}

const cursorControl = {
  beatSubdivisions: 2,
  onStart() {
    ensureCursorLine();
  },
  onEvent(ev) {
    if (ev.measureStart && ev.left === null) return; // second half of a tie
    const svg = scoreContainer.querySelector("svg");
    const line = ensureCursorLine();
    if (!svg || !line) return;

    line.setAttribute("x1", ev.left - 2);
    line.setAttribute("x2", ev.left - 2);
    line.setAttribute("y1", ev.top);
    line.setAttribute("y2", ev.top + ev.height);

    clearPlayingHighlight();
    (ev.elements || []).forEach((group) =>
      (group || []).forEach((el) => el.classList && el.classList.add("abcjs-note-playing"))
    );

    scrollCursorIntoView(svg, ev);
  },
  onFinished() {
    hidePlaybackCursor();
  },
};

async function ensureSynthControl() {
  if (synthControl) return;
  synthControl = new ABCJS.synth.SynthController();
  synthControl.load("#audio-controls", cursorControl, {
    displayLoop: true,
    displayRestart: true,
    displayPlay: true,
    displayProgress: true,
    displayWarp: true,
  });
}

// ---------- Metronome ----------
//
// abcjs plays a click track from the same drum parameters as the `%%MIDI drum`
// directive: a pattern of beats, then one MIDI pitch per beat, then one
// velocity per beat. Beat 1 gets a different pitch/velocity so it's audible
// as the downbeat.
let metronomeOn = false;

function metronomeParams() {
  if (!metronomeOn) return { drumOn: false };

  const { headers } = parseAbcHeaders(currentAbc);
  const m = headers.M.match(/(\d+)\s*\/\s*(\d+)/);
  let beats = m ? parseInt(m[1], 10) : 4;
  const denominator = m ? parseInt(m[2], 10) : 4;
  if (denominator === 8 && beats % 3 === 0) beats /= 3; // 6/8, 9/8, 12/8 are compound
  beats = Math.max(1, Math.min(12, beats));

  const pitches = Array(beats).fill(77);
  const velocities = Array(beats).fill(50);
  pitches[0] = 76;
  velocities[0] = 95;

  return {
    drum: `${"d".repeat(beats)} ${pitches.join(" ")} ${velocities.join(" ")}`,
    drumBars: 1,
    drumIntro: 0,
    drumOn: true,
  };
}

function setMetronome(on) {
  metronomeOn = on;
  const btn = document.getElementById("metronome-toggle");
  btn.classList.toggle("is-on", on);
  btn.title = on ? "Metrónomo activado" : "Metrónomo: marca el pulso al reproducir";
  saveStoredState("partis.metronome", { on });
  updatePlaybackTune();
}

async function updatePlaybackTune() {
  if (!visualObj) return;
  if (!ABCJS.synth.supportsAudio()) {
    setPlaybackStatus("Este navegador no soporta reproducción de audio (Web Audio API).");
    return;
  }
  await ensureSynthControl();
  try {
    await synthControl.setTune(visualObj, false, { chordsOff: false, ...metronomeParams() });
    setPlaybackStatus("");
  } catch (err) {
    console.error(err);
    setPlaybackStatus("No se pudo preparar el audio de esta partitura.");
  }
}

// ===================== Custom pointer-based drag & drop =====================
//
// Native HTML5 drag-and-drop doesn't give us the geometry we need (and is
// inconsistent across browsers/touch), so palette items and voice rows use
// plain mouse events instead: mousedown starts tracking, a small ghost label
// follows the cursor, and mouseup either fires onDrop (over a `.drop-target`
// / custom `dropSelector`) or onClick (negligible movement = a plain click).

function startCustomDrag(startEvent, { label, onDrop, onClick, onMoveOver, onMoveLeave, dropSelector = ".drop-target" }) {
  startEvent.preventDefault();
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  let moved = false;

  dragGhost.textContent = label;
  dragGhost.hidden = false;
  positionGhost(startX, startY);

  function positionGhost(x, y) {
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
  }

  function clearHover() {
    document.querySelectorAll(".drop-hover").forEach((el) => el.classList.remove("drop-hover"));
  }

  function onMove(ev) {
    if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
    positionGhost(ev.clientX, ev.clientY);
    clearHover();
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const dropZone = target && target.closest(dropSelector);
    if (dropZone) {
      dropZone.classList.add("drop-hover");
      if (onMoveOver) onMoveOver(dropZone, ev.clientX, ev.clientY);
    } else if (onMoveLeave) {
      onMoveLeave();
    }
  }

  function onUp(ev) {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    dragGhost.hidden = true;
    clearHover();
    if (onMoveLeave) onMoveLeave();
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const dropZone = target && target.closest(dropSelector);
    if (dropZone && moved) {
      onDrop(dropZone, ev.clientX, ev.clientY);
    } else if (!moved && onClick) {
      onClick();
    }
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ===================== Context menu =====================

function showContextMenu(x, y, items) {
  contextMenuEl.innerHTML = "";
  items.forEach((item) => {
    if (item.separator) {
      contextMenuEl.appendChild(document.createElement("hr"));
      return;
    }
    const btn = document.createElement("button");
    btn.textContent = item.label;
    if (item.danger) btn.style.color = "var(--danger)";
    btn.addEventListener("click", (e) => {
      // Items that open a submenu (e.g. "Añadir armadura") call
      // showContextMenu() again from inside onClick(), which replaces this
      // very button in the DOM. Without stopping propagation, this same
      // click event then reaches the document-level "click outside closes
      // the menu" listener below - and since the original target button no
      // longer exists anywhere, contextMenuEl.contains(e.target) is false,
      // so it immediately hides the submenu that was just opened.
      e.stopPropagation();
      hideContextMenu();
      item.onClick();
    });
    contextMenuEl.appendChild(btn);
  });
  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;
  contextMenuEl.hidden = false;
}

function hideContextMenu() {
  contextMenuEl.hidden = true;
}

document.addEventListener("click", (e) => {
  if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target)) hideContextMenu();
});
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest(".voice-row") && !e.target.closest("#score-container")) hideContextMenu();
});

// ===================== Note & staff context menu =====================
//
// Right-clicking the score does its own hit-test (abcjs's clickListener only
// fires for left-clicks): findScoreHit() reuses the same staff geometry as
// computeDropInsertion() to say whether the point landed on a note/rest, or
// on empty space within a staff (for the "add key/meter/note/text here" and
// "delete this staff" actions).

function findScoreHit(clientX, clientY) {
  const svg = scoreContainer.querySelector("svg");
  if (!svg || !visualObj) return null;
  const pt = screenToSvgPoint(svg, clientX, clientY);
  const { voices } = parseAbcHeaders(currentAbc);
  const topLineEls = [...svg.querySelectorAll(".abcjs-top-line")];
  let flatIndex = 0;

  for (const line of visualObj.lines || []) {
    for (const st of line.staff || []) {
      const topLineEl = topLineEls[flatIndex];
      const voice = voices[flatIndex];
      flatIndex += 1;
      if (!topLineEl) continue;

      const group = topLineEl.parentElement;
      const linePaths = group ? [...group.querySelectorAll("path")] : [topLineEl];
      const ys = linePaths.map((p) => p.getBBox().y);
      const topY = Math.min(...ys);
      const bottomY = Math.max(...ys);
      const spacing = ys.length > 1 ? (bottomY - topY) / (ys.length - 1) : 12;
      const staffHeight = spacing * 4;
      const tolerance = spacing * 3;
      if (pt.y < topY - tolerance || pt.y > topY + staffHeight + tolerance) continue;

      const elements = ((st.voices && st.voices[0]) || []).filter((e) => e.abselem && typeof e.abselem.x === "number");
      let best = null;
      let bestDist = Infinity;
      for (const el of elements) {
        const dist = Math.abs(el.abselem.x - pt.x);
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      }
      const voiceId = voice ? voice.id : String(flatIndex);
      if (best && best.el_type === "note" && bestDist < spacing * 1.5) {
        return { kind: "note", voiceId, startChar: best.startChar, endChar: best.endChar, abselem: best.abselem };
      }

      let anchor = null;
      for (const el of elements) {
        if (el.abselem.x <= pt.x) anchor = el;
        else break;
      }
      const insertAt = anchor ? anchor.endChar : elements[0] ? elements[0].startChar : null;
      return { kind: "staff", voiceId, insertAt };
    }
  }
  return null;
}

// Apply `transformToken(token)` to every selected note/rest, right-to-left so
// earlier offsets stay valid while later ones are being edited.
function applyToSelection(transformToken) {
  if (noteSelection.length === 0) return;
  const ranges = [...noteSelection].sort((a, b) => b.start - a.start);
  let abc = currentAbc;
  ranges.forEach((r) => {
    const token = abc.slice(r.start, r.end);
    abc = abc.slice(0, r.start) + transformToken(token) + abc.slice(r.end);
  });
  setAbc(abc);
}

function setTokenDuration(token, durationSuffix) {
  const m = token.match(/^(\(\d+)?(\^{1,2}|_{1,2}|=)?([A-Ga-gxXzZ])([,']*)(.*)$/);
  if (!m) return token;
  const [, tuplet = "", accidental = "", letter, octave = ""] = m;
  return `${tuplet}${accidental}${letter}${octave}${durationSuffix}`;
}

function scaleTokenDuration(token, factor) {
  const m = token.match(/^(\(\d+)?(\^{1,2}|_{1,2}|=)?([A-Ga-gxXzZ])([,']*)(\d*\/?\d*)$/);
  if (!m) return token;
  const [, tuplet = "", accidental = "", letter, octave = "", durSuffix] = m;
  const units = parseAbcDurationUnits(durSuffix);
  if (units === null) return token;
  return `${tuplet}${accidental}${letter}${octave}${unitsToAbcDurationSuffix(units * factor)}`;
}

const ACCIDENTAL_ORDER = ["__", "_", "", "^", "^^"];

function shiftTokenAccidental(token, direction) {
  const m = token.match(/^(\(\d+)?(\^{1,2}|_{1,2}|=)?([A-Ga-gxXzZ])(.*)$/);
  if (!m) return token;
  const [, tuplet = "", accidental = "", letter, rest] = m;
  if (letter.toLowerCase() === "z" || letter.toLowerCase() === "x") return token; // rests have no pitch
  const normalized = accidental === "=" ? "" : accidental;
  let idx = ACCIDENTAL_ORDER.indexOf(normalized);
  if (idx === -1) idx = 2;
  idx = Math.min(ACCIDENTAL_ORDER.length - 1, Math.max(0, idx + direction));
  return `${tuplet}${ACCIDENTAL_ORDER[idx]}${letter}${rest}`;
}

function addFermata(token) {
  return `!fermata!${token}`;
}

// Notes become a same-duration rest (keeps the bar's total length correct);
// rests just vanish entirely.
function tokenToRestOrEmpty(token) {
  const m = token.match(/^(\(\d+)?(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(.*)$/);
  if (!m) return "";
  const [, tuplet = "", , , , durSuffix = ""] = m;
  return `${tuplet}z${durSuffix}`;
}

function deleteNoteSelection() {
  applyToSelection(tokenToRestOrEmpty);
}

function tieSelectedWithNext() {
  if (noteSelection.length !== 1) return;
  const r = noteSelection[0];
  setAbc(currentAbc.slice(0, r.end) + "-" + currentAbc.slice(r.end));
}

const DURATION_CHOICES = [
  { duration: "8", label: "Redonda" },
  { duration: "4", label: "Blanca" },
  { duration: "2", label: "Negra" },
  { duration: "", label: "Corchea" },
  { duration: "/2", label: "Semicorchea" },
  { duration: "/4", label: "Fusa" },
];

function buildNoteContextMenu(x, y) {
  const count = noteSelection.length;
  const suffix = count > 1 ? ` (${count})` : "";
  return [
    {
      label: `Cambiar figura${suffix} ▸`,
      onClick: () =>
        showContextMenu(
          x,
          y,
          DURATION_CHOICES.map((d) => ({
            label: d.label,
            onClick: () => applyToSelection((token) => setTokenDuration(token, d.duration)),
          }))
        ),
    },
    { label: `Añadir puntillo${suffix}`, onClick: () => applyToSelection((token) => scaleTokenDuration(token, 1.5)) },
    { label: `Quitar puntillo${suffix}`, onClick: () => applyToSelection((token) => scaleTokenDuration(token, 2 / 3)) },
    { separator: true },
    { label: `Subir semitono${suffix}`, onClick: () => applyToSelection((token) => shiftTokenAccidental(token, 1)) },
    { label: `Bajar semitono${suffix}`, onClick: () => applyToSelection((token) => shiftTokenAccidental(token, -1)) },
    ...(count === 1 ? [{ label: "Ligar con la siguiente nota", onClick: tieSelectedWithNext }] : []),
    { label: `Añadir calderón${suffix}`, onClick: () => applyToSelection(addFermata) },
    { separator: true },
    { label: `Borrar${suffix}`, danger: true, onClick: deleteNoteSelection },
  ];
}

function buildStaffContextMenu(hit, x, y) {
  const { voices } = parseAbcHeaders(currentAbc);
  const voice = voices.find((v) => v.id === hit.voiceId);
  const voiceLabel = voice && voice.name ? voice.name : `Voz ${hit.voiceId}`;

  return [
    { label: "Añadir nota aquí", onClick: () => insertPaletteItem(hit.insertAt, "note", "", 6) },
    { label: "Añadir silencio aquí", onClick: () => insertPaletteItem(hit.insertAt, "rest", "", null) },
    { separator: true },
    {
      label: "Añadir armadura ▸",
      onClick: () =>
        showContextMenu(
          x,
          y,
          KEY_OPTIONS.map((k) => ({
            label: keyLabel(k),
            onClick: () => applyValueAtPosition("K", k, { insertAt: hit.insertAt }),
          }))
        ),
    },
    {
      label: "Cambiar compás ▸",
      onClick: () =>
        showContextMenu(
          x,
          y,
          TIME_OPTIONS.map((t) => ({ label: t, onClick: () => applyQuickValue("M", t) }))
        ),
    },
    {
      label: "Añadir texto",
      onClick: () => {
        const text = window.prompt("Texto a añadir sobre el pentagrama:");
        if (!text) return;
        const token = `"^${text.replace(/"/g, "'")}" `;
        setAbc(currentAbc.slice(0, hit.insertAt) + token + currentAbc.slice(hit.insertAt));
      },
    },
    { separator: true },
    {
      label: `Eliminar pentagrama "${voiceLabel}"`,
      danger: true,
      onClick: () => {
        if (window.confirm(`¿Eliminar el pentagrama "${voiceLabel}"? Esta acción no se puede deshacer.`)) {
          removeVoice(hit.voiceId);
        }
      },
    },
  ];
}

scoreContainer.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const hit = findScoreHit(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.kind === "note") {
    if (!noteSelection.some((n) => n.start === hit.startChar && n.end === hit.endChar)) {
      selectNoteRange(hit.startChar, hit.endChar, hit.abselem, false);
    }
    showContextMenu(e.clientX, e.clientY, buildNoteContextMenu(e.clientX, e.clientY));
  } else {
    showContextMenu(e.clientX, e.clientY, buildStaffContextMenu(hit, e.clientX, e.clientY));
  }
});

// A left click that doesn't land on a selectable note/rest deselects, same as
// clicking empty space in any other editor.
scoreContainer.addEventListener("click", (e) => {
  if (!e.target.closest("[data-index]")) clearNoteSelectionState();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideContextMenu();
    clearNoteSelectionState();
    return;
  }
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
  if (noteSelection.length === 0) return;
  e.preventDefault();
  deleteNoteSelection();
});

function updateScoreTitleFromAbc() {
  const { headers } = parseAbcHeaders(currentAbc);
  scoreTitle.textContent = headers.T || (currentAbc.trim() ? "Partitura sin título" : "Sin partitura");
}

function updateToolbarEnabled() {
  const enabled = !!currentAbc.trim();
  document
    .querySelectorAll(".note-toolbar button, .note-toolbar select, .note-toolbar input")
    .forEach((el) => (el.disabled = !enabled));
  addVoiceBtn.disabled = !enabled;
  propKeySelect.disabled = !enabled;
  propTimeSelect.disabled = !enabled;
  propTempoInput.disabled = !enabled;
  scoreActions.hidden = !enabled;
}

// ===================== Properties panel =====================

function populateSelectOnce(select, options, labelFn) {
  if (select.dataset.populated) return;
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = labelFn ? labelFn(opt) : opt;
    select.appendChild(o);
  }
  select.dataset.populated = "1";
}

function ensureOptionExists(select, value, labelFn) {
  if (![...select.options].some((o) => o.value === value)) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = labelFn ? labelFn(value) : value;
    select.appendChild(o);
  }
}

// Re-label everything that shows note names when the naming style changes.
function refreshNoteNaming() {
  [...propKeySelect.options].forEach((o) => (o.textContent = keyLabel(o.value)));
  document.querySelectorAll("#key-chips .chip").forEach((chip) => {
    chip.textContent = keyLabel(chip.dataset.value);
  });
}

function syncPropertiesPanel() {
  const { headers, voices } = parseAbcHeaders(currentAbc);

  populateSelectOnce(propKeySelect, KEY_OPTIONS, keyLabel);
  populateSelectOnce(propTimeSelect, TIME_OPTIONS);
  ensureOptionExists(propKeySelect, headers.K, keyLabel);
  ensureOptionExists(propTimeSelect, headers.M);
  propKeySelect.value = headers.K;
  propTimeSelect.value = headers.M;

  const tempoMatch = headers.Q.match(/=(\d+)/);
  propTempoInput.value = tempoMatch ? tempoMatch[1] : "";

  const CLEF_LABELS = {
    treble: "Clave de sol",
    bass: "Clave de fa",
    alto: "Clave de do (alto)",
    tenor: "Clave de do (tenor)",
  };

  voiceListEl.innerHTML = "";
  voices.forEach((voice) => {
    const row = document.createElement("div");
    row.className = "voice-row";
    row.dataset.voiceId = voice.id;

    const top = document.createElement("div");
    top.className = "voice-row-top";

    const handle = document.createElement("span");
    handle.className = "voice-drag-handle";
    handle.textContent = "⠿";
    handle.title = "Arrastra para reordenar los pentagramas";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = voice.name;
    nameInput.placeholder = `Voz ${voice.id}`;
    nameInput.style.flex = "1";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className = "remove-voice-btn";
    removeBtn.title = "Eliminar pentagrama";

    top.appendChild(handle);
    top.appendChild(nameInput);
    top.appendChild(removeBtn);

    const bottom = document.createElement("div");
    bottom.className = "voice-row-bottom";

    const clefSelect = document.createElement("select");
    Object.entries(CLEF_LABELS).forEach(([value, label]) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      if (value === voice.clef) o.selected = true;
      clefSelect.appendChild(o);
    });

    const instrumentSelect = document.createElement("select");
    INSTRUMENTS.forEach((inst) => {
      const o = document.createElement("option");
      o.value = inst.value;
      o.textContent = inst.label;
      if (inst.value === (voice.program || "")) o.selected = true;
      instrumentSelect.appendChild(o);
    });

    bottom.appendChild(clefSelect);
    bottom.appendChild(instrumentSelect);

    const onVoiceEdit = () => {
      setAbc(
        updateVoiceHeader(currentAbc, voice.id, {
          clef: clefSelect.value,
          name: nameInput.value.trim(),
          program: instrumentSelect.value,
        })
      );
    };
    clefSelect.addEventListener("change", onVoiceEdit);
    instrumentSelect.addEventListener("change", onVoiceEdit);
    nameInput.addEventListener("change", onVoiceEdit);
    removeBtn.addEventListener("click", () => removeVoice(voice.id));

    handle.addEventListener("mousedown", (e) => {
      row.classList.add("drag-source");
      const clearSourceStyle = () => {
        row.classList.remove("drag-source");
        document.removeEventListener("mouseup", clearSourceStyle);
      };
      document.addEventListener("mouseup", clearSourceStyle);

      startCustomDrag(e, {
        label: `⠿ ${nameInput.value || `Voz ${voice.id}`}`,
        dropSelector: ".voice-row",
        onDrop: (dropZone, x, y) => {
          const targetId = dropZone.dataset.voiceId;
          if (!targetId || targetId === voice.id) return;
          const rect = dropZone.getBoundingClientRect();
          const placeAfter = y > rect.top + rect.height / 2;
          setAbc(reorderVoice(currentAbc, voice.id, targetId, placeAfter));
        },
      });
    });

    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        ...Object.entries(CLEF_LABELS).map(([value, label]) => ({
          label: `Cambiar a ${label.toLowerCase()}`,
          onClick: () => setAbc(updateVoiceHeader(currentAbc, voice.id, { clef: value, name: voice.name, program: voice.program })),
        })),
        { separator: true },
        { label: "Mover arriba", onClick: () => moveVoice(voice.id, -1) },
        { label: "Mover abajo", onClick: () => moveVoice(voice.id, 1) },
        { separator: true },
        { label: "Eliminar pentagrama", danger: true, onClick: () => removeVoice(voice.id) },
      ]);
    });

    row.appendChild(top);
    row.appendChild(bottom);
    voiceListEl.appendChild(row);
  });
}

propKeySelect.addEventListener("change", () => setAbc(replaceHeaderLine(currentAbc, "K", propKeySelect.value)));
propTimeSelect.addEventListener("change", () => setAbc(replaceHeaderLine(currentAbc, "M", propTimeSelect.value)));
propTempoInput.addEventListener("change", () => {
  const bpm = parseInt(propTempoInput.value, 10) || 120;
  setAbc(replaceHeaderLine(currentAbc, "Q", `1/4=${bpm}`));
});
addVoiceBtn.addEventListener("click", addVoice);

// ===================== Core state setter =====================

// A blank line inside ABC ends the current tune (it's the tune separator in a
// multi-tune file). We only ever hold one tune, so any blank line introduced
// by a programmatic edit (adding/reordering voices, an AI reply...) would
// make abcjs silently drop everything after it - strip them defensively.
function stripBlankLines(abc) {
  return abc
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");
}

function setAbc(newAbc) {
  // Any text edit invalidates the selected notes' char offsets (and the
  // re-render below replaces their abcjs elements outright), so drop the
  // selection rather than let it point at the wrong text or a dead element.
  noteSelection = [];
  currentAbc = stripBlankLines(newAbc);
  abcTextarea.value = currentAbc;
  renderScore();
  syncPropertiesPanel();
  updateScoreTitleFromAbc();
  updateToolbarEnabled();
}

// ===================== Note editor toolbar =====================

function trackCursor() {
  cursorPos = abcTextarea.selectionStart;
}
abcTextarea.addEventListener("keyup", trackCursor);
abcTextarea.addEventListener("click", trackCursor);
abcTextarea.addEventListener("focus", trackCursor);

abcTextarea.addEventListener("input", () => {
  currentAbc = abcTextarea.value;
  cursorPos = abcTextarea.selectionStart;
  renderScore();
  syncPropertiesPanel();
  updateScoreTitleFromAbc();
  updateToolbarEnabled();
});

function insertAtCursor(text) {
  const before = currentAbc.slice(0, cursorPos);
  const after = currentAbc.slice(cursorPos);
  cursorPos = before.length + text.length;
  setAbc(before + text + after);
  if (!panelEl("panel-source").hidden) {
    abcTextarea.focus();
    abcTextarea.setSelectionRange(cursorPos, cursorPos);
  }
}

// Duration/rest palette: drag onto the score to place a note/rest exactly
// where dropped (pitch = vertical position, time = horizontal position);
// a plain click instead inserts at the text cursor with a neutral pitch (B)
// that you can then drag up/down on the score to fix.
function setupNotePalette() {
  document.querySelectorAll(".palette-chip").forEach((btn) => {
    const kind = btn.dataset.kind;
    const duration = btn.dataset.duration;
    btn.addEventListener("mousedown", (e) => {
      if (btn.disabled) return;
      startCustomDrag(e, {
        label: btn.textContent,
        // dropSelector already restricts to .drop-target (the sheet and the
        // score itself), so any match here is a valid place to drop a note -
        // including the sheet's white margin around a short/empty score.
        onMoveOver: (dropZone, x, y) => {
          const result = computeDropInsertion(x, y);
          if (!result) {
            hideNotePreview();
            return;
          }
          showNotePreviewAt(result, kind === "rest" ? "Silencio" : null);
        },
        onMoveLeave: hideNotePreview,
        onDrop: (dropZone, x, y) => {
          const result = computeDropInsertion(x, y);
          if (!result) return;
          insertPaletteItem(result.insertAt, kind, duration, result.pitchAbsolute);
        },
        // Neutral pitch (B) that you can then drag up/down on the score to
        // fix - goes through the same measure-fill logic as a drop so a
        // click-inserted note also respects/closes the current bar.
        onClick: () => insertPaletteItem(cursorPos, kind, duration, 6),
      });
    });
  });
}
setupNotePalette();

// Quick-value chips for key/meter/tempo: drag onto the score to apply, or
// just click.
// `onDropAtPosition`, when given, lets a chip be dropped directly onto a
// staff: e.g. a key signature dropped on a specific pentagram only changes
// that voice (and only from that point onward), instead of the whole score.
// Dropped anywhere else in the drop zone, it falls back to the global change.
function buildChips(container, values, onApply, labelFn, onDropAtPosition) {
  container.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.value = String(value);
    chip.textContent = labelFn ? labelFn(value) : String(value);
    chip.addEventListener("mousedown", (e) => {
      startCustomDrag(e, {
        label: chip.textContent,
        onMoveOver: onDropAtPosition
          ? (dropZone, x, y) => {
              const result = computeDropInsertion(x, y);
              if (result) showNotePreviewAt(result, chip.textContent);
              else hideNotePreview();
            }
          : undefined,
        onMoveLeave: onDropAtPosition ? hideNotePreview : undefined,
        onDrop: (dropZone, x, y) => {
          const result = onDropAtPosition ? computeDropInsertion(x, y) : null;
          if (result) onDropAtPosition(value, result);
          else onApply(value);
        },
        onClick: () => onApply(value),
      });
    });
    container.appendChild(chip);
  });
}

function applyValueAtPosition(field, value, dropResult) {
  const token = `[${field}:${value}] `;
  setAbc(currentAbc.slice(0, dropResult.insertAt) + token + currentAbc.slice(dropResult.insertAt));
}

function applyQuickValue(field, value) {
  if (!currentAbc.trim()) return;
  setAbc(replaceHeaderLine(currentAbc, field, value));
}

function initChips() {
  buildChips(
    document.getElementById("key-chips"),
    QUICK_KEYS,
    (v) => applyQuickValue("K", v),
    keyLabel,
    (v, dropResult) => applyValueAtPosition("K", v, dropResult)
  );
  buildChips(document.getElementById("time-chips"), QUICK_TIMES, (v) => applyQuickValue("M", v));
  buildChips(document.getElementById("tempo-chips"), QUICK_TEMPOS, (v) => applyQuickValue("Q", `1/4=${v}`));
}
initChips();

barlineBtn.addEventListener("click", () => insertAtCursor("| "));
repeatStartBtn.addEventListener("click", () => insertAtCursor("|: "));
repeatEndBtn.addEventListener("click", () => insertAtCursor(":| "));

// ===================== Compose (initial generation) =====================

async function compose() {
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) {
    setStatus("Escribe una descripción de la pieza.", true);
    return;
  }

  const payload = {
    prompt,
    instrument: document.getElementById("instrument").value || null,
    key: document.getElementById("gen-key").value.trim() || null,
    time_signature: document.getElementById("gen-time").value.trim() || null,
    tempo: document.getElementById("gen-tempo").value ? Number(document.getElementById("gen-tempo").value) : null,
  };

  composeBtn.disabled = true;
  setStatus("Componiendo con IA... esto puede tardar unos segundos.");

  try {
    const res = await authFetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error desconocido");

    currentScoreId = null;
    setAbc(data.abc);
    setStatus("¡Listo!");
    openPanel("panel-notes");
    addChatMessage("system", "Nueva pieza generada. Edítala con los paneles del lateral o pídeme cambios aquí.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, true);
  } finally {
    composeBtn.disabled = false;
  }
}

composeBtn.addEventListener("click", compose);

// Start a blank score with no AI call at all: just valid, empty ABC using
// whatever key/meter/tempo/instrument the user already set on the left,
// falling back to sensible defaults.
function startBlank() {
  const key = document.getElementById("gen-key").value.trim() || "C";
  const meter = document.getElementById("gen-time").value.trim() || "4/4";
  const tempo = document.getElementById("gen-tempo").value ? Number(document.getElementById("gen-tempo").value) : 120;
  const instrument = document.getElementById("instrument").value;
  const label = instrument ? instrument.charAt(0).toUpperCase() + instrument.slice(1) : "Voz 1";

  const headers = { M: meter, L: "1/8", Q: `1/4=${tempo}`, K: key };
  const restToken = restsForMeasure(headers);

  const abc = [
    "X:1",
    "T:Nueva partitura",
    `M:${meter}`,
    "L:1/8",
    `Q:1/4=${tempo}`,
    `K:${key}`,
    `V:1 clef=treble name="${label}"`,
    `${restToken} |`,
  ].join("\n");

  currentScoreId = null;
  setAbc(abc);
  setStatus("Partitura en blanco lista para editar.");
  openPanel("panel-notes");
  addChatMessage("system", "Partitura en blanco creada, sin IA. Arrastra notas desde el panel de notas, o pídeme ayuda cuando quieras.");
}

blankBtn.addEventListener("click", startBlank);

// ===================== Downloads (server-side export on demand) =====================

async function renderCurrentAbc() {
  const res = await authFetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abc: currentAbc }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error desconocido");
  return data;
}

document.getElementById("download-musicxml").addEventListener("click", async () => {
  try {
    const data = await renderCurrentAbc();
    downloadText("partitura.musicxml", data.musicxml, "application/vnd.recordare.musicxml+xml");
  } catch (err) {
    setStatus(`Error al exportar: ${err.message}`, true);
  }
});

document.getElementById("download-midi").addEventListener("click", async () => {
  try {
    const data = await renderCurrentAbc();
    const url = base64ToBlobUrl(data.midi_base64, "audio/midi");
    const a = document.createElement("a");
    a.href = url;
    a.download = "partitura.mid";
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(`Error al exportar: ${err.message}`, true);
  }
});

// ===================== Saved scores (library, shared with the org) =======

function formatScoreDate(iso) {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildScoreRow(score, onChanged) {
  const row = document.createElement("div");
  row.className = "org-row";

  const left = document.createElement("span");
  left.className = "org-row-name";
  left.textContent = score.title;
  row.appendChild(left);

  const meta = document.createElement("span");
  meta.className = "org-row-meta";
  meta.textContent = `${score.created_by_username || "?"} · ${formatScoreDate(score.updated_at)}`;
  row.appendChild(meta);

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "org-row-edit";
  openBtn.textContent = "Abrir";
  openBtn.title = "Abrir esta partitura (reemplaza la actual)";
  openBtn.addEventListener("click", async () => {
    try {
      const data = await parseAuthResponse(await authFetch(`/api/scores/${score.id}`));
      currentScoreId = data.id;
      setAbc(data.abc);
      setStatus(`Partitura "${data.title}" abierta.`);
      closePanel("panel-library");
    } catch (err) {
      setStatus(`Error al abrir la partitura: ${err.message}`, true);
    }
  });
  row.appendChild(openBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "org-row-delete";
  deleteBtn.textContent = "🗑";
  deleteBtn.title = "Eliminar esta partitura";
  deleteBtn.addEventListener("click", async () => {
    if (!window.confirm(`¿Eliminar "${score.title}"? Esta acción no se puede deshacer.`)) return;
    try {
      await authFetch(`/api/scores/${score.id}`, { method: "DELETE" });
      if (currentScoreId === score.id) currentScoreId = null;
      onChanged();
    } catch (err) {
      setStatus(`Error al eliminar: ${err.message}`, true);
    }
  });
  row.appendChild(deleteBtn);

  return row;
}

async function loadScoreLibrary() {
  const listEl = document.getElementById("library-list");
  listEl.textContent = "Cargando...";
  try {
    const scoreList = await parseAuthResponse(await authFetch("/api/scores"));
    listEl.innerHTML = "";
    if (scoreList.length === 0) {
      listEl.textContent = "Todavía no hay partituras guardadas.";
      return;
    }
    scoreList.forEach((s) => listEl.appendChild(buildScoreRow(s, loadScoreLibrary)));
  } catch (err) {
    listEl.textContent = `Error: ${err.message}`;
  }
}

// Refresh the list every time the rail icon is used - harmless when it's
// actually closing the panel, and means it's never stale when opened
// (another org member may have saved/deleted something meanwhile).
document.querySelector('[data-panel="panel-library"]').addEventListener("click", loadScoreLibrary);

document.getElementById("save-score-btn").addEventListener("click", async () => {
  if (!currentAbc.trim()) return;
  const { headers } = parseAbcHeaders(currentAbc);
  const title = (headers.T || "").trim() || "Sin título";
  try {
    const data = await parseAuthResponse(
      await authFetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, abc: currentAbc, score_id: currentScoreId }),
      })
    );
    currentScoreId = data.id;
    setStatus(`Guardada "${data.title}".`);
  } catch (err) {
    setStatus(`Error al guardar: ${err.message}`, true);
  }
});

// ===================== Chat with AI =====================

function addChatMessage(role, text) {
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.textContent = text;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (!currentAbc.trim()) {
    setChatStatus("Primero compón una pieza en el panel de la izquierda.", true);
    return;
  }

  addChatMessage("user", text);
  chatInput.value = "";
  chatSendBtn.disabled = true;
  setChatStatus("Pensando...");

  try {
    const res = await authFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abc: currentAbc, message: text, history: chatHistory.slice(-20) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error desconocido");

    addChatMessage("assistant", data.reply);
    chatHistory.push({ role: "user", content: text });
    chatHistory.push({ role: "assistant", content: data.reply });

    if (data.abc) {
      setAbc(data.abc);
    }
    setChatStatus("");
  } catch (err) {
    console.error(err);
    addChatMessage("system", `Error: ${err.message}`);
    setChatStatus("");
  } finally {
    chatSendBtn.disabled = false;
  }
}

chatSendBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// ===================== Auth (login gate + role-based UI) =================
//
// There is no public sign-up: an app_admin creates organizations from the
// admin console, and a director/admin creates the users of their own
// organization from the "Organización" panel. The composer itself
// (compose/chat/render) requires a valid session - the backend checks the
// same JWT the auth service issues.

const AUTH_STORAGE_KEY = "partis.auth";
const ROLE_LABELS = { app_admin: "administrador de la app", director: "director", admin: "admin. de organización", musico: "músico" };

const authGateEl = document.getElementById("auth-gate");
const authIndicatorEl = document.getElementById("auth-indicator");
const authUserLabelEl = document.getElementById("auth-user-label");
const logoutBtn = document.getElementById("logout-btn");
const loginForm = document.getElementById("auth-login-form");
const loginStatusEl = document.getElementById("login-status");
const orgPickerEl = document.getElementById("auth-org-picker");
const orgChoicesEl = document.getElementById("auth-org-choices");

const adminConsoleEl = document.getElementById("admin-console");
const railOrgBtn = document.getElementById("rail-org-btn");

let authState = null; // { token, tenantId, userId, username, role }

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuthState(state) {
  authState = state;
  try {
    if (state) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode...): session just won't survive a reload */
  }
}

function setAuthFormStatus(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function setComposerVisible(visible) {
  document.querySelector(".topbar").hidden = !visible;
  document.querySelector(".workspace").hidden = !visible;
  document.querySelector(".transport").hidden = !visible;
}

function showAuthGate() {
  authGateEl.hidden = false;
  authIndicatorEl.hidden = true;
  adminConsoleEl.hidden = true;
  setComposerVisible(false);
  hideOrgPicker();
}

// Shows the right shell for the signed-in user's role: the app-admin console
// (organizations only, no music), or the composer (with an extra
// "Organización" panel for a director/admin to manage their own users).
function applyRoleUI() {
  authGateEl.hidden = true;
  authIndicatorEl.hidden = false;
  authUserLabelEl.textContent = authState ? `${authState.username} (${ROLE_LABELS[authState.role] || authState.role})` : "";

  const isAppAdmin = authState && authState.role === "app_admin";
  const isOrgManager = authState && (authState.role === "director" || authState.role === "admin");

  adminConsoleEl.hidden = !isAppAdmin;
  setComposerVisible(!isAppAdmin);
  railOrgBtn.hidden = !isOrgManager;
  // A panel left open from a previous session (director/admin) must not
  // leak into a different account signing in on the same browser.
  if (!isOrgManager) closePanel("panel-org");

  if (isAppAdmin) {
    document.getElementById("admin-user-label").textContent = authState.username;
    loadOrganizations();
  } else if (isOrgManager) {
    const adminOption = document.querySelector('#new-user-role option[value="admin"]');
    if (adminOption) adminOption.hidden = authState.role !== "director";
    loadOwnOrganization();
    loadOrgUsers();
  }
}

function signOut() {
  saveAuthState(null);
  showAuthGate();
}

logoutBtn.addEventListener("click", signOut);
document.getElementById("admin-logout-btn").addEventListener("click", signOut);

// Attaches the bearer token to a fetch call, and signs the user out if the
// backend rejects it - the backend and the auth service share one JWT
// secret, so a 401 here always means "log in again".
async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authState && authState.token) headers.Authorization = `Bearer ${authState.token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && authState) {
    signOut();
    setStatus("Tu sesión ha caducado. Inicia sesión de nuevo.", true);
  }
  return res;
}

async function parseAuthResponse(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error desconocido");
  return data;
}

// Login is asked for no organization up front. If the username/password
// matches accounts in more than one organization (the same person can
// belong to several), the backend replies with a list instead of a token -
// hideOrgPicker()/showOrgPicker() switch the form for that list, and the
// chosen organization is what makes the follow-up call unambiguous.
function hideOrgPicker() {
  orgPickerEl.hidden = true;
  loginForm.hidden = false;
}

function showOrgPicker(username, password, organizations) {
  loginForm.hidden = true;
  orgPickerEl.hidden = false;
  orgChoicesEl.innerHTML = "";
  organizations.forEach((org) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "org-row org-row-btn";
    const label = document.createElement("span");
    label.className = "org-row-name";
    label.textContent = org.name;
    btn.appendChild(label);
    btn.addEventListener("click", () => attemptLogin(username, password, org.tenant_slug));
    orgChoicesEl.appendChild(btn);
  });
}

document.getElementById("auth-org-picker-back").addEventListener("click", hideOrgPicker);

async function attemptLogin(username, password, tenantSlug) {
  setAuthFormStatus(loginStatusEl, "Entrando...");
  try {
    const data = await parseAuthResponse(
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, tenant_slug: tenantSlug || null }),
      })
    );
    if (data.requires_organization) {
      setAuthFormStatus(loginStatusEl, "");
      showOrgPicker(username, password, data.organizations);
      return;
    }
    saveAuthState({ token: data.access_token, tenantId: data.tenant_id, userId: data.user_id, username, role: data.role });
    loginForm.reset();
    hideOrgPicker();
    setAuthFormStatus(loginStatusEl, "");
    applyRoleUI();
  } catch (err) {
    setAuthFormStatus(loginStatusEl, err.message, true);
  }
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  attemptLogin(username, password, null);
});

// Checks any stored session against the auth service before trusting it -
// tokens expire, and the JWT secret can change (e.g. a fresh install).
async function initAuth() {
  const stored = loadAuthState();
  if (!stored || !stored.token) {
    showAuthGate();
    return;
  }
  authState = stored;
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored.token}` } });
    if (!res.ok) throw new Error("invalid session");
    applyRoleUI();
  } catch {
    saveAuthState(null);
    showAuthGate();
  }
}

// ---------------------------------------------------------------------------
// App-admin console: create/list organizations.
// ---------------------------------------------------------------------------

function buildOrgRow(primaryText, secondaryText, roleText) {
  const row = document.createElement("div");
  row.className = "org-row";
  const left = document.createElement("span");
  left.className = "org-row-name";
  left.textContent = primaryText;
  row.appendChild(left);
  if (roleText) {
    const role = document.createElement("span");
    role.className = "org-row-role";
    role.textContent = roleText;
    row.appendChild(role);
  }
  const right = document.createElement("span");
  right.className = "org-row-meta";
  right.textContent = secondaryText;
  row.appendChild(right);
  return row;
}

// An editable row: shows name + slug + a ✎ button that swaps the row for a
// rename form (PATCH /admin/organizations/{id}), then swaps back.
// One organization: an editable row (name/slug/rename) plus a collapsible
// panel underneath listing its users, with create/edit/delete - all as the
// app_admin, for any organization (not just one they belong to).
function buildOrgItem(org) {
  const item = document.createElement("div");
  item.className = "org-item";

  const row = document.createElement("div");
  const usersPanel = document.createElement("div");
  usersPanel.className = "org-users-panel";
  usersPanel.hidden = true;
  let usersLoaded = false;

  function renderView() {
    row.className = "org-row";
    row.innerHTML = "";
    const left = document.createElement("span");
    left.className = "org-row-name";
    left.textContent = org.name;
    row.appendChild(left);
    const meta = document.createElement("span");
    meta.className = "org-row-meta";
    meta.textContent = org.slug;
    row.appendChild(meta);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "org-toggle";
    toggleBtn.textContent = usersPanel.hidden ? "▸ Usuarios" : "▾ Usuarios";
    toggleBtn.addEventListener("click", () => {
      usersPanel.hidden = !usersPanel.hidden;
      if (!usersPanel.hidden && !usersLoaded) {
        usersLoaded = true;
        loadAdminOrgUsers(org, usersPanel);
      }
      renderView();
    });
    row.appendChild(toggleBtn);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "org-row-edit";
    editBtn.textContent = "✎";
    editBtn.title = "Editar nombre";
    editBtn.addEventListener("click", renderEdit);
    row.appendChild(editBtn);
  }

  function renderEdit() {
    row.className = "org-row org-row-edit-form";
    row.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.value = org.name;
    row.appendChild(input);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Guardar";
    saveBtn.addEventListener("click", async () => {
      const newName = input.value.trim();
      if (!newName || newName === org.name) {
        renderView();
        return;
      }
      try {
        const updated = await parseAuthResponse(
          await authFetch(`/api/auth/admin/organizations/${org.tenant_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName }),
          })
        );
        org.name = updated.name;
      } catch (err) {
        setStatus(`Error al renombrar la organización: ${err.message}`, true);
      }
      renderView();
    });
    row.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", renderView);
    row.appendChild(cancelBtn);

    input.focus();
  }

  renderView();
  item.appendChild(row);
  item.appendChild(usersPanel);
  return item;
}

const ORG_USER_ROLE_LABELS = { director: "Director", admin: "Administrador", musico: "Músico" };

function buildAdminUserRow(tenantId, u, onChanged) {
  const row = document.createElement("div");

  function renderView() {
    row.className = "org-row";
    row.innerHTML = "";
    const left = document.createElement("span");
    left.className = "org-row-name";
    left.textContent = u.username;
    row.appendChild(left);
    const role = document.createElement("span");
    role.className = "org-row-role";
    role.textContent = ORG_USER_ROLE_LABELS[u.role] || u.role;
    row.appendChild(role);
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "org-row-edit";
    editBtn.textContent = "✎";
    editBtn.title = "Editar usuario";
    editBtn.addEventListener("click", renderEdit);
    row.appendChild(editBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "org-row-delete";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Eliminar usuario";
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm(`¿Eliminar a "${u.username}"? Esta acción no se puede deshacer.`)) return;
      try {
        await authFetch(`/api/auth/admin/users/${u.user_id}`, { method: "DELETE" });
        onChanged();
      } catch (err) {
        setStatus(`Error al eliminar: ${err.message}`, true);
      }
    });
    row.appendChild(deleteBtn);
  }

  // Three fields plus two buttons doesn't fit on one line at this panel's
  // width - stack it instead of squeezing everything into the single-line
  // .org-row-edit-form pattern (that one's fine for the org-rename case,
  // which is just one input).
  function renderEdit() {
    row.className = "user-edit-form";
    row.innerHTML = "";

    const usernameInput = document.createElement("input");
    usernameInput.type = "text";
    usernameInput.value = u.username;
    row.appendChild(usernameInput);

    const fieldsRow = document.createElement("div");
    fieldsRow.className = "user-edit-form-row";

    const roleSelect = document.createElement("select");
    ["director", "admin", "musico"].forEach((r) => {
      const o = document.createElement("option");
      o.value = r;
      o.textContent = ORG_USER_ROLE_LABELS[r];
      if (r === u.role) o.selected = true;
      roleSelect.appendChild(o);
    });
    fieldsRow.appendChild(roleSelect);

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "Nueva contraseña (opcional)";
    passwordInput.autocomplete = "new-password";
    fieldsRow.appendChild(passwordInput);
    row.appendChild(fieldsRow);

    const actions = document.createElement("div");
    actions.className = "user-edit-form-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Guardar";
    saveBtn.addEventListener("click", async () => {
      const body = {};
      const newUsername = usernameInput.value.trim();
      if (newUsername && newUsername !== u.username) body.username = newUsername;
      if (roleSelect.value !== u.role) body.role = roleSelect.value;
      if (passwordInput.value) body.password = passwordInput.value;
      if (Object.keys(body).length === 0) {
        renderView();
        return;
      }
      try {
        await parseAuthResponse(
          await authFetch(`/api/auth/admin/users/${u.user_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        );
        onChanged();
      } catch (err) {
        setStatus(`Error al editar el usuario: ${err.message}`, true);
        renderView();
      }
    });
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", renderView);
    actions.appendChild(cancelBtn);

    row.appendChild(actions);
  }

  renderView();
  return row;
}

async function loadAdminOrgUsers(org, panelEl) {
  panelEl.innerHTML = "";

  const form = document.createElement("form");
  form.className = "mini-user-form";
  const usernameInput = document.createElement("input");
  usernameInput.type = "text";
  usernameInput.placeholder = "Usuario o email";
  usernameInput.required = true;
  form.appendChild(usernameInput);
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Contraseña";
  passwordInput.minLength = 8;
  passwordInput.required = true;
  passwordInput.autocomplete = "new-password";
  form.appendChild(passwordInput);
  const roleSelect = document.createElement("select");
  ["musico", "admin", "director"].forEach((r) => {
    const o = document.createElement("option");
    o.value = r;
    o.textContent = ORG_USER_ROLE_LABELS[r];
    roleSelect.appendChild(o);
  });
  form.appendChild(roleSelect);
  const addBtn = document.createElement("button");
  addBtn.type = "submit";
  addBtn.textContent = "+ Añadir";
  form.appendChild(addBtn);
  panelEl.appendChild(form);

  const statusEl = document.createElement("p");
  statusEl.className = "status auth-status";
  panelEl.appendChild(statusEl);

  const listEl = document.createElement("div");
  listEl.className = "org-list";
  panelEl.appendChild(listEl);

  const refresh = () => loadAdminOrgUsers(org, panelEl);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthFormStatus(statusEl, "Creando...");
    try {
      await parseAuthResponse(
        await authFetch(`/api/auth/admin/organizations/${org.tenant_id}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value, role: roleSelect.value }),
        })
      );
      refresh();
    } catch (err) {
      setAuthFormStatus(statusEl, err.message, true);
    }
  });

  try {
    const users = await parseAuthResponse(await authFetch(`/api/auth/admin/organizations/${org.tenant_id}/users`));
    if (users.length === 0) {
      listEl.textContent = "Sin usuarios.";
    } else {
      users.forEach((u) => listEl.appendChild(buildAdminUserRow(org.tenant_id, u, refresh)));
    }
  } catch (err) {
    listEl.textContent = `Error: ${err.message}`;
  }
}

async function loadOrganizations() {
  const listEl = document.getElementById("org-list");
  listEl.textContent = "Cargando...";
  try {
    const orgs = await parseAuthResponse(await authFetch("/api/auth/admin/organizations"));
    listEl.innerHTML = "";
    if (orgs.length === 0) {
      listEl.textContent = "Todavía no hay organizaciones.";
      return;
    }
    orgs.forEach((org) => listEl.appendChild(buildOrgItem(org)));
  } catch (err) {
    listEl.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("create-org-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("org-name").value.trim();
  const directorUsername = document.getElementById("org-director-username").value.trim();
  const directorPassword = document.getElementById("org-director-password").value;
  const statusEl = document.getElementById("create-org-status");
  setAuthFormStatus(statusEl, "Creando...");
  try {
    const data = await parseAuthResponse(
      await authFetch("/api/auth/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, director_username: directorUsername, director_password: directorPassword }),
      })
    );
    setAuthFormStatus(statusEl, `Creada. Identificador para iniciar sesión: "${data.slug}".`);
    document.getElementById("create-org-form").reset();
    loadOrganizations();
  } catch (err) {
    setAuthFormStatus(statusEl, err.message, true);
  }
});

// ---------------------------------------------------------------------------
// "Organización" panel (director/admin): own org info + manage its users.
// ---------------------------------------------------------------------------

async function loadOwnOrganization() {
  const labelEl = document.getElementById("org-slug-label");
  try {
    const data = await parseAuthResponse(await authFetch("/api/auth/org/me"));
    labelEl.textContent = data.slug;
  } catch {
    labelEl.textContent = "—";
  }
}

async function loadOrgUsers() {
  const listEl = document.getElementById("org-user-list");
  listEl.textContent = "Cargando...";
  try {
    const users = await parseAuthResponse(await authFetch("/api/auth/org/users"));
    listEl.innerHTML = "";
    if (users.length === 0) {
      listEl.textContent = "Sin usuarios.";
      return;
    }
    users.forEach((u) => listEl.appendChild(buildOrgRow(u.username, "", ROLE_LABELS[u.role] || u.role)));
  } catch (err) {
    listEl.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("create-org-user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("new-user-username").value.trim();
  const password = document.getElementById("new-user-password").value;
  const role = document.getElementById("new-user-role").value;
  const statusEl = document.getElementById("create-org-user-status");
  setAuthFormStatus(statusEl, "Creando...");
  try {
    await parseAuthResponse(
      await authFetch("/api/auth/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      })
    );
    setAuthFormStatus(statusEl, "Usuario creado.");
    document.getElementById("create-org-user-form").reset();
    loadOrgUsers();
  } catch (err) {
    setAuthFormStatus(statusEl, err.message, true);
  }
});

// ===================== Init =====================

setupLookControls();
setupWorkspaceControls();
setupPanels();

document.getElementById("metronome-toggle").addEventListener("click", () => setMetronome(!metronomeOn));
setMetronome(loadStoredState("partis.metronome", { on: false }).on === true);

updateToolbarEnabled();
updateScoreTitleFromAbc();
refreshNoteNaming();
stageEl.classList.add("is-empty");
initAuth();
