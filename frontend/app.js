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
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const appMenuBtn = document.getElementById("app-menu-btn");

const stageEl = document.getElementById("stage");
const sheetEl = document.getElementById("sheet");
const railEl = document.getElementById("rail");
const viewModeEl = document.getElementById("view-mode");
const zoomLabelEl = document.getElementById("zoom-label");

const propTitleInput = document.getElementById("prop-title");
const propHeaderInput = document.getElementById("prop-header");
const propFooterInput = document.getElementById("prop-footer");
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
  // The ribbon always fills at least the whole width of the stage (the
  // <main>) - a short piece stretches out to it instead of sitting narrow in
  // a lot of empty space. It can still grow past that for a longer piece
  // (abcjs justifies notes to fill whatever width it's given, so it never
  // wraps to a second line in this mode) - the stage just scrolls sideways
  // to it, which is the whole point of "Seguida" as one continuous ribbon.
  const available = Math.max(320, stageEl.clientWidth - 120) / viewState.zoom;
  const needed = Math.max(1, estimateMeasureCount()) * CONTINUOUS_PX_PER_MEASURE;
  return Math.max(available, needed);
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

// abcjs's %%header/%%footer formatting directives (page decoration, only
// drawn when rendering with `print: true` - see computeScoreRenderOptions).
// Read the current text (if any) so the "Encabezado"/"Pie de página" fields
// can be pre-filled, and write it back as a single centered %%directive
// line right after the K: header, or remove the line entirely when cleared.
function getDirectiveValue(abc, name) {
  const m = abc.match(new RegExp(`^%%${name}\\s+"([^"]*)"\\s*$`, "m"));
  return m ? m[1] : "";
}

function setDirectiveValue(abc, name, value) {
  const lines = abc.split("\n").filter((l) => !new RegExp(`^%%${name}\\b`).test(l));
  if (!value.trim()) return lines.join("\n");

  const { keyLineIdx } = parseAbcHeaders(lines.join("\n"));
  const directive = `%%${name} "${value.replace(/"/g, "'")}"`;
  if (keyLineIdx === -1) return `${directive}\n${lines.join("\n")}`;
  lines.splice(keyLineIdx + 1, 0, directive);
  return lines.join("\n");
}

// True if the ABC has a %%header or %%footer directive - abcjs only draws
// those when told this is a "print" render, which also forces the SVG to a
// full page height regardless of content, so it's only worth it in page view.
function hasPageDecoration(abc) {
  return /^%%(header|footer)\b/m.test(abc);
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
  let abc = reorderVoice(currentAbc, voiceId, voices[targetIdx].id, direction > 0);
  // If some voices share a staff (see addVoiceToSameStaff), the "%%score"
  // line - not the V: block order - is what actually controls staff layout,
  // so it has to be re-synced to the new order or "move up/down" would look
  // like it did nothing.
  if (/^%%score\s+/m.test(abc)) {
    const newIds = parseAbcHeaders(abc).voices.map((v) => v.id);
    const groups = parseScoreGroups(abc, newIds);
    groups.forEach((g) => g.sort((a, b) => newIds.indexOf(a) - newIds.indexOf(b)));
    groups.sort((a, b) => newIds.indexOf(a[0]) - newIds.indexOf(b[0]));
    abc = setScoreGroups(abc, groups);
  }
  setAbc(abc);
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
  // Count the stretches between barlines that actually hold something
  // playable: repeat marks ("|:", ":|") and the trailing barline produce empty
  // segments, and inline fields like [K:C] must not read as notes.
  const segments = text
    .replace(/\[[A-Za-z]:[^\]]*\]/g, "")
    .split("|")
    .filter((s) => /[A-Ga-gxXzZ]/.test(s));
  return Math.max(1, segments.length);
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

// abcjs's own startChar/endChar for a note include its trailing whitespace
// up to the next token, and everything here works in that same convention
// (see insertPaletteItem's own text-building) - so a group's span has to
// extend past it too, or landing an insertion right at that boundary would
// glue the new token straight onto the group's last note with no space.
function spanEndPastWhitespace(text, k) {
  let end = k;
  while (end < text.length && /\s/.test(text[end])) end += 1;
  return end;
}

// Every COMPLETE tuplet group's [charAfterMarker, charAfterLastNote) span in
// `text`. ABC counts a group's membership purely by position - the next N
// notes/rests after its "(N" marker, no explicit end marker - never by
// character range, so this has to walk the same way sumMeasureUnits() does
// to know where each group actually ends. A group left incomplete (still
// being placed - see applyTupletMarker/tupletState) never closes here, so it
// can't block insertions right after its own last note so far.
function findTupletSpans(text) {
  const spans = [];
  let k = 0;
  let tupletLeft = 0;
  let groupStart = null;
  while (k < text.length) {
    const ch = text[k];
    if (ch === '"') {
      const end = text.indexOf('"', k + 1);
      if (end === -1) break;
      k = end + 1;
      continue;
    }
    if (ch === "!") {
      const end = text.indexOf("!", k + 1);
      if (end === -1) break;
      k = end + 1;
      continue;
    }
    if (ch === "|") {
      tupletLeft = 0; // a group never crosses a barline
      groupStart = null;
      k += 1;
      continue;
    }
    if (ch === "(" && /\d/.test(text[k + 1] || "")) {
      tupletLeft = parseInt(text[k + 1], 10);
      groupStart = k;
      k += 2;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "-" || ch === ">" || ch === "<") {
      k += 1;
      continue;
    }
    if (ch === "[" && !/^\[[A-Za-z]:/.test(text.slice(k))) {
      const end = text.indexOf("]", k + 1);
      if (end === -1) break;
      const durMatch = text.slice(end + 1).match(/^(\d*\/?\d*)/);
      k = end + 1 + (durMatch ? durMatch[0].length : 0);
      if (tupletLeft > 0 && --tupletLeft === 0) {
        spans.push([groupStart, spanEndPastWhitespace(text, k)]);
        groupStart = null;
      }
      continue;
    }
    const fieldMatch = text.slice(k).match(/^\[[A-Za-z]:[^\]]*\]/);
    if (fieldMatch) {
      k += fieldMatch[0].length;
      continue;
    }
    const noteMatch = text.slice(k).match(/^(\^{1,2}|_{1,2}|=)?[A-Ga-gxXzZ][,']*(\d*\/?\d*)/);
    if (noteMatch) {
      k += noteMatch[0].length;
      if (tupletLeft > 0 && --tupletLeft === 0) {
        spans.push([groupStart, spanEndPastWhitespace(text, k)]);
        groupStart = null;
      }
      continue;
    }
    k += 1;
  }
  return spans;
}

// If `insertAt` falls STRICTLY inside an existing (complete) tuplet group's
// note span, a new note landing there would silently steal one of the
// group's slots and push its real last note out of the group - e.g. "(3C D
// E" gets a note added "before" what looked like the end but is actually
// between D and E, and it silently becomes "(3C D [new]", with E now a
// plain, un-grouped note. This nudges the insertion point to right after the
// whole group instead, so it lands safely outside it. Exactly at either
// boundary (right before the marker, or right after the group's last note)
// isn't "inside" and is left alone.
function pushPastActiveTuplet(text, insertAt) {
  for (const [start, end] of findTupletSpans(text)) {
    if (insertAt > start && insertAt < end) return end;
  }
  return insertAt;
}

// abcjs's own default "p notes in the time of q" ratios (from its tokenizer,
// tripletQ table) for a bare "(p" marker with no explicit ":q:r". A tuplet's
// written notes DON'T reduce their own duration digits - "(3" just means the
// next 3 notes, at their normal written length, together take 2/3 of that -
// so measure-capacity accounting has to apply this ratio too, or it treats a
// triplet as taking MORE room than it really does and closes/splits the bar
// too early.
const TUPLET_TIME_OF = { 2: 3, 3: 2, 4: 3, 5: 2, 6: 2, 7: 2, 8: 3, 9: 2 };

// Sum the note/rest duration (in L-units) written so far in `measureText`
// (normally the slice from currentMeasureStart() up to the insertion point).
// Returns null when it hits something it doesn't know how to account for
// (an unusual ornament, an odd duration...) so the caller can skip the
// auto-barline/tie feature for that insertion rather than risk miscounting.
function sumMeasureUnits(measureText) {
  let units = 0;
  let k = 0;
  let tupletLeft = 0; // notes still to come in the tuplet group currently open
  let tupletRatio = 1;
  function addDuration(durUnits) {
    if (tupletLeft > 0) {
      units += durUnits * tupletRatio;
      tupletLeft -= 1;
    } else {
      units += durUnits;
    }
  }
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
      const size = parseInt(measureText[k + 1], 10);
      tupletLeft = size;
      tupletRatio = (TUPLET_TIME_OF[size] || size) / size;
      k += 2; // the marker itself, e.g. "(3", takes no time
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
      addDuration(durUnits);
      k = end + 1 + (durMatch ? durMatch[0].length : 0);
      continue;
    }
    const noteMatch = measureText.slice(k).match(/^(\^{1,2}|_{1,2}|=)?[A-Ga-gxXzZ][,']*(\d*\/?\d*)/);
    if (noteMatch) {
      const durUnits = parseAbcDurationUnits(noteMatch[2]);
      if (durUnits === null) return null;
      addDuration(durUnits);
      k += noteMatch[0].length;
      continue;
    }
    return null; // something we don't recognise: bail out rather than guess
  }
  return units;
}

// After changing the time signature, any voice that's still just placeholder
// rests (nothing composed into it yet) needs those rests resized to the new
// measure length - otherwise a fresh blank score (started at the default
// 4/4, "z8" per bar) switched to, say, 3/4 for a waltz keeps that 8-unit
// rest sitting in a 6-unit bar, and the very first notes written into it
// inherit an already-overflowing measure. A voice that already has real
// notes is left untouched - only rewrite bars nothing has been written into.
function resizeBlankRestsToNewMeter(abc, newHeaders) {
  const { keyLineIdx, voices } = parseAbcHeaders(abc);
  if (keyLineIdx === -1 || !voices.length) return abc;
  const lines = abc.split("\n");
  const restToken = restsForMeasure(newHeaders);
  for (const voice of voices) {
    const voiceLineIdx = lines.findIndex((l) => new RegExp(`^V:\\s*${voice.id}\\b`).test(l));
    if (voiceLineIdx === -1 || voiceLineIdx + 1 >= lines.length) continue;
    const bodyLine = lines[voiceLineIdx + 1];
    if (/^V:|^%%/.test(bodyLine)) continue; // this voice has no body line to resize
    const isAllRests = bodyLine.trim() !== "" && !/[A-Ga-g]/.test(bodyLine.replace(/\[[A-Za-z]:[^\]]*\]/g, ""));
    if (!isAllRests) continue;
    const measureCount = countMeasures(abc, voice.id);
    lines[voiceLineIdx + 1] = `${Array(measureCount).fill(restToken).join(" | ")} |`;
  }
  return lines.join("\n");
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

// ===================== Voices sharing one staff =====================
//
// "+ Voz" above always gives the new voice its OWN staff (abcjs's default:
// one staff per V:). To have two voices share the same staff lines instead
// (independent rhythms/stems on one staff - a solo + harmony line, reduced
// choral parts...) abcjs needs an explicit "%%score (id1 id2)" directive:
// parentheses merge those voices onto one staff, a bare id or a group in
// its own parentheses keeps its own staff.

// "%%score (1 2) 3" -> [["1","2"], ["3"]]. No such line yet -> every voice
// on its own staff, which is what plain ABC (no directive at all) means.
function parseScoreGroups(abc, voiceIds) {
  const m = abc.match(/^%%score\s+(.+)$/m);
  if (!m) return voiceIds.map((id) => [id]);
  const groups = [];
  const re = /\(([^)]+)\)|(\S+)/g;
  let gm;
  while ((gm = re.exec(m[1]))) {
    groups.push(gm[1] ? gm[1].trim().split(/\s+/) : [gm[2]]);
  }
  const mentioned = new Set(groups.flat());
  voiceIds.filter((id) => !mentioned.has(id)).forEach((id) => groups.push([id]));
  return groups;
}

function scoreLineFromGroups(groups) {
  return `%%score ${groups.map((g) => (g.length > 1 ? `(${g.join(" ")})` : g[0])).join(" ")}`;
}

// Insert/replace the "%%score" line, right after K: (before any V: line) if
// it doesn't exist yet - where abcjs expects a tune-wide layout directive.
function setScoreGroups(abc, groups) {
  const line = scoreLineFromGroups(groups);
  if (/^%%score\s+.+$/m.test(abc)) return abc.replace(/^%%score\s+.+$/m, line);
  const { keyLineIdx } = parseAbcHeaders(abc);
  if (keyLineIdx === -1) return abc;
  const lines = abc.split("\n");
  lines.splice(keyLineIdx + 1, 0, line);
  return lines.join("\n");
}

// Drop groups down to one voice each (the plain-ABC default) removes the
// directive line entirely instead of leaving a pointless "%%score 1 2 3".
function stripTrivialScoreLine(abc) {
  const { voices } = parseAbcHeaders(abc);
  const groups = parseScoreGroups(abc, voices.map((v) => v.id));
  if (groups.some((g) => g.length > 1)) return abc;
  return abc.replace(/^%%score\s+.+\n?/m, "");
}

function addVoiceToSameStaff(targetVoiceId) {
  const { headers, voices } = parseAbcHeaders(currentAbc);
  const target = voices.find((v) => v.id === targetVoiceId);
  if (!target) return;
  const ids = voices.map((v) => v.id);
  let n = 1;
  while (ids.includes(String(n))) n++;
  const newId = String(n);

  const groups = parseScoreGroups(currentAbc, ids);
  const targetGroup = groups.find((g) => g.includes(targetVoiceId));
  if (targetGroup) targetGroup.push(newId);
  else groups.push([targetVoiceId, newId]);

  const measureCount = countMeasures(currentAbc, targetVoiceId);
  const restToken = restsForMeasure(headers);
  const restLine = `${Array(measureCount).fill(restToken).join(" | ")} |`;
  // Opposite stem direction from the staff's other voice(s), so the two
  // lines stay visually distinct instead of overlapping note heads.
  const block = `V:${newId} clef=${target.clef} name="Voz ${n}" stem=down\n${restLine}`;

  let abc = currentAbc;
  const targetLineRe = new RegExp(`^(V:\\s*${targetVoiceId}\\b.*)$`, "m");
  if (!/\bstem=/.test(targetLineRe.exec(abc)[0])) {
    abc = abc.replace(targetLineRe, "$1 stem=up");
  }
  abc = setScoreGroups(abc, groups);
  setAbc(`${abc.replace(/\s*$/, "")}\n${block}\n`);
}

function removeVoice(voiceId) {
  let abc = removeVoiceBlock(currentAbc, voiceId);
  const { voices } = parseAbcHeaders(abc);
  const remainingIds = voices.map((v) => v.id);
  const groups = parseScoreGroups(abc, remainingIds)
    .map((g) => g.filter((id) => id !== voiceId))
    .filter((g) => g.length > 0);
  abc = stripTrivialScoreLine(setScoreGroups(abc, groups));
  setAbc(abc);
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
  // A staff can carry more than one voice (see addVoiceToSameStaff) - groups
  // gives, per rendered staff, the voice ids in the same order abcjs fills
  // st.voices[0], st.voices[1]... there. Without a %%score directive this is
  // just each voice on its own staff, same as before.
  const groups = parseScoreGroups(currentAbc, voices.map((v) => v.id));
  const map = [];
  let flatIndex = 0;

  (visualObj.lines || []).forEach((line) => {
    (line.staff || []).forEach((st, si) => {
      const topLineEl = topLineEls[flatIndex];
      const staffVoiceIds = groups[si] || [];
      flatIndex += 1;
      if (!topLineEl) return;

      const group = topLineEl.parentElement;
      const linePaths = group ? [...group.querySelectorAll("path")] : [topLineEl];
      const ys = linePaths.map((p) => p.getBBox().y);
      const topY = Math.min(...ys);
      const bottomY = Math.max(...ys);
      const spacing = ys.length > 1 ? (bottomY - topY) / (ys.length - 1) : 12;

      const primaryVoice = voices.find((v) => v.id === staffVoiceIds[0]);
      const elements = [];
      (st.voices || []).forEach((voiceEls, vi) => {
        const voiceId = staffVoiceIds[vi] || staffVoiceIds[0] || String(si + 1);
        (voiceEls || [])
          .filter((e) => e.abselem && typeof e.abselem.x === "number")
          .forEach((e) =>
            // Keep the abselem itself, not just its x - pickElementNearPoint()
            // needs its actual rendered screen rect to tell two voices' notes
            // on the same beat of a shared staff apart by height.
            elements.push({ startChar: e.startChar, endChar: e.endChar, x: e.abselem.x, abselem: e.abselem, voiceId })
          );
      });
      elements.sort((a, b) => a.x - b.x);

      map.push({
        topY,
        spacing,
        voiceId: staffVoiceIds[0] || String(si + 1),
        clef: primaryVoice ? primaryVoice.clef : "treble",
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

// Among candidate elements, find the one closest to a click point - by x
// (time) first and foremost, but breaking near-ties in x by actual rendered
// screen height. That second case is what happens whenever a staff carries
// more than one voice (see addVoiceToSameStaff): two voices sounding on the
// same beat land at (near enough) the identical x, and can only be told
// apart by which one the click is vertically closer to. clientY/svgPt are
// the same click in the two coordinate systems this needs: screen pixels for
// comparing against each element's real rendered position, SVG units for x
// (already what el.x/abselem.x are in). xTolerance bounds how close in x
// counts as "close enough that height should decide it" - only computed
// (abselemScreenRect isn't free) when it might actually matter.
function pickElementNearPoint(elements, svgPt, clientY, xTolerance) {
  if (!elements.length) return null;
  let best = null;
  let bestScore = Infinity;
  for (const el of elements) {
    const dx = Math.abs(el.x - svgPt.x);
    let dy = 0;
    if (dx < xTolerance) {
      const r = el.abselem ? abselemScreenRect(el.abselem) : null;
      dy = r ? Math.abs((r.top + r.bottom) / 2 - clientY) : 0;
    }
    // dx dominates - it's the real "which beat" signal - dy only breaks a
    // near-tie between voices landing on the same beat.
    const score = dx * 1000 + dy;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

// The smallest SVG-space x distance from svgX to any of this note's actual
// noteheads - abselem.x itself is only the token's overall anchor (roughly
// its stem), which for a chord staggered sideways (two notes a 2nd apart
// draw side by side, not stacked) can be a fair bit off from where an
// offset notehead actually sits. Infinity if there's nothing to check.
function closestHeadSvgDistance(abselem, svgX) {
  const heads = (abselem && abselem.heads) || [];
  return heads.reduce((min, h) => (typeof h.x === "number" ? Math.min(min, Math.abs(h.x - svgX)) : min), Infinity);
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

  // Which voice this click belongs to (see pickElementNearPoint) - then the
  // insertion point is found within just THAT voice's own notes, so it never
  // lands mid-way through a different voice's text.
  const nearest = pickElementNearPoint(best.elements, pt, clientY, best.spacing * 3);
  const voiceId = nearest ? nearest.voiceId : best.voiceId;
  const ownElements = best.elements.filter((el) => el.voiceId === voiceId);

  let anchor = null;
  for (const el of ownElements) {
    if (el.x <= pt.x) anchor = el;
    else break;
  }
  const insertAt = anchor ? anchor.endChar : ownElements[0] ? ownElements[0].startChar : null;
  if (insertAt === null) return null;

  return { insertAt, pitchAbsolute, voiceId, svg, svgX: pt.x, snappedSvgY };
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

// ===================== Armed palette (click-to-place) =====================
//
// Dragging a palette chip onto the score still places it exactly where
// dropped, as before. A plain click on a chip now arms it instead of
// inserting immediately: the chip stays highlighted, and the NEXT click on
// the score places the note/rest/drum hit there (pitch from the click's
// vertical position, same as a drop). Clicking the same chip again, picking
// another one, or Escape cancels it. This lets you keep composing by
// clicking repeatedly on the staff without re-grabbing the chip each time.

let armedPalette = null; // { kind, duration, label, pitchToken, btn } | null

function clearArmedPalette() {
  if (armedPalette) armedPalette.btn.classList.remove("is-armed");
  armedPalette = null;
  scoreContainer.classList.remove("is-armed-cursor");
  hideNotePreview();
}

function setArmedPalette(entry) {
  if (armedPalette && armedPalette.btn === entry.btn) {
    clearArmedPalette();
    return;
  }
  if (armedPalette) armedPalette.btn.classList.remove("is-armed");
  armedPalette = entry;
  entry.btn.classList.add("is-armed");
  scoreContainer.classList.add("is-armed-cursor");
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

// `pitchToken` forces a literal ABC pitch instead of one derived from where
// the note was dropped - that's how the drum palette places a bombo on the
// line its %%MIDI drummap assigns to it, whatever the vertical drop position.
function buildNoteOrRestToken(kind, pitchAbsolute, accidental, durationSuffix, pitchToken) {
  if (kind === "rest") return `z${durationSuffix}`;
  if (pitchToken) return `${pitchToken}${durationSuffix}`;
  return `${accidental}${absoluteToAbcPitch(pitchAbsolute)}${durationSuffix}`;
}

// The "Puntillo" selector in the note toolbar: a dot makes the figure you
// place 1.5x longer, a double dot 1.75x.
function selectedDotFactor() {
  const dotSelect = document.getElementById("dot-select");
  return DOT_FACTORS[parseInt(dotSelect ? dotSelect.value : "0", 10) || 0] || 1;
}

// ===================== Key signature vs. written accidentals ===============
//
// An accidental in ABC (and in every other notation) isn't per-note: writing
// "^F" makes every OTHER plain "F" in that same octave sound sharp for the
// rest of the bar too, until a barline or an explicit accidental cancels it.
// So picking "Ninguna" in the Alteración selector can't just mean "write
// nothing" - if an earlier note this bar already bent that same pitch away
// from the key signature, "normal" has to explicitly spell out the key
// signature's own accidental (or a natural "=") to cancel the one still in
// the air, or the note would silently keep sounding altered.

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

// Sharps (positive) / flats (negative) in the signature of each tonic, as if
// it were major.
const MAJOR_SIGNATURE_COUNT = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

// Sharps to add/subtract from that tonic-as-major count for each mode -
// e.g. D dorian shares C major's signature (0 sharps), and D-as-major would
// be 2 sharps, so dorian's offset is -2.
const MODE_SIGNATURE_OFFSET = {
  major: 0, minor: -3, dorian: -2, phrygian: -4, lydian: 1, mixolydian: -1, locrian: -5,
};

function modeNameFromAbc(modeRaw) {
  const mode = (modeRaw || "").toLowerCase();
  if (mode.startsWith("maj") || mode.startsWith("ion")) return "major";
  if (mode.startsWith("dor")) return "dorian";
  if (mode.startsWith("phr")) return "phrygian";
  if (mode.startsWith("lyd")) return "lydian";
  if (mode.startsWith("mix")) return "mixolydian";
  if (mode.startsWith("loc")) return "locrian";
  if (mode.startsWith("m") || mode.startsWith("aeo")) return "minor"; // m, min, minor, aeolian
  return "major";
}

// { C: "", D: "", ... } -> "" (natural per the key), "^" or "_" for each
// letter, from a K: header value like "D", "Bb", "F#m", "Ador".
function keySignatureAccidentals(keyValue) {
  const map = { C: "", D: "", E: "", F: "", G: "", A: "", B: "" };
  const v = (keyValue || "").trim();
  const m = v.match(/^([A-G])([#b]?)\s*([A-Za-z]*)/);
  if (!m) return map;
  const [, letter, accChar, modeRaw] = m;
  const count = MAJOR_SIGNATURE_COUNT[letter + accChar] + MODE_SIGNATURE_OFFSET[modeNameFromAbc(modeRaw)];
  if (count === undefined || Number.isNaN(count)) return map;
  if (count > 0) {
    for (let i = 0; i < Math.min(count, 7); i++) map[SHARP_ORDER[i]] = "^";
  } else if (count < 0) {
    for (let i = 0; i < Math.min(-count, 7); i++) map[FLAT_ORDER[i]] = "_";
  }
  return map;
}

function stripAnnotations(text) {
  return text.replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "");
}

// Rewrite every PLAIN pitch (no accidental of its own already - those always
// sound exactly as written, whatever the key signature says, so they're left
// alone) in `text` so it keeps sounding the same under `newMap` as it did
// under `oldMap`. Walks the raw ABC character by character rather than a
// blind regex, the same way sumMeasureUnits() does, so it never touches text
// inside a quoted chord symbol, a !decoration!, or an inline [M:...] field -
// only actual note letters.
function rewriteNotesForKeyChange(text, oldMap, newMap) {
  function rewritePitch(acc, letter, octave) {
    if (acc) return `${acc}${letter}${octave}`;
    const upper = letter.toUpperCase();
    const oldAcc = oldMap[upper] || "";
    const newAcc = newMap[upper] || "";
    if (oldAcc === newAcc) return `${letter}${octave}`;
    return `${oldAcc || "="}${letter}${octave}`;
  }

  let out = "";
  let k = 0;
  while (k < text.length) {
    const ch = text[k];
    if (ch === '"') {
      const end = text.indexOf('"', k + 1);
      if (end === -1) {
        out += text.slice(k);
        break;
      }
      out += text.slice(k, end + 1);
      k = end + 1;
      continue;
    }
    if (ch === "!") {
      const end = text.indexOf("!", k + 1);
      if (end === -1) {
        out += text.slice(k);
        break;
      }
      out += text.slice(k, end + 1);
      k = end + 1;
      continue;
    }
    if (ch === "[") {
      const fieldMatch = text.slice(k).match(/^\[[A-Za-z]:[^\]]*\]/);
      if (fieldMatch) {
        out += fieldMatch[0];
        k += fieldMatch[0].length;
        continue;
      }
      const end = text.indexOf("]", k + 1);
      if (end === -1) {
        out += text.slice(k);
        break;
      }
      const inner = text.slice(k + 1, end);
      const rewrittenInner = inner.replace(/(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g, (m, acc, letter, oct) =>
        rewritePitch(acc || "", letter, oct)
      );
      out += `[${rewrittenInner}]`;
      k = end + 1;
      continue;
    }
    const noteMatch = text.slice(k).match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/);
    if (noteMatch) {
      out += rewritePitch(noteMatch[1] || "", noteMatch[2], noteMatch[3]);
      k += noteMatch[0].length;
      continue;
    }
    out += ch;
    k += 1;
  }
  return out;
}

// A key signature change only affects the CURRENT voice from that point
// onward - up to wherever that context ends (another inline [K:...], a K:
// header line, or the next V: header). Everything in that zone gets
// rewritten so it keeps sounding like it did under the previous key.
function preserveSoundAcrossKeyChange(abc, zoneStart, oldKeyValue, newKeyValue) {
  const oldMap = keySignatureAccidentals(oldKeyValue);
  const newMap = keySignatureAccidentals(newKeyValue);
  if (Object.keys(oldMap).every((letter) => oldMap[letter] === newMap[letter])) return abc; // same accidentals: nothing could have changed sound

  const rest = abc.slice(zoneStart);
  const boundaryMatch = rest.match(/\[K:[^\]]*\]|^K:.*$|^V:\s*\S+.*$/m);
  const zoneEnd = boundaryMatch ? zoneStart + boundaryMatch.index : abc.length;

  const rewrittenZone = rewriteNotesForKeyChange(abc.slice(zoneStart, zoneEnd), oldMap, newMap);
  return abc.slice(0, zoneStart) + rewrittenZone + abc.slice(zoneEnd);
}

// What accidental (possibly none) needs to be WRITTEN for `pitchAbsolute` to
// actually sound like the key signature says it should, given what's already
// been explicitly written on that same pitch (same letter+octave) earlier in
// `measureText`.
function resolveNormalAccidental(measureText, keyValue, pitchAbsolute) {
  const token = absoluteToAbcPitch(pitchAbsolute);
  const m = token.match(/^([A-Ga-g])([,']*)$/);
  if (!m) return "";
  const [, letter, octaveMarks] = m;
  const keyDefault = keySignatureAccidentals(keyValue)[letter.toUpperCase()] || "";
  const re = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g;
  const clean = stripAnnotations(measureText);
  let mm;
  let carried;
  while ((mm = re.exec(clean))) {
    const [, acc, l, oct] = mm;
    if (!acc) continue; // a plain note doesn't change what's carrying
    if (l === letter && oct === octaveMarks) carried = acc;
  }
  if (carried === undefined || carried === keyDefault) return "";
  return keyDefault || "=";
}

// Insert a note/rest at `insertAt`. If it doesn't fit in what's left of the
// current measure, close the measure with a barline instead (nothing left)
// or split it across the barline as two tied notes (partial fit) - so the
// user never has to manually fix up the bar after dropping a note that's too
// long for the space that's left.
function insertPaletteItem(insertAt, kind, duration, pitchAbsolute, opts = {}) {
  const pitchToken = opts.pitchToken || null;
  // Never insert in the middle of an already-complete tuplet group - see
  // pushPastActiveTuplet().
  insertAt = pushPastActiveTuplet(currentAbc, insertAt);
  const { headers } = parseAbcHeaders(currentAbc);
  const measureStart = currentMeasureStart(currentAbc, insertAt);
  const measureTextSoFar = currentAbc.slice(measureStart, insertAt);
  let accidental = kind === "rest" || pitchToken ? "" : accidentalSelect.value;
  // "Ninguna" chosen explicitly (or just the default): if this same pitch was
  // altered earlier in the bar, spell out what "normal" really is instead of
  // silently inheriting that alteration - see resolveNormalAccidental() above.
  if (!accidental && kind === "note" && !pitchToken) {
    accidental = resolveNormalAccidental(measureTextSoFar, headers.K, pitchAbsolute);
  }
  const baseUnits = parseAbcDurationUnits(duration);
  const wantedUnits = baseUnits === null ? null : baseUnits * selectedDotFactor();
  // What this note will actually cost the measure - a written eighth note
  // only costs 2/3 of that if it's about to land inside an active/armed
  // tuplet, same discount sumMeasureUnits() already applies to earlier notes.
  const tupletRatio = peekTupletRatio();
  const realUnits = wantedUnits === null ? null : wantedUnits * tupletRatio;
  const capacity = unitsPerMeasureFromHeaders(headers);
  const used = wantedUnits === null ? null : sumMeasureUnits(measureTextSoFar);
  const remaining = used === null ? null : capacity - used;

  let text;
  if (remaining === null || remaining >= realUnits - 1e-6) {
    const token = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(wantedUnits), pitchToken);
    text = `${applyTupletMarker(token)} `;
  } else if (remaining <= 1e-6) {
    const token = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(wantedUnits), pitchToken);
    text = `| ${applyTupletMarker(token)} `;
  } else {
    // A tuplet note can't be split across a barline (the "(n" group has to
    // stay contiguous) - if it doesn't fully fit, close the bar instead.
    if (tupletRatio !== 1) {
      const token = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(wantedUnits), pitchToken);
      text = `| ${applyTupletMarker(token)} `;
    } else {
      const first = buildNoteOrRestToken(kind, pitchAbsolute, accidental, unitsToAbcDurationSuffix(remaining), pitchToken);
      const second = buildNoteOrRestToken(
        kind,
        pitchAbsolute,
        accidental,
        unitsToAbcDurationSuffix(wantedUnits - remaining),
        pitchToken
      );
      const tie = kind === "rest" ? "" : "-";
      text = `${applyTupletMarker(first)}${tie}| ${second} `;
    }
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

// What applyTupletMarker() would do to the NEXT note's real duration,
// without placing anything - insertPaletteItem needs this to know how much
// of the measure a note will really use before deciding whether it fits, the
// same way sumMeasureUnits() already discounts notes already on the page.
function peekTupletRatio() {
  const size = tupletState.remaining > 0 ? tupletState.size : parseInt(tupletSelect.value, 10) || 0;
  return size > 0 ? (TUPLET_TIME_OF[size] || size) / size : 1;
}

function updateTupletHint() {
  if (tupletState.remaining > 0) {
    tupletHintEl.textContent = `Coloca ${tupletState.remaining} nota(s) más para completar el grupo de ${tupletState.size}.`;
    return;
  }
  const armedSize = parseInt(tupletSelect.value, 10) || 0;
  tupletHintEl.textContent = armedSize > 0 ? `Grupo completo. El siguiente grupo de ${armedSize} empezará solo.` : "";
}

function applyTupletMarker(token) {
  if (tupletState.remaining > 0) {
    tupletState.remaining -= 1;
    updateTupletHint();
    return token;
  }
  // A completed group does NOT clear the selector: it stays armed so placing
  // many notes in a row (the normal way to fill a bar with triplets) starts
  // a new group each time automatically, instead of silently falling back to
  // plain notes after the first group - which used to leave most of what you
  // placed out of rhythm.
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
  tupletHintEl.textContent = size > 0 ? `Cada ${size} notas/silencios que coloques formarán un grupo de ${size}, hasta que elijas "Normal".` : "";
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
// uses internally to mark a dragged note) for a whole note/chord token - used
// as-is for a plain note (there's only one notehead anyway) or a multi-note
// selection. A single click that lands on one specific notehead of a chord
// instead highlights just that notehead (chordPitchIndex >= 0 on the
// selection entry), the same color, so a chord's notes are each pickable on
// their own instead of always the whole stack together.

const NOTE_SELECTION_COLOR = "#5f8dff"; // must match the selectionColor passed to ABCJS.renderAbc

function highlightChordHead(abselem, index, on) {
  const h = abselem && abselem.heads && abselem.heads[index];
  if (!h || !h.graphelem) return;
  h.graphelem.style.fill = on ? NOTE_SELECTION_COLOR : "";
}

function highlightEntry(entry) {
  try {
    if (entry.chordPitchIndex >= 0) highlightChordHead(entry.abselem, entry.chordPitchIndex, true);
    else if (entry.abselem && entry.abselem.highlight) entry.abselem.highlight();
  } catch {
    /* ignore */
  }
}

function unhighlightEntry(entry) {
  try {
    if (entry.chordPitchIndex >= 0) highlightChordHead(entry.abselem, entry.chordPitchIndex, false);
    else if (entry.abselem && entry.abselem.unhighlight) entry.abselem.unhighlight();
  } catch {
    /* the SVG behind it may already be gone after a re-render */
  }
}

function unhighlightSelection() {
  noteSelection.forEach(unhighlightEntry);
}

function clearNoteSelectionState() {
  unhighlightSelection();
  noteSelection = [];
}

// chordPitchIndex >= 0 means this selection is just ONE pitch of a chord
// (from clicking a specific notehead - see chordPitchIndexAtClick); -1 (the
// default) is the previous, whole-token behaviour every bulk operation
// (Figura, Copiar, Grupo especial...) still expects, so additive/multi-select
// - meant for bulk operations across several different notes - always stays
// whole-token even when the click that added an entry landed on one pitch of
// a chord.
function selectNoteRange(start, end, abselem, additive, chordPitchIndex = -1) {
  const idx = noteSelection.findIndex((n) => n.start === start && n.end === end);
  if (additive) {
    if (idx !== -1) {
      unhighlightEntry(noteSelection[idx]);
      noteSelection.splice(idx, 1);
      return;
    }
    const entry = { start, end, abselem, chordPitchIndex: -1 };
    noteSelection.push(entry);
    highlightEntry(entry);
    return;
  }
  if (idx !== -1 && noteSelection.length === 1 && noteSelection[0].chordPitchIndex === chordPitchIndex) return; // already exactly this
  unhighlightSelection();
  noteSelection = [{ start, end, abselem, chordPitchIndex }];
  highlightEntry(noteSelection[0]);
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
  // or deleted together - and move the text-editor cursor right after it. A
  // click that lands on one specific notehead of a chord selects just that
  // pitch (see chordPitchIndexAtClick) so it, on its own, can be deleted or
  // moved without taking the rest of the chord with it.
  const additive = !!(mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey));
  const chordPitchIndex = mouseEvent
    ? chordPitchIndexAtClick(mouseEvent.clientX, mouseEvent.clientY, abcelem.startChar, abcelem.endChar, abcelem.abselem)
    : -1;
  selectNoteRange(abcelem.startChar, abcelem.endChar, abcelem.abselem, additive, chordPitchIndex);
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
      selectionColor: NOTE_SELECTION_COLOR,
      // Header/footer only draw in abcjs's "print" media (which also forces
      // a full page height) - only worth that trade-off in page view.
      print: viewState.mode === "page" && hasPageDecoration(currentAbc),
      ...scoreFontOptions(),
    });
    visualObj = tunes[0];
    renderStaffMuteButtons();
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
    // setTune(visualObj, userAction, options): passing `false` for userAction
    // (there's no user gesture at render time, just an edit) makes abcjs
    // update its own reference to visualObj WITHOUT rebuilding the actual
    // audio buffer - it only does that lazily, the next time something calls
    // go()/play(), and only if isLoaded is still false. Since a first play
    // already flips isLoaded to true, every edit made after that first play
    // was silently ignored: Play kept resynthesizing the buffer from
    // whatever the score looked like at that first play, forever after.
    // Forcing isLoaded back to false here is what makes the NEXT play()
    // actually rebuild from the current (just-edited) visualObj.
    await synthControl.setTune(visualObj, false, {
      chordsOff: false,
      voicesOff: mutedVoiceIndices(),
      ...metronomeParams(),
    });
    synthControl.isLoaded = false;
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

// `items` are {label, onClick} / {separator:true} / {label, submenu:[...]}.
// A submenu replaces the menu in place (there isn't room to fan out a second
// panel next to it), so it gets a "◂ Volver" entry back to `parentItems`.
function showContextMenu(x, y, items, parentItems) {
  contextMenuEl.innerHTML = "";
  const list = parentItems
    ? [{ label: "◂ Volver", onClick: () => showContextMenu(x, y, parentItems) }, { separator: true }, ...items]
    : items;
  list.forEach((item) => {
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
      if (item.submenu) {
        showContextMenu(x, y, item.submenu, list === items ? items : parentItems || items);
        return;
      }
      hideContextMenu();
      item.onClick();
    });
    contextMenuEl.appendChild(btn);
  });
  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;
  contextMenuEl.hidden = false;

  // Long menus (the note menu has a dozen entries) would otherwise run off the
  // bottom of the window when right-clicking near it.
  contextMenuEl.style.maxHeight = `${Math.max(160, window.innerHeight - y - 16)}px`;
  const rect = contextMenuEl.getBoundingClientRect();
  if (rect.right > window.innerWidth - 8) {
    contextMenuEl.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
  }
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
  // See buildStaffMap(): a staff can carry more than one voice.
  const groups = parseScoreGroups(currentAbc, voices.map((v) => v.id));
  const topLineEls = [...svg.querySelectorAll(".abcjs-top-line")];
  let flatIndex = 0;

  for (const line of visualObj.lines || []) {
    for (const st of line.staff || []) {
      const topLineEl = topLineEls[flatIndex];
      const staffVoiceIds = groups[flatIndex] || [];
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

      const elements = [];
      (st.voices || []).forEach((voiceEls, vi) => {
        const voiceId = staffVoiceIds[vi] || staffVoiceIds[0] || String(flatIndex);
        (voiceEls || [])
          .filter((e) => e.abselem && typeof e.abselem.x === "number")
          .forEach((e) => elements.push({ ...e, voiceId, x: e.abselem.x }));
      });

      // See pickElementNearPoint(): x picks the beat, real screen height
      // breaks ties between voices sounding on the same beat of a shared staff.
      const best = pickElementNearPoint(elements, pt, clientY, spacing * 3);
      // best.x is the token's own anchor (roughly its stem) - a notehead
      // staggered sideways (a chord a 2nd apart draws side by side, not
      // stacked) can sit well off from that, so a click square on that
      // notehead could otherwise miss the "close enough to be a note" check
      // below entirely. closestHeadSvgDistance() catches that using each
      // actual notehead's own x (heads[i].x, same SVG space as pt.x here).
      const bestDist = best ? Math.min(Math.abs(best.x - pt.x), closestHeadSvgDistance(best.abselem, pt.x)) : Infinity;
      if (best && best.el_type === "note" && bestDist < spacing * 1.5) {
        return { kind: "note", voiceId: best.voiceId, startChar: best.startChar, endChar: best.endChar, abselem: best.abselem };
      }

      elements.sort((a, b) => a.x - b.x);
      let anchor = null;
      for (const el of elements) {
        if (el.x <= pt.x) anchor = el;
        else break;
      }
      const insertAt = anchor ? anchor.endChar : elements[0] ? elements[0].startChar : null;
      const voiceId = anchor ? anchor.voiceId : staffVoiceIds[0] || String(flatIndex);
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

// ---------- Note token parsing ----------
//
// A "note token" - the slice of ABC between an element's startChar/endChar -
// carries much more than the pitch: leading whitespace (the first note of a
// bar arrives as " C2"), a tuplet marker, a slur start/end ("(" / ")" - a
// slur across a whole tuplet writes both on the SAME note, e.g. "((3^e "),
// grace notes, chord symbols, decorations, a chord in brackets, a duration
// and a tie. Everything that edits a note goes through this parser, so no
// transform silently no-ops on a note that happens to start/end a slur, be
// the first of its measure, or be part of a chord.
const NOTE_TOKEN_RE = new RegExp(
  "^(\\s*)" + // 1 leading whitespace
    "((?:(?:\\(\\d+(?::\\d+){0,2})|\\()*(?:\\{[^}]*\\})?(?:(?:\"[^\"]*\"|![^!]*!|[.~HLMOPSTuv])\\s*)*)" + // 2 tuplet marker(s)/slur start(s) in any order, grace/chord-symbol/decorations
    "(\\[[^\\]]*\\]|(?:\\^{1,2}|_{1,2}|=)?[A-Ga-gxXzZ][,']*)" + // 3 chord or single pitch
    "((?:\\d+)?(?:\\/+\\d*)?)" + // 4 duration
    "(-?)" + // 5 tie
    "(\\)*)" + // 6 slur end(s)
    "(\\s*)$" // 7 trailing whitespace
);

function parseNoteToken(token) {
  const m = token.match(NOTE_TOKEN_RE);
  if (!m) return null;
  const [, lead, prefix, body, duration, tie, slurEnd, trail] = m;
  if (/^\[[A-Za-z]:/.test(body)) return null; // an inline field like [K:C], not a note
  return { lead, prefix, body, duration, tie, slurEnd, trail };
}

function buildNoteToken(p) {
  return `${p.lead}${p.prefix}${p.body}${p.duration}${p.tie}${p.slurEnd || ""}${p.trail}`;
}

function isRestBody(body) {
  return /^[xXzZ]/.test(body);
}

// The individual pitches of a token: one entry for a plain note, several for
// a chord written as [CEG].
function tokenPitches(body) {
  if (body.startsWith("[")) return body.slice(1, -1).match(/(?:\^{1,2}|_{1,2}|=)?[A-Ga-g][,']*/g) || [];
  return [body];
}

function pitchesToBody(pitches) {
  const unique = [...new Set(pitches)].sort((a, b) => (abcTokenToAbsolute(a) ?? 0) - (abcTokenToAbsolute(b) ?? 0));
  return unique.length > 1 ? `[${unique.join("")}]` : unique[0] || "";
}

// Map every pitch of a token (all of them, if it's a chord) through `fn`.
function mapTokenPitches(token, fn) {
  const p = parseNoteToken(token);
  if (!p || isRestBody(p.body)) return token;
  p.body = pitchesToBody(tokenPitches(p.body).map(fn));
  return buildNoteToken(p);
}

function setTokenDuration(token, durationSuffix) {
  const p = parseNoteToken(token);
  if (!p) return token;
  p.duration = durationSuffix;
  return buildNoteToken(p);
}

function scaleTokenDuration(token, factor) {
  const p = parseNoteToken(token);
  if (!p) return token;
  const units = parseAbcDurationUnits(p.duration);
  if (units === null) return token;
  p.duration = unitsToAbcDurationSuffix(units * factor);
  return buildNoteToken(p);
}

// ---------- Dots (puntillo / doble puntillo) ----------
//
// ABC has no dot character: a dotted note is just written longer (a dotted
// eighth in L:1/8 is "3/2"). So "how many dots does this have" has to be read
// back out of the written length - a plain figure is a power of two of the
// L-unit, one dot multiplies it by 3/2 and two dots by 7/4.

const DOT_FACTORS = [1, 1.5, 1.75];

function isBinaryDuration(units) {
  if (!(units > 0)) return false;
  const l = Math.log2(units);
  return Math.abs(l - Math.round(l)) < 1e-6;
}

function durationDotCount(units) {
  for (let dots = 0; dots < DOT_FACTORS.length; dots++) {
    if (isBinaryDuration(units / DOT_FACTORS[dots])) return dots;
  }
  return -1; // not a plain figure with 0-2 dots (a tuplet member, say)
}

function setTokenDots(token, dots) {
  const p = parseNoteToken(token);
  if (!p) return token;
  const units = parseAbcDurationUnits(p.duration);
  if (units === null) return token;
  const current = durationDotCount(units);
  if (current === -1) return token;
  p.duration = unitsToAbcDurationSuffix((units / DOT_FACTORS[current]) * DOT_FACTORS[dots]);
  return buildNoteToken(p);
}

// ---------- Chords ----------

function addChordNote(token, steps) {
  const p = parseNoteToken(token);
  if (!p || isRestBody(p.body)) return token;
  const pitches = tokenPitches(p.body);
  const reference = steps >= 0 ? pitches[pitches.length - 1] : pitches[0];
  p.body = pitchesToBody([...pitches, shiftAbcNoteToken(reference, steps)]);
  return buildNoteToken(p);
}

function removeChordNote(token) {
  const p = parseNoteToken(token);
  if (!p) return token;
  const pitches = tokenPitches(p.body);
  if (pitches.length < 2) return token;
  p.body = pitchesToBody(pitches.slice(0, -1));
  return buildNoteToken(p);
}

// Remove just ONE pitch of a chord (by index, from addChordToneAtClick's or
// the context menu's chordPitchIndex) instead of always the highest. A note
// that isn't actually a chord (one pitch, or none matched) has nothing to
// shrink down to, so this deletes the whole note/rest instead - same as the
// regular Delete key.
function removeOnePitch(token, index) {
  const p = parseNoteToken(token);
  if (!p || isRestBody(p.body)) return token;
  const pitches = tokenPitches(p.body);
  if (pitches.length <= 1 || index < 0 || index >= pitches.length) return deleteTokenText(token);
  p.body = pitchesToBody(pitches.filter((_, i) => i !== index));
  return buildNoteToken(p);
}

// ---------- Accidentals, decorations, octaves ----------

const ACCIDENTAL_ORDER = ["__", "_", "", "^", "^^"];

function shiftPitchAccidental(pitch, direction) {
  const m = pitch.match(/^(\^{1,2}|_{1,2}|=)?(.*)$/);
  const [, accidental = "", rest] = m;
  const normalized = accidental === "=" ? "" : accidental;
  let idx = ACCIDENTAL_ORDER.indexOf(normalized);
  if (idx === -1) idx = 2;
  idx = Math.min(ACCIDENTAL_ORDER.length - 1, Math.max(0, idx + direction));
  return `${ACCIDENTAL_ORDER[idx]}${rest}`;
}

function shiftTokenAccidental(token, direction) {
  return mapTokenPitches(token, (pitch) => shiftPitchAccidental(pitch, direction));
}

// Same as shiftTokenAccidental, but for just ONE pitch of a chord - so a note
// stacked with a click above/below (see addChordToneAtClick) can be altered
// on its own afterwards, the same way you'd alter a single note, instead of
// always dragging every other note of the chord along with it.
function shiftOnePitchAccidental(token, index, direction) {
  const p = parseNoteToken(token);
  if (!p || isRestBody(p.body)) return token;
  const pitches = tokenPitches(p.body);
  if (index < 0 || index >= pitches.length) return token;
  pitches[index] = shiftPitchAccidental(pitches[index], direction);
  p.body = pitchesToBody(pitches);
  return buildNoteToken(p);
}

function shiftTokenPitch(token, steps) {
  return mapTokenPitches(token, (pitch) => shiftAbcNoteToken(pitch, steps));
}

// Same as shiftTokenPitch, but for just ONE pitch of a chord (a diatonic
// step or a full octave, not just a semitone - see shiftOnePitchAccidental
// for that one) - moving one note of a chord independently of the rest.
function shiftOnePitchToken(token, index, steps) {
  const p = parseNoteToken(token);
  if (!p || isRestBody(p.body)) return token;
  const pitches = tokenPitches(p.body);
  if (index < 0 || index >= pitches.length) return token;
  pitches[index] = shiftAbcNoteToken(pitches[index], steps);
  p.body = pitchesToBody(pitches);
  return buildNoteToken(p);
}

// Decorations (!accent!, !p!, !fermata!...) go immediately before the note, so
// they end up in the token's prefix - after any tuplet marker, which has to
// stay first.
function addDecoration(token, decoration) {
  const p = parseNoteToken(token);
  if (!p) return token;
  if (p.prefix.includes(decoration)) return token;
  p.prefix += decoration;
  return buildNoteToken(p);
}

function clearDecorations(token) {
  const p = parseNoteToken(token);
  if (!p) return token;
  p.prefix = p.prefix.replace(/![^!]*!/g, "").replace(/\{[^}]*\}/g, "");
  return buildNoteToken(p);
}

// A grace note (apoyatura) one diatonic step above/below the note itself.
function addGraceNote(token, steps) {
  const p = parseNoteToken(token);
  if (!p || isRestBody(p.body)) return token;
  if (/\{/.test(p.prefix)) return token;
  const grace = shiftAbcNoteToken(tokenPitches(p.body)[0], steps);
  const tupletMatch = p.prefix.match(/^\(\d+(?::\d+){0,2}/);
  const tuplet = tupletMatch ? tupletMatch[0] : "";
  p.prefix = `${tuplet}{${grace}}${p.prefix.slice(tuplet.length)}`;
  return buildNoteToken(p);
}

// ---------- Tuplet markers on an existing selection ----------

function setTokenTuplet(token, size) {
  const p = parseNoteToken(token);
  if (!p) return token;
  p.prefix = p.prefix.replace(/^\(\d+(?::\d+){0,2}/, "");
  if (size > 0) p.prefix = `(${size}${p.prefix}`;
  return buildNoteToken(p);
}

// Deleting a note/rest removes it outright - it does NOT leave a same-length
// rest behind (that would just be a different kind of "not actually gone").
// Keeps whichever whitespace this token owned (lead and/or trail) so its
// neighbours don't fuse together once it's gone.
function deleteTokenText(token) {
  const p = parseNoteToken(token);
  if (!p) return "";
  return p.lead + p.trail;
}

function deleteNoteSelection() {
  // Exactly one specific notehead of a chord selected (see
  // chordPitchIndexAtClick): drop just that pitch, not the whole chord -
  // removeOnePitch() itself falls back to a full rest if it turns out not to
  // actually be a chord.
  if (noteSelection.length === 1 && noteSelection[0].chordPitchIndex >= 0) {
    const index = noteSelection[0].chordPitchIndex;
    applyToSelection((token) => removeOnePitch(token, index));
    return;
  }
  applyToSelection(deleteTokenText);
}

function tieSelectedWithNext() {
  if (noteSelection.length !== 1) return;
  const r = noteSelection[0];
  const token = currentAbc.slice(r.start, r.end);
  const trail = (token.match(/\s*$/) || [""])[0].length;
  const at = r.end - trail;
  setAbc(currentAbc.slice(0, at) + "-" + currentAbc.slice(at));
}

// The selection in text order, which is what every multi-note operation
// (chord merge, tuplet, slur, copy) needs - clicking notes with ctrl held
// records them in click order, not score order.
function orderedSelection() {
  return [...noteSelection].sort((a, b) => a.start - b.start);
}

// Fuse the selected notes into a single chord: all their pitches, the first
// one's duration, everything in between removed.
function mergeSelectionIntoChord() {
  if (noteSelection.length < 2) {
    flashPlaybackStatus("Selecciona al menos dos notas para unirlas en un acorde.");
    return;
  }
  const ranges = orderedSelection();
  const first = parseNoteToken(currentAbc.slice(ranges[0].start, ranges[0].end));
  if (!first || isRestBody(first.body)) return;

  const pitches = [];
  for (const r of ranges) {
    const p = parseNoteToken(currentAbc.slice(r.start, r.end));
    if (!p || isRestBody(p.body)) {
      flashPlaybackStatus("Solo se pueden unir notas (no silencios).");
      return;
    }
    pitches.push(...tokenPitches(p.body));
  }

  first.body = pitchesToBody(pitches);
  first.trail = first.trail || " ";
  const start = ranges[0].start;
  const end = ranges[ranges.length - 1].end;
  setAbc(currentAbc.slice(0, start) + buildNoteToken(first) + currentAbc.slice(end));
}

// Mark the selected notes as a tuplet: ABC only tags the FIRST note of the
// group with "(n", the rest just follow.
function makeTupletFromSelection(size) {
  const ranges = orderedSelection();
  if (ranges.length < 2) {
    flashPlaybackStatus("Selecciona las notas que forman el grupo.");
    return;
  }
  const n = size || ranges.length;
  const r = ranges[0];
  setAbc(currentAbc.slice(0, r.start) + setTokenTuplet(currentAbc.slice(r.start, r.end), n) + currentAbc.slice(r.end));
}

// A phrasing slur is a plain "(" before the first note and ")" after the last
// one - inserted around, not inside, the leading/trailing whitespace so the
// bar's own spacing survives.
function slurSelection() {
  const ranges = orderedSelection();
  if (ranges.length < 2) {
    flashPlaybackStatus("Selecciona al menos dos notas para ligarlas.");
    return;
  }
  const firstToken = currentAbc.slice(ranges[0].start, ranges[0].end);
  const lastToken = currentAbc.slice(ranges[ranges.length - 1].start, ranges[ranges.length - 1].end);
  const openAt = ranges[0].start + (firstToken.match(/^\s*/) || [""])[0].length;
  const closeAt = ranges[ranges.length - 1].end - (lastToken.match(/\s*$/) || [""])[0].length;
  if (closeAt <= openAt) return;

  let abc = currentAbc.slice(0, closeAt) + ")" + currentAbc.slice(closeAt);
  abc = abc.slice(0, openAt) + "(" + abc.slice(openAt);
  setAbc(abc);
}

function selectAllNotes() {
  const all = allNoteElements();
  if (!all.length) return;
  unhighlightSelection();
  noteSelection = all.map((el) => ({ start: el.startChar, end: el.endChar, abselem: el.abselem }));
  noteSelection.forEach((n) => {
    try {
      if (n.abselem && n.abselem.highlight) n.abselem.highlight();
    } catch {
      /* ignore */
    }
  });
}

// ===================== Clipboard (copy / cut / paste) =====================
//
// Kept in a variable rather than only in the system clipboard: what we copy
// is raw ABC text, and reading the system clipboard needs a permission prompt
// that would break the flow. We still push a copy out to the system clipboard
// (best effort) so the notes can be pasted into the ABC panel or elsewhere.

let scoreClipboard = "";

function copySelection() {
  const ranges = orderedSelection();
  if (!ranges.length) {
    flashPlaybackStatus("No hay notas seleccionadas.");
    return false;
  }
  scoreClipboard = ranges
    .map((r) => currentAbc.slice(r.start, r.end).trim())
    .filter(Boolean)
    .join(" ");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(scoreClipboard).catch(() => {});
  } catch {
    /* clipboard blocked: the internal copy still works */
  }
  flashPlaybackStatus(`Copiado: ${ranges.length} nota(s).`);
  updateClipboardButtons();
  return true;
}

// Cut leaves rests behind rather than a hole, for the same reason Borrar does:
// removing the text outright would leave the measure short.
function cutSelection() {
  if (!copySelection()) return;
  deleteNoteSelection();
}

function pasteAt(insertAt) {
  if (!scoreClipboard) {
    flashPlaybackStatus("No hay nada copiado.");
    return;
  }
  const at = insertAt === null || insertAt === undefined ? cursorPos : insertAt;
  const text = `${scoreClipboard} `;
  setAbc(currentAbc.slice(0, at) + text + currentAbc.slice(at));
  cursorPos = at + text.length;
}

// Paste after the last selected note when there's a selection, otherwise at
// the text cursor - the same "where would the next note go" rule the palette
// already uses.
function pasteAtSelectionOrCursor() {
  const ranges = orderedSelection();
  pasteAt(ranges.length ? ranges[ranges.length - 1].end : cursorPos);
}

function updateClipboardButtons() {
  const pasteBtn = document.getElementById("paste-btn");
  if (pasteBtn) pasteBtn.disabled = !scoreClipboard || !currentAbc.trim();
}

const DURATION_CHOICES = [
  { duration: "16", label: "Cuadrada" },
  { duration: "8", label: "Redonda" },
  { duration: "4", label: "Blanca" },
  { duration: "2", label: "Negra" },
  { duration: "", label: "Corchea" },
  { duration: "/2", label: "Semicorchea" },
  { duration: "/4", label: "Fusa" },
  { duration: "/8", label: "Semifusa" },
];

const DYNAMIC_CHOICES = [
  { value: "!ppp!", label: "ppp" },
  { value: "!pp!", label: "pp" },
  { value: "!p!", label: "p" },
  { value: "!mp!", label: "mp" },
  { value: "!mf!", label: "mf" },
  { value: "!f!", label: "f" },
  { value: "!ff!", label: "ff" },
  { value: "!fff!", label: "fff" },
  { value: "!sfz!", label: "sfz" },
  { value: "!crescendo(!", label: "crescendo (inicio)" },
  { value: "!crescendo)!", label: "crescendo (fin)" },
  { value: "!diminuendo(!", label: "diminuendo (inicio)" },
  { value: "!diminuendo)!", label: "diminuendo (fin)" },
];

const ARTICULATION_CHOICES = [
  { value: "!staccato!", label: "Staccato ·" },
  { value: "!accent!", label: "Acento >" },
  { value: "!tenuto!", label: "Tenuto —" },
  { value: "!marcato!", label: "Marcato ^" },
  { value: "!fermata!", label: "Calderón" },
  { value: "!trill!", label: "Trino" },
  { value: "!mordent!", label: "Mordente" },
  { value: "!turn!", label: "Grupeto" },
  { value: "!arpeggio!", label: "Arpegio" },
  { value: "!upbow!", label: "Arco arriba" },
  { value: "!downbow!", label: "Arco abajo" },
  { value: "!breath!", label: "Respiración" },
];

const CHORD_INTERVALS = [
  { steps: 2, label: "Tercera por encima" },
  { steps: 4, label: "Quinta por encima" },
  { steps: 7, label: "Octava por encima" },
  { steps: 5, label: "Sexta por encima" },
  { steps: -2, label: "Tercera por debajo" },
  { steps: -4, label: "Quinta por debajo" },
  { steps: -7, label: "Octava por debajo" },
];

const TUPLET_CHOICES = [2, 3, 4, 5, 6, 7, 9];

function buildNoteContextMenu(hit) {
  const count = noteSelection.length;
  const suffix = count > 1 ? ` (${count})` : "";
  const multi = count > 1;

  return [
    { label: "▶ Reproducir desde aquí", onClick: () => playFromChar(hit.startChar) },
    { separator: true },
    {
      label: `Figura${suffix} ▸`,
      submenu: [
        ...DURATION_CHOICES.map((d) => ({
          label: d.label,
          onClick: () => applyToSelection((token) => setTokenDuration(token, d.duration)),
        })),
        { separator: true },
        { label: "Doble de larga", onClick: () => applyToSelection((token) => scaleTokenDuration(token, 2)) },
        { label: "Mitad de larga", onClick: () => applyToSelection((token) => scaleTokenDuration(token, 0.5)) },
      ],
    },
    {
      label: `Puntillo${suffix} ▸`,
      submenu: [
        { label: "Sin puntillo", onClick: () => applyToSelection((token) => setTokenDots(token, 0)) },
        { label: "Puntillo ·", onClick: () => applyToSelection((token) => setTokenDots(token, 1)) },
        { label: "Doble puntillo ··", onClick: () => applyToSelection((token) => setTokenDots(token, 2)) },
      ],
    },
    {
      label: `Acorde${suffix} ▸`,
      submenu: [
        ...CHORD_INTERVALS.map((i) => ({
          label: `Añadir ${i.label.toLowerCase()}`,
          onClick: () => applyToSelection((token) => addChordNote(token, i.steps)),
        })),
        { separator: true },
        // Right-clicked one specific note of a chord: offer to drop just
        // that one, ahead of the generic "highest note" shortcut below.
        ...(!multi && hit.chordPitchIndex >= 0
          ? [{ label: "Borrar esta nota (del acorde)", onClick: () => applyToSelection((token) => removeOnePitch(token, hit.chordPitchIndex)) }]
          : []),
        { label: "Quitar la nota más aguda", onClick: () => applyToSelection(removeChordNote) },
        ...(multi ? [{ label: `Unir las ${count} notas en un acorde`, onClick: mergeSelectionIntoChord }] : []),
      ],
    },
    {
      label: `Grupo especial${suffix} ▸`,
      submenu: [
        ...TUPLET_CHOICES.map((n) => ({
          label: `Grupo de ${n}${n === 3 ? " (tresillo)" : ""}`,
          onClick: () => makeTupletFromSelection(n),
        })),
        { separator: true },
        { label: "Quitar grupo", onClick: () => applyToSelection((token) => setTokenTuplet(token, 0)) },
      ],
    },
    { separator: true },
    {
      label: `Altura${suffix} ▸`,
      submenu: [
        // hit.chordPitchIndex >= 0 means the right click landed on one
        // specific note of a chord: offer to alter just that one, same as
        // you would a single note, ahead of the whole-chord versions below.
        ...(!multi && hit.chordPitchIndex >= 0
          ? [
              { label: "Subir semitono (esta nota)", onClick: () => applyToSelection((token) => shiftOnePitchAccidental(token, hit.chordPitchIndex, 1)) },
              { label: "Bajar semitono (esta nota)", onClick: () => applyToSelection((token) => shiftOnePitchAccidental(token, hit.chordPitchIndex, -1)) },
              { label: "Subir un tono (esta nota)", onClick: () => applyToSelection((token) => shiftOnePitchToken(token, hit.chordPitchIndex, 1)) },
              { label: "Bajar un tono (esta nota)", onClick: () => applyToSelection((token) => shiftOnePitchToken(token, hit.chordPitchIndex, -1)) },
              { label: "Subir una octava (esta nota)", onClick: () => applyToSelection((token) => shiftOnePitchToken(token, hit.chordPitchIndex, 7)) },
              { label: "Bajar una octava (esta nota)", onClick: () => applyToSelection((token) => shiftOnePitchToken(token, hit.chordPitchIndex, -7)) },
              { separator: true },
            ]
          : []),
        { label: "Subir semitono", onClick: () => applyToSelection((token) => shiftTokenAccidental(token, 1)) },
        { label: "Bajar semitono", onClick: () => applyToSelection((token) => shiftTokenAccidental(token, -1)) },
        { separator: true },
        { label: "Subir un tono de la escala", onClick: () => applyToSelection((token) => shiftTokenPitch(token, 1)) },
        { label: "Bajar un tono de la escala", onClick: () => applyToSelection((token) => shiftTokenPitch(token, -1)) },
        { label: "Subir una octava", onClick: () => applyToSelection((token) => shiftTokenPitch(token, 7)) },
        { label: "Bajar una octava", onClick: () => applyToSelection((token) => shiftTokenPitch(token, -7)) },
      ],
    },
    {
      label: `Matiz${suffix} ▸`,
      submenu: DYNAMIC_CHOICES.map((d) => ({
        label: d.label,
        onClick: () => applyToSelection((token) => addDecoration(token, d.value)),
      })),
    },
    {
      label: `Articulación${suffix} ▸`,
      submenu: [
        ...ARTICULATION_CHOICES.map((a) => ({
          label: a.label,
          onClick: () => applyToSelection((token) => addDecoration(token, a.value)),
        })),
        { separator: true },
        { label: "Quitar articulaciones y adornos", onClick: () => applyToSelection(clearDecorations) },
      ],
    },
    {
      label: `Ligaduras y adornos${suffix} ▸`,
      submenu: [
        ...(count === 1 ? [{ label: "Ligar con la siguiente nota", onClick: tieSelectedWithNext }] : []),
        ...(multi ? [{ label: "Ligadura de expresión", onClick: slurSelection }] : []),
        { label: "Apoyatura superior", onClick: () => applyToSelection((token) => addGraceNote(token, 1)) },
        { label: "Apoyatura inferior", onClick: () => applyToSelection((token) => addGraceNote(token, -1)) },
      ],
    },
    { separator: true },
    { label: `Copiar${suffix}`, onClick: copySelection },
    { label: `Cortar${suffix}`, onClick: cutSelection },
    ...(scoreClipboard ? [{ label: "Pegar después", onClick: () => pasteAt(hit.endChar) }] : []),
    { separator: true },
    { label: `Borrar${suffix}`, danger: true, onClick: deleteNoteSelection },
  ];
}

function buildStaffContextMenu(hit) {
  const { voices } = parseAbcHeaders(currentAbc);
  const voice = voices.find((v) => v.id === hit.voiceId);
  const voiceLabel = voice && voice.name ? voice.name : `Voz ${hit.voiceId}`;
  const isMuted = getMutedVoices(currentAbc).includes(hit.voiceId);
  const isPerc = voice && voice.clef === "perc";

  return [
    { label: "▶ Reproducir desde aquí", onClick: () => playFromChar(hit.insertAt) },
    { label: "⏯ Reproducir / Pausar", onClick: togglePlayback },
    { separator: true },
    ...(isPerc
      ? [
          {
            label: "Añadir percusión aquí ▸",
            submenu: DRUM_KIT.map((d) => ({
              label: d.label,
              onClick: () => insertPaletteItem(hit.insertAt, "note", "2", null, { pitchToken: d.pitch }),
            })),
          },
        ]
      : [{ label: "Añadir nota aquí", onClick: () => insertPaletteItem(hit.insertAt, "note", "", 6) }]),
    { label: "Añadir silencio aquí", onClick: () => insertPaletteItem(hit.insertAt, "rest", "", null) },
    {
      label: "Añadir fin aquí",
      title: "Barra final: marca el fin de la partitura",
      onClick: () => setAbc(currentAbc.slice(0, hit.insertAt) + "|] " + currentAbc.slice(hit.insertAt)),
    },
    ...(scoreClipboard ? [{ label: "Pegar aquí", onClick: () => pasteAt(hit.insertAt) }] : []),
    { separator: true },
    {
      label: "Añadir armadura ▸",
      submenu: KEY_OPTIONS.map((k) => ({
        label: keyLabel(k),
        onClick: () => applyValueAtPosition("K", k, { insertAt: hit.insertAt }),
      })),
    },
    {
      label: "Cambiar compás ▸",
      submenu: TIME_OPTIONS.map((t) => ({ label: t, onClick: () => applyQuickValue("M", t) })),
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
    {
      label: `Añadir voz en este pentagrama`,
      onClick: () => addVoiceToSameStaff(hit.voiceId),
    },
    { separator: true },
    {
      label: isMuted ? `Activar sonido de "${voiceLabel}"` : `Silenciar "${voiceLabel}"`,
      onClick: () => toggleVoiceMute(hit.voiceId),
    },
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

// Which pitch of a chord the click's height actually lands closest to - so
// "Altura" in the context menu can alter just that one note, the same way it
// would for a single note, instead of always moving every note of the chord
// together. -1 for a plain (non-chord) note, since there's nothing to pick.
// abcjs draws a chord a 2nd apart (e.g. [CD]) with the two noteheads
// side by side, not stacked - so picking by height alone gets the wrong one
// half the time. abselem.heads[i].graphelem is the actual rendered <path>
// for each notehead, with its own real position, so this checks distance to
// each one directly instead. heads[i].pitch uses the exact same numbering as
// abcTokenToAbsolute() (verified: C=0, D=1... across octaves), which is what
// maps a head back to its index in tokenPitches(body) - abcjs itself always
// renders heads in ascending-pitch order regardless of how the chord was
// written ("[DC]" and "[CD]" render identically), so the two orderings can
// disagree and can't just be assumed to line up index-for-index.
function chordPitchIndexAtClick(clientX, clientY, startChar, endChar, abselem) {
  const parsed = parseNoteToken(currentAbc.slice(startChar, endChar));
  if (!parsed || isRestBody(parsed.body)) return -1;
  const pitches = tokenPitches(parsed.body);
  if (pitches.length < 2) return -1;
  const heads = (abselem && abselem.heads) || [];
  if (!heads.length) return -1;
  let bestHead = null;
  let bestDist = Infinity;
  heads.forEach((h) => {
    if (!h.graphelem || typeof h.graphelem.getBoundingClientRect !== "function") return;
    const r = h.graphelem.getBoundingClientRect();
    const dist = Math.hypot((r.left + r.right) / 2 - clientX, (r.top + r.bottom) / 2 - clientY);
    if (dist < bestDist) {
      bestDist = dist;
      bestHead = h;
    }
  });
  if (!bestHead) return -1;
  const idx = pitches.findIndex((p) => abcTokenToAbsolute(p) === bestHead.pitch);
  return idx;
}

scoreContainer.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const hit = findScoreHit(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.kind === "note") {
    hit.chordPitchIndex = chordPitchIndexAtClick(e.clientX, e.clientY, hit.startChar, hit.endChar, hit.abselem);
    // Leave an existing multi-selection alone if this note is part of it
    // (the menu should act on all of them) - but if it's the sole selected
    // note and this click landed on a DIFFERENT pitch of that same chord,
    // reselect so the highlight matches what "(esta nota)" is about to act on.
    const sameToken = noteSelection.some((n) => n.start === hit.startChar && n.end === hit.endChar);
    const needsPitchUpdate =
      noteSelection.length === 1 &&
      noteSelection[0].start === hit.startChar &&
      noteSelection[0].end === hit.endChar &&
      noteSelection[0].chordPitchIndex !== hit.chordPitchIndex;
    if (!sameToken || needsPitchUpdate) {
      selectNoteRange(hit.startChar, hit.endChar, hit.abselem, false, hit.chordPitchIndex);
    }
    showContextMenu(e.clientX, e.clientY, buildNoteContextMenu(hit));
  } else {
    showContextMenu(e.clientX, e.clientY, buildStaffContextMenu(hit));
  }
});

// With a palette chip armed, a click on the score places it there instead of
// selecting/deselecting - see setArmedPalette().
scoreContainer.addEventListener("click", (e) => {
  if (armedPalette) {
    const result = computeDropInsertion(e.clientX, e.clientY);
    if (result) {
      const { kind, duration, pitchToken } = armedPalette;
      if (kind === "note" && !pitchToken && document.getElementById("chord-mode").checked && stackPitchOnNoteAt(e.clientX, e.clientY, result)) {
        return;
      }
      insertPaletteItem(result.insertAt, kind, duration, result.pitchAbsolute, { pitchToken });
    }
    return;
  }
  // Clicking above or below an existing note (not on its own notehead) adds
  // it as a chord tone - see addChordToneAtClick().
  if (addChordToneAtClick(e.clientX, e.clientY)) return;
  // A left click that doesn't land on a selectable note/rest deselects, same
  // as clicking empty space in any other editor - unless that same gesture
  // was a rubber-band selection, whose mouseup also fires a click here.
  if (suppressNextBackgroundClear) {
    suppressNextBackgroundClear = false;
    return;
  }
  if (!e.target.closest("[data-index]")) clearNoteSelectionState();
});

// Live preview of where an armed chip would land, following the same
// crosshair the drag-and-drop path already shows.
scoreContainer.addEventListener("mousemove", (e) => {
  if (!armedPalette) return;
  const result = computeDropInsertion(e.clientX, e.clientY);
  if (!result) {
    hideNotePreview();
    return;
  }
  showNotePreviewAt(result, armedPalette.kind === "rest" ? "Silencio" : armedPalette.pitchToken ? armedPalette.label : null);
});
scoreContainer.addEventListener("mouseleave", () => {
  if (armedPalette) hideNotePreview();
});

// True while the keyboard belongs to a text field, so the score shortcuts
// (space, Delete, Ctrl+C/V...) don't fight with typing.
function typingInField() {
  const active = document.activeElement;
  return !!(
    active &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable)
  );
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideContextMenu();
    clearNoteSelectionState();
    clearArmedPalette();
    return;
  }
  if (typingInField()) return;

  // Space plays/pauses, like every other score editor. preventDefault stops
  // the browser scrolling the stage at the same time.
  if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    togglePlayback();
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
    if (key === "c" && noteSelection.length) {
      e.preventDefault();
      copySelection();
    } else if (key === "x" && noteSelection.length) {
      e.preventDefault();
      cutSelection();
    } else if (key === "v" && scoreClipboard) {
      e.preventDefault();
      pasteAtSelectionOrCursor();
    } else if (key === "a" && currentAbc.trim()) {
      e.preventDefault();
      selectAllNotes();
    } else if (key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (key === "z") {
      e.preventDefault();
      undo();
    } else if (key === "y") {
      e.preventDefault();
      redo();
    }
    return;
  }

  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (noteSelection.length === 0) return;
  e.preventDefault();
  deleteNoteSelection();
});

// ===================== Rubber-band selection =====================
//
// Dragging from empty space inside the score selects every note the rectangle
// touches. Notes themselves are left alone on mousedown: abcjs owns those, and
// dragging one is how you change its pitch.

const selectBandEl = document.getElementById("select-band");
let suppressNextBackgroundClear = false;

// Every note/rest element of the rendered score, flattened across systems,
// staves and voices.
function allNoteElements() {
  const out = [];
  ((visualObj && visualObj.lines) || []).forEach((line) =>
    (line.staff || []).forEach((staff) =>
      (staff.voices || []).forEach((voice) =>
        (voice || []).forEach((el) => {
          if (el.el_type === "note" && el.abselem && typeof el.startChar === "number") out.push(el);
        })
      )
    )
  );
  return out;
}

// abcjs keeps the SVG nodes it drew for an element in `elemset`, which is also
// what its own highlight() walks - so the on-screen box of a note is just the
// union of those nodes' rects, no coordinate maths needed.
function abselemScreenRect(abselem) {
  const nodes = ((abselem && abselem.elemset) || []).filter((n) => n && typeof n.getBoundingClientRect === "function");
  if (!nodes.length) return null;
  return nodes.reduce((acc, node) => {
    const r = node.getBoundingClientRect();
    if (!acc) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    return {
      left: Math.min(acc.left, r.left),
      top: Math.min(acc.top, r.top),
      right: Math.max(acc.right, r.right),
      bottom: Math.max(acc.bottom, r.bottom),
    };
  }, null);
}

function selectNotesInScreenRect(rect, additive) {
  if (!additive) unhighlightSelection();
  const kept = additive ? [...noteSelection] : [];
  const picked = [];
  allNoteElements().forEach((el) => {
    const r = abselemScreenRect(el.abselem);
    if (!r) return;
    const hits = r.left <= rect.right && r.right >= rect.left && r.top <= rect.bottom && r.bottom >= rect.top;
    if (!hits) return;
    if (kept.some((n) => n.start === el.startChar && n.end === el.endChar)) return;
    picked.push({ start: el.startChar, end: el.endChar, abselem: el.abselem });
  });

  noteSelection = [...kept, ...picked];
  noteSelection.forEach((n) => {
    try {
      if (n.abselem && n.abselem.highlight) n.abselem.highlight();
    } catch {
      /* the SVG may have been replaced by a re-render */
    }
  });
  return picked.length;
}

scoreContainer.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !visualObj) return;
  if (armedPalette) return; // a click here places the armed chip instead
  if (e.target.closest("[data-index]")) return; // a note: abcjs's own drag
  if (e.target.closest(".staff-mute-btn")) return;

  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;

  const onMove = (ev) => {
    if (!dragging && Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
    dragging = true;
    const left = Math.min(startX, ev.clientX);
    const top = Math.min(startY, ev.clientY);
    selectBandEl.style.left = `${left}px`;
    selectBandEl.style.top = `${top}px`;
    selectBandEl.style.width = `${Math.abs(ev.clientX - startX)}px`;
    selectBandEl.style.height = `${Math.abs(ev.clientY - startY)}px`;
    selectBandEl.hidden = false;
  };

  const onUp = (ev) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    selectBandEl.hidden = true;
    if (!dragging) return;
    const rect = {
      left: Math.min(startX, ev.clientX),
      right: Math.max(startX, ev.clientX),
      top: Math.min(startY, ev.clientY),
      bottom: Math.max(startY, ev.clientY),
    };
    const count = selectNotesInScreenRect(rect, ev.ctrlKey || ev.metaKey || ev.shiftKey);
    suppressNextBackgroundClear = true;
    if (count) flashPlaybackStatus(`${noteSelection.length} nota(s) seleccionada(s).`);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// ===================== Per-staff mute =====================
//
// Stored in the ABC itself (as a plain "%" comment, which every ABC parser
// ignores) so it survives saving, reopening and exporting, instead of living
// in a bit of browser state that a reload would lose.

const MUTE_LINE_RE = /^%partis-mute\b(.*)$/m;

function getMutedVoices(abc) {
  const m = abc.match(MUTE_LINE_RE);
  return m
    ? m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function setMutedVoices(abc, ids) {
  const lines = abc.split("\n").filter((l) => !/^%partis-mute\b/.test(l));
  if (!ids.length) return lines.join("\n");
  const { keyLineIdx } = parseAbcHeaders(lines.join("\n"));
  const line = `%partis-mute ${ids.join(",")}`;
  if (keyLineIdx === -1) return [line, ...lines].join("\n");
  lines.splice(keyLineIdx + 1, 0, line);
  return lines.join("\n");
}

function toggleVoiceMute(voiceId) {
  const muted = getMutedVoices(currentAbc);
  const next = muted.includes(voiceId) ? muted.filter((id) => id !== voiceId) : [...muted, voiceId];
  setAbc(setMutedVoices(currentAbc, next));
  flashPlaybackStatus(next.includes(voiceId) ? "Pentagrama silenciado." : "Pentagrama activado.");
}

// abcjs's synth takes the muted staves as indices into its flattened voice
// array, which follows the order the V: headers appear in.
function mutedVoiceIndices() {
  const { voices } = parseAbcHeaders(currentAbc);
  const muted = getMutedVoices(currentAbc);
  return voices.map((v, i) => (muted.includes(v.id) ? i : -1)).filter((i) => i >= 0);
}

// A speaker button drawn at the start of each staff of the FIRST system - the
// staves repeat on every system, and one toggle per voice is enough.
//
// They live in the sheet, not in the score container: abcjs sets
// overflow:hidden on its own render target, which would clip anything placed
// to the left of the staff.
function renderStaffMuteButtons() {
  sheetEl.querySelectorAll(".staff-mute-btn").forEach((el) => el.remove());
  const svg = scoreContainer.querySelector("svg");
  if (!svg || !visualObj || !visualObj.lines || !visualObj.lines.length) return;

  const { voices } = parseAbcHeaders(currentAbc);
  if (!voices.length) return;
  const muted = getMutedVoices(currentAbc);
  const topLineEls = [...svg.querySelectorAll(".abcjs-top-line")];
  const staffCount = Math.min((visualObj.lines[0].staff || []).length, voices.length);
  const sheetRect = sheetEl.getBoundingClientRect();
  const labels = [...svg.querySelectorAll("text")];

  for (let i = 0; i < staffCount; i++) {
    const topLineEl = topLineEls[i];
    if (!topLineEl) continue;
    const group = topLineEl.parentElement || topLineEl;
    const rect = group.getBoundingClientRect();
    const voice = voices[i];
    const isMuted = muted.includes(voice.id);

    // abcjs prints the voice name in the margin to the left of the staff, so
    // start from whatever is leftmost on this staff's row - otherwise the
    // button would land on top of the name.
    let anchorLeft = rect.left;
    labels.forEach((label) => {
      const r = label.getBoundingClientRect();
      const centre = r.top + r.height / 2;
      if (r.right <= rect.left && centre > rect.top - 8 && centre < rect.bottom + 8) {
        anchorLeft = Math.min(anchorLeft, r.left);
      }
    });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `staff-mute-btn${isMuted ? " is-muted" : ""}`;
    btn.textContent = isMuted ? "🔇" : "🔊";
    btn.title = `${isMuted ? "Activar el sonido de" : "Silenciar"} ${voice.name || `Voz ${voice.id}`}`;
    btn.style.left = `${Math.max(2, anchorLeft - sheetRect.left - 26)}px`;
    btn.style.top = `${rect.top - sheetRect.top + rect.height / 2 - 11}px`;
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("contextmenu", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVoiceMute(voice.id);
    });
    sheetEl.appendChild(btn);
  }
}

// ===================== Percussion =====================
//
// A drum staff is a normal voice with clef=perc on MIDI channel 10, plus a
// %%MIDI drummap line per line/space saying which General MIDI percussion
// sound that position plays.

const DRUM_KIT = [
  { pitch: "F", midi: 36, label: "Bombo" },
  { pitch: "c", midi: 38, label: "Caja" },
  { pitch: "d", midi: 41, label: "Tom grave" },
  { pitch: "e", midi: 45, label: "Tom medio" },
  { pitch: "g", midi: 42, label: "Charles cerrado" },
  { pitch: "a", midi: 46, label: "Charles abierto" },
  { pitch: "b", midi: 49, label: "Platillo" },
];

function scoreHasPercussion() {
  return parseAbcHeaders(currentAbc).voices.some((v) => v.clef === "perc");
}

function addDrumVoice() {
  const { headers, voices } = parseAbcHeaders(currentAbc);
  const ids = voices.map((v) => v.id);
  let id = "P";
  let n = 1;
  while (ids.includes(id)) {
    n += 1;
    id = `P${n}`;
  }

  const measureCount = voices.length > 0 ? countMeasures(currentAbc, voices[0].id) : 4;
  const restLine = `${Array(measureCount).fill(restsForMeasure(headers)).join(" | ")} |`;
  const block = [
    `V:${id} clef=perc name="${n === 1 ? "Batería" : `Batería ${n}`}"`,
    "%%MIDI channel 10",
    ...DRUM_KIT.map((d) => `%%MIDI drummap ${d.pitch} ${d.midi}`),
    restLine,
  ].join("\n");

  setAbc(`${currentAbc.replace(/\s*$/, "")}\n${block}\n`);
  flashPlaybackStatus("Pentagrama de percusión añadido.");
}

function setupDrumPalette() {
  const container = document.getElementById("drum-palette");
  container.innerHTML = "";
  DRUM_KIT.forEach((drum) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-chip drum-chip";
    btn.textContent = drum.label;
    btn.title = `${drum.label} - arrástralo al pentagrama de percusión`;
    btn.addEventListener("mousedown", (e) => {
      if (btn.disabled) return;
      startCustomDrag(e, {
        label: drum.label,
        onMoveOver: (dropZone, x, y) => {
          const result = computeDropInsertion(x, y);
          if (result) showNotePreviewAt(result, drum.label);
          else hideNotePreview();
        },
        onMoveLeave: hideNotePreview,
        // The vertical drop position is ignored on purpose: on a drum staff the
        // line is the instrument, and the button already says which one.
        onDrop: (dropZone, x, y) => {
          const result = computeDropInsertion(x, y);
          if (!result) return;
          insertPaletteItem(result.insertAt, "note", "2", null, { pitchToken: drum.pitch });
        },
        onClick: () => setArmedPalette({ kind: "note", duration: "2", label: drum.label, pitchToken: drum.pitch, btn }),
      });
    });
    container.appendChild(btn);
  });
}

function syncDrumGroup() {
  document.getElementById("drum-group").hidden = !scoreHasPercussion();
}

// ===================== Playback control =====================

async function togglePlayback() {
  if (!visualObj) return;
  if (!ABCJS.synth.supportsAudio()) {
    setPlaybackStatus("Este navegador no soporta reproducción de audio (Web Audio API).");
    return;
  }
  await ensureSynthControl();
  try {
    await synthControl.play();
  } catch (err) {
    console.error(err);
    setPlaybackStatus("No se pudo reproducir esta partitura.");
  }
}

// Where in the piece (in milliseconds) the note at character `charIndex`
// sounds. abcjs computes those timings for us; we just have to match the
// closest event, since a right-click can land between two notes.
function millisecondsForChar(charIndex) {
  if (!visualObj || typeof visualObj.setTiming !== "function") return 0;
  try {
    visualObj.setTiming(0, 0);
  } catch {
    return 0;
  }
  let best = null;
  let bestDistance = Infinity;
  (visualObj.noteTimings || []).forEach((ev) => {
    if (ev.type !== "event") return;
    const chars = ev.startCharArray && ev.startCharArray.length ? ev.startCharArray : [ev.startChar];
    chars.forEach((c) => {
      if (typeof c !== "number") return;
      const distance = Math.abs(c - charIndex);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ev;
      }
    });
  });
  return best ? best.milliseconds : 0;
}

async function playFromChar(charIndex) {
  if (!visualObj) return;
  if (!ABCJS.synth.supportsAudio()) {
    setPlaybackStatus("Este navegador no soporta reproducción de audio (Web Audio API).");
    return;
  }
  await ensureSynthControl();
  try {
    if (synthControl.isStarted) await synthControl.pause();
    // seek() only works once the audio buffer exists, so make sure the tune is
    // loaded before jumping - otherwise it would silently restart from zero.
    if (!synthControl.isLoaded) await synthControl.go();
    synthControl.seek(millisecondsForChar(charIndex) / 1000, "seconds");
    await synthControl.play();
  } catch (err) {
    console.error(err);
    setPlaybackStatus("No se pudo reproducir desde ese punto.");
  }
}

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
  if (!enabled) clearArmedPalette();
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

  if (document.activeElement !== propTitleInput) propTitleInput.value = headers.T;
  if (document.activeElement !== propHeaderInput) propHeaderInput.value = getDirectiveValue(currentAbc, "header");
  if (document.activeElement !== propFooterInput) propFooterInput.value = getDirectiveValue(currentAbc, "footer");

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
    perc: "Percusión",
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
        { label: "Añadir voz en este pentagrama", onClick: () => addVoiceToSameStaff(voice.id) },
        { separator: true },
        { label: "Eliminar pentagrama", danger: true, onClick: () => removeVoice(voice.id) },
      ]);
    });

    row.appendChild(top);
    row.appendChild(bottom);
    voiceListEl.appendChild(row);
  });
}

propTitleInput.addEventListener("change", () => setAbc(replaceHeaderLine(currentAbc, "T", propTitleInput.value.trim() || "Sin título")));
propHeaderInput.addEventListener("change", () => setAbc(setDirectiveValue(currentAbc, "header", propHeaderInput.value)));
propFooterInput.addEventListener("change", () => setAbc(setDirectiveValue(currentAbc, "footer", propFooterInput.value)));
propKeySelect.addEventListener("change", () => setAbc(replaceHeaderLine(currentAbc, "K", propKeySelect.value)));
propTimeSelect.addEventListener("change", () => {
  const updated = replaceHeaderLine(currentAbc, "M", propTimeSelect.value);
  const { headers } = parseAbcHeaders(updated);
  setAbc(resizeBlankRestsToNewMeter(updated, headers));
});
propTempoInput.addEventListener("change", () => {
  const bpm = parseInt(propTempoInput.value, 10) || 120;
  setAbc(replaceHeaderLine(currentAbc, "Q", `1/4=${bpm}`));
});
addVoiceBtn.addEventListener("click", addVoice);
document.getElementById("add-drum-voice-btn").addEventListener("click", addDrumVoice);

// ---------- Toolbar actions that work on the current selection ----------

function requireSelection() {
  if (noteSelection.length === 0) {
    flashPlaybackStatus("Selecciona antes una o varias notas en la partitura.");
    return false;
  }
  return true;
}

document.querySelectorAll("#chord-palette [data-steps]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!requireSelection()) return;
    applyToSelection((token) => addChordNote(token, parseInt(btn.dataset.steps, 10)));
  });
});

document.getElementById("merge-chord-btn").addEventListener("click", mergeSelectionIntoChord);
document.getElementById("split-chord-btn").addEventListener("click", () => {
  if (!requireSelection()) return;
  applyToSelection(removeChordNote);
});

// The two "apply a mark" selects act like buttons: pick a value, it lands on
// the selection, and they reset so the same one can be applied twice.
function wireMarkSelect(id) {
  const select = document.getElementById(id);
  select.addEventListener("change", () => {
    const value = select.value;
    select.value = "";
    if (!value) return;
    if (!requireSelection()) return;
    applyToSelection((token) => addDecoration(token, value));
  });
}
wireMarkSelect("dynamic-select");
wireMarkSelect("articulation-select");

document.getElementById("copy-btn").addEventListener("click", copySelection);
document.getElementById("cut-btn").addEventListener("click", cutSelection);
document.getElementById("paste-btn").addEventListener("click", pasteAtSelectionOrCursor);
document.getElementById("slur-btn").addEventListener("click", slurSelection);
document.getElementById("select-all-btn").addEventListener("click", selectAllNotes);

document.getElementById("ending1-btn").addEventListener("click", () => insertAtCursor("|1 "));
document.getElementById("ending2-btn").addEventListener("click", () => insertAtCursor(":|2 "));

// Apply the size chosen in "Grupo especial" directly to whatever notes are
// currently selected - the select itself only arms sizes for NEW notes as
// you place them (see applyTupletMarker), this is the equivalent for notes
// already on the page.
document.getElementById("apply-tuplet-btn").addEventListener("click", () => {
  if (!requireSelection()) return;
  const size = parseInt(tupletSelect.value, 10) || 0;
  if (!size) {
    flashPlaybackStatus("Elige antes un tamaño de grupo (tresillo, cincillo...).");
    return;
  }
  makeTupletFromSelection(size);
});
document.getElementById("clear-tuplet-btn").addEventListener("click", () => {
  if (!requireSelection()) return;
  applyToSelection((token) => setTokenTuplet(token, 0));
});

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

// ===================== Undo / Redo =====================
//
// One entry per meaningful change to currentAbc. setAbc() (every button,
// drag, chord, palette placement... goes through it) pushes the state it's
// REPLACING onto the undo stack before applying the new one, and clears the
// redo stack - a fresh edit invalidates whatever redo would have replayed.
// Typing directly in the ABC editor bypasses setAbc (see its own "input"
// listener below) and is coalesced into fewer steps there - otherwise every
// keystroke would be its own undo step - by only pushing a new entry once
// enough time has passed since the last one from that same typing burst.

const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 200;
const TYPING_COALESCE_MS = 700;
let restoringHistory = false;
let lastPushWasTyping = false;
let lastPushAt = 0;

// previousAbc is the state being replaced - callers only call this when it's
// actually about to change (see setAbc() and the textarea "input" listener).
function pushUndoPoint(previousAbc, { coalesceTyping = false } = {}) {
  if (restoringHistory) return;
  const now = Date.now();
  if (coalesceTyping && lastPushWasTyping && now - lastPushAt < TYPING_COALESCE_MS) {
    lastPushAt = now;
    return; // still the same burst of typing - the snapshot already on top covers it
  }
  undoStack.push(previousAbc);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  lastPushWasTyping = coalesceTyping;
  lastPushAt = now;
  updateUndoRedoButtons();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(currentAbc);
  const previous = undoStack.pop();
  restoringHistory = true;
  setAbc(previous);
  restoringHistory = false;
  lastPushWasTyping = false;
  updateUndoRedoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(currentAbc);
  const next = redoStack.pop();
  restoringHistory = true;
  setAbc(next);
  restoringHistory = false;
  lastPushWasTyping = false;
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

// New piece, opened score, restored version... none of those should be
// "undoable back into" the previous unrelated piece - each starts its own
// clean history.
function resetUndoHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  lastPushWasTyping = false;
  updateUndoRedoButtons();
}

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

function setAbc(newAbc) {
  const normalized = stripBlankLines(newAbc);
  if (normalized !== currentAbc) pushUndoPoint(currentAbc);
  // Any text edit invalidates the selected notes' char offsets (and the
  // re-render below replaces their abcjs elements outright), so drop the
  // selection rather than let it point at the wrong text or a dead element.
  noteSelection = [];
  currentAbc = normalized;
  abcTextarea.value = currentAbc;
  renderScore();
  syncPropertiesPanel();
  updateScoreTitleFromAbc();
  updateToolbarEnabled();
  syncDrumGroup();
  updateClipboardButtons();
  scheduleAutosave();
}

// ===================== Note editor toolbar =====================

function trackCursor() {
  cursorPos = abcTextarea.selectionStart;
}
abcTextarea.addEventListener("keyup", trackCursor);
abcTextarea.addEventListener("click", trackCursor);
abcTextarea.addEventListener("focus", trackCursor);

abcTextarea.addEventListener("input", () => {
  const newValue = abcTextarea.value;
  if (newValue !== currentAbc) pushUndoPoint(currentAbc, { coalesceTyping: true });
  currentAbc = newValue;
  cursorPos = abcTextarea.selectionStart;
  renderScore();
  syncPropertiesPanel();
  updateScoreTitleFromAbc();
  updateToolbarEnabled();
  scheduleAutosave();
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

// Add the dropped pitch to the note already under the cursor, turning it into
// a chord. Returns false when the drop didn't land on a note, so the caller
// can fall back to inserting a new one.
function stackPitchOnNoteAt(clientX, clientY, dropResult) {
  const hit = findScoreHit(clientX, clientY);
  if (!hit || hit.kind !== "note") return false;
  const parsed = parseNoteToken(currentAbc.slice(hit.startChar, hit.endChar));
  if (!parsed || isRestBody(parsed.body)) return false;

  const accidental = accidentalSelect.value;
  parsed.body = pitchesToBody([...tokenPitches(parsed.body), accidental + absoluteToAbcPitch(dropResult.pitchAbsolute)]);
  if (accidental) accidentalSelect.value = "";
  setAbc(currentAbc.slice(0, hit.startChar) + buildNoteToken(parsed) + currentAbc.slice(hit.endChar));
  return true;
}

// Plain click above/below an existing note - no palette tool needed, no
// "Apilar en acorde" checkbox needed: it's just the fastest way to harmonize
// a note you already wrote. Same duration as the note it lands on (it can
// only ever be a chord tone of that note, never a new one of its own), and
// whatever accidental is currently selected in "Alteración" applies to it
// exactly like it would to a freshly placed note - so it's just as easy to
// alter as the note it's attached to, both now and later (its own notehead
// can be right-clicked afterwards like any other).
// Clicking close enough to a pitch the chord already has just selects it
// instead of stacking a redundant duplicate.
function addChordToneAtClick(clientX, clientY) {
  const hit = findScoreHit(clientX, clientY);
  if (!hit || hit.kind !== "note") return false;
  const result = computeDropInsertion(clientX, clientY);
  if (!result) return false;
  const parsed = parseNoteToken(currentAbc.slice(hit.startChar, hit.endChar));
  if (!parsed || isRestBody(parsed.body)) return false;
  const alreadyThere = tokenPitches(parsed.body).some((p) => abcTokenToAbsolute(p) === result.pitchAbsolute);
  if (alreadyThere) return false;
  return stackPitchOnNoteAt(clientX, clientY, result);
}

// Duration/rest palette: drag onto the score to place a note/rest exactly
// where dropped (pitch = vertical position, time = horizontal position);
// a plain click instead arms the chip - see setArmedPalette() - so the next
// click on the score places it there.
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
          // "Apilar en acorde": dropping onto an existing note adds this pitch
          // to it (a double note) instead of writing a new one beside it.
          if (kind === "note" && document.getElementById("chord-mode").checked && stackPitchOnNoteAt(x, y, result)) return;
          insertPaletteItem(result.insertAt, kind, duration, result.pitchAbsolute);
        },
        // A plain click (no drag) arms this chip instead of inserting right
        // away: click on the staff afterward to place it there.
        onClick: () => setArmedPalette({ kind, duration, label: btn.textContent, pitchToken: null, btn }),
      });
    });
  });
}
setupNotePalette();
setupDrumPalette();
updateClipboardButtons();

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
  const inserted = currentAbc.slice(0, dropResult.insertAt) + token + currentAbc.slice(dropResult.insertAt);
  if (field !== "K") {
    setAbc(inserted);
    return;
  }
  // A key signature change here would otherwise silently reinterpret every
  // note after it under the new key - the same written "F" might mean F# one
  // side of it and F natural the other. Rewrite them so the key changes the
  // spelling/engraving from here on, never the actual pitch that sounds.
  const { headers } = parseAbcHeaders(currentAbc);
  const zoneStart = dropResult.insertAt + token.length;
  setAbc(preserveSoundAcrossKeyChange(inserted, zoneStart, headers.K, value));
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
document.getElementById("final-barline-btn").addEventListener("click", () => insertAtCursor("|] "));

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
    resetUndoHistory();
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
  resetUndoHistory();
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

async function downloadMusicXml() {
  try {
    const data = await renderCurrentAbc();
    downloadText("partitura.musicxml", data.musicxml, "application/vnd.recordare.musicxml+xml");
  } catch (err) {
    setStatus(`Error al exportar: ${err.message}`, true);
  }
}

async function downloadMidi() {
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
}

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
      resetUndoHistory();
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

// Shared by the score menu's "Guardar" item and autosave. `confirmOverwrite` asks first
// when this would overwrite an already-saved piece (autosave skips that -
// asking on every tick would defeat the point) - either way, the previous
// content isn't lost: the backend archives it as a version before
// overwriting (see scores_service.save_score). `silent` skips the title
// prompt and the "Guardada..." status message, for autosave again.
async function saveScore({ confirmOverwrite = false, silent = false } = {}) {
  if (!currentAbc.trim()) return false;
  const { headers } = parseAbcHeaders(currentAbc);
  const proposed = (headers.T || "").trim() || "Sin título";
  let finalTitle = proposed;

  if (!silent) {
    const title = window.prompt("Título de la partitura:", proposed);
    if (title === null) return false; // cancelled
    finalTitle = title.trim() || "Sin título";
    // Keep the ABC's own T: header in sync with whatever was confirmed here,
    // so the title shown on the score matches what's shown in the library.
    if (finalTitle !== proposed) setAbc(replaceHeaderLine(currentAbc, "T", finalTitle));
  }

  if (confirmOverwrite && currentScoreId) {
    const ok = window.confirm(
      `Vas a sobrescribir "${finalTitle}". Se guardará automáticamente una versión con el contenido anterior antes de sobrescribir. ¿Continuar?`
    );
    if (!ok) return false;
  }

  try {
    const data = await parseAuthResponse(
      await authFetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: finalTitle, abc: currentAbc, score_id: currentScoreId }),
      })
    );
    currentScoreId = data.id;
    lastAutosavedAbc = currentAbc;
    if (!silent) setStatus(`Guardada "${data.title}".`);
    return true;
  } catch (err) {
    if (!silent) setStatus(`Error al guardar: ${err.message}`, true);
    return false;
  }
}

// Every time "Guardar" overwrites an already-saved score, the backend
// archives what was there before (see scores_service.save_score) - this is
// just a way to browse and reopen those snapshots, the same "Abrir"
// interaction the library panel already uses for whole scores.
async function showVersionsMenu() {
  if (!currentScoreId) {
    setStatus("Guarda la partitura al menos una vez para tener versiones.", true);
    return;
  }
  let versions;
  try {
    versions = await parseAuthResponse(await authFetch(`/api/scores/${currentScoreId}/versions`));
  } catch (err) {
    setStatus(`Error al listar versiones: ${err.message}`, true);
    return;
  }
  if (!versions.length) {
    setStatus("Esta partitura todavía no tiene versiones anteriores guardadas.");
    return;
  }
  const rect = appMenuBtn.getBoundingClientRect();
  showContextMenu(
    rect.left,
    rect.bottom + 4,
    versions.map((v) => ({
      label: `${formatScoreDate(v.created_at)} · ${v.created_by_username || "?"}`,
      onClick: async () => {
        try {
          const full = await parseAuthResponse(await authFetch(`/api/scores/${currentScoreId}/versions/${v.id}`));
          setAbc(full.abc);
          resetUndoHistory();
          setStatus(`Versión del ${formatScoreDate(v.created_at)} cargada - pulsa Guardar para conservarla.`);
        } catch (err) {
          setStatus(`Error al abrir la versión: ${err.message}`, true);
        }
      },
    }))
  );
}

// Checkpoint whatever's in the editor right now as a version of its own,
// without touching the "official" saved copy (unlike Guardar, which always
// updates it) - so you can keep iterating without losing this exact state.
async function createNewVersion() {
  if (!currentScoreId) {
    setStatus("Guarda la partitura al menos una vez para poder crear versiones.", true);
    return;
  }
  if (!currentAbc.trim()) return;
  const { headers } = parseAbcHeaders(currentAbc);
  const title = (headers.T || "").trim() || "Sin título";
  try {
    await parseAuthResponse(
      await authFetch(`/api/scores/${currentScoreId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, abc: currentAbc }),
      })
    );
    setStatus("Nueva versión guardada, sin tocar la partitura ya guardada.");
  } catch (err) {
    setStatus(`Error al crear la versión: ${err.message}`, true);
  }
}

// ===================== Autosave =====================
//
// Off by default, remembered per browser like the metronome used to be. While
// on, it silently re-runs the same save Guardar would (title from the ABC's
// own T:, same score_id) shortly after an edit settles down - never on every
// single keystroke, and never while there's nothing to save yet (before the
// first manual Guardar) or nothing has actually changed since the last save.

const AUTOSAVE_DEBOUNCE_MS = 15000;
let autosaveOn = false;
let autosaveTimer = null;
let lastAutosavedAbc = null;

function scheduleAutosave() {
  if (!autosaveOn || !currentScoreId) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (!autosaveOn || !currentScoreId || currentAbc === lastAutosavedAbc) return;
    const ok = await saveScore({ confirmOverwrite: false, silent: true });
    if (ok) flashPlaybackStatus("Autoguardado.", 1200);
  }, AUTOSAVE_DEBOUNCE_MS);
}

function setAutosave(on) {
  autosaveOn = on;
  appMenuBtn.classList.toggle("is-on", on);
  saveStoredState("partis.autosave", { on });
  if (on) {
    if (!currentScoreId) {
      setStatus("Autoguardado activado - se guardará en cuanto guardes esta partitura por primera vez.");
    } else {
      lastAutosavedAbc = null; // an edit right after turning it on should still count
      scheduleAutosave();
    }
  } else {
    clearTimeout(autosaveTimer);
  }
}

setAutosave(!!loadStoredState("partis.autosave", { on: false }).on);

// ===================== App menu (nuevo/archivo/guardar/perfil...) =========
//
// One dropdown for everything that isn't reached for every few seconds like
// the note palette is - starting a piece, opening/saving one, versions,
// export, the account. Always available (it isn't tucked inside
// .score-actions, which only shows once a score is open), but the
// score-specific actions only show once there's actually a score to act on.

function buildAppMenu() {
  const hasScore = !!currentAbc.trim();
  return [
    {
      label: "Nuevo",
      onClick: () => {
        openPanel("panel-compose");
        closePanel("panel-library");
      },
    },
    {
      label: "Archivo (partituras guardadas)",
      onClick: () => {
        openPanel("panel-library");
        loadScoreLibrary();
      },
    },
    ...(hasScore
      ? [
          { separator: true },
          { label: "Guardar", onClick: () => saveScore({ confirmOverwrite: true }) },
          { label: "Nueva versión", onClick: createNewVersion },
          { label: "Versiones", onClick: showVersionsMenu },
          { separator: true },
          {
            label: autosaveOn ? "Autoguardado: activado ✓" : "Autoguardado: desactivado",
            onClick: () => setAutosave(!autosaveOn),
          },
          { separator: true },
          { label: "Descargar MusicXML", onClick: downloadMusicXml },
          { label: "Descargar MIDI", onClick: downloadMidi },
        ]
      : []),
    { separator: true },
    { label: "Perfil", onClick: showProfileInfo },
    { label: "Cerrar sesión", onClick: signOut },
  ];
}

appMenuBtn.addEventListener("click", (e) => {
  // Same reasoning as the submenu buttons inside showContextMenu(): this
  // click is still bubbling when the menu opens, and would otherwise reach
  // the document-level "click outside closes the menu" listener right after
  // and immediately close what was just opened.
  e.stopPropagation();
  const rect = appMenuBtn.getBoundingClientRect();
  showContextMenu(rect.left, rect.bottom + 4, buildAppMenu());
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

document.getElementById("admin-logout-btn").addEventListener("click", signOut);

// A quick read-only look at who's signed in - organization name included,
// since GET /org/me works for any role with a tenant (director/admin/
// musico alike), not just the two that get their own management panel.
async function showProfileInfo() {
  if (!authState) return;
  const lines = [`Usuario: ${authState.username}`, `Rol: ${ROLE_LABELS[authState.role] || authState.role}`];
  try {
    const org = await parseAuthResponse(await authFetch("/api/auth/org/me"));
    lines.push(`Organización: ${org.name}`);
  } catch {
    /* app_admin has no organization - nothing to add */
  }
  window.alert(lines.join("\n"));
}

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
