import { logout, requireAuth } from './auth.js';
import { createLine, createNote, deleteNote, newNoteId, subscribeNotes, updateNote } from './tavle-db.js';

// World coordinates are stored relative to the centre of the board, so the
// board can grow later without moving existing boxes.
const WORLD_SIZE = 8000;
const HALF = WORLD_SIZE / 2;
const SAVE_DELAY_MS = 600;
const PAN_THRESHOLD_PX = 4;
const VIEW_STORAGE_KEY = 'husk-tavle-view';

const viewport = document.getElementById('tavle-viewport');
const world = document.getElementById('tavle-world');
const statusEl = document.getElementById('tavle-status');
const toolButtons = [...document.querySelectorAll('[data-tool]')];
const userLabel = document.getElementById('user-label');
document.getElementById('logout-btn').addEventListener('click', () => logout());

world.style.width = `${WORLD_SIZE}px`;
world.style.height = `${WORLD_SIZE}px`;

let currentUser = null;
const notes = new Map(); // id -> note or line state
let tool = 'text'; // 'text' | 'line'

function setTool(next) {
  tool = next;
  world.classList.toggle('tool-line', tool === 'line');
  for (const button of toolButtons) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
toolButtons.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));

// ── Status ────────────────────────────────────────────────────────────────

let pendingSaves = 0;
let statusTimer = null;

function setStatus(text, { error = false, fade = false } = {}) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', error);
  statusEl.classList.add('is-visible');
  if (fade) statusTimer = setTimeout(() => statusEl.classList.remove('is-visible'), 1500);
}

async function trackSave(operation) {
  pendingSaves += 1;
  setStatus('Lagrer…');
  try {
    await operation();
    pendingSaves -= 1;
    if (pendingSaves === 0) setStatus('Lagret', { fade: true });
  } catch (err) {
    pendingSaves -= 1;
    console.error('Tavle save failed', err);
    setStatus('Kunne ikke lagre', { error: true });
    throw err;
  }
}

// ── Viewport position (per device convenience) ────────────────────────────

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function restoreView() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || 'null');
  } catch { /* storage unavailable */ }
  if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    viewport.scrollLeft = saved.left;
    viewport.scrollTop = saved.top;
  } else {
    // Start with the board's origin near the top-left third of the screen.
    viewport.scrollLeft = HALF - viewport.clientWidth / 3;
    viewport.scrollTop = HALF - viewport.clientHeight / 3;
  }
}

let viewSaveTimer = null;
viewport.addEventListener('scroll', () => {
  clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      }));
    } catch { /* storage unavailable */ }
  }, 250);
}, { passive: true });

// ── Notes ─────────────────────────────────────────────────────────────────

function readText(note) {
  // innerText keeps line breaks; strip the lone trailing newline browsers add.
  return note.textEl.innerText.replace(/\n$/, '');
}

function positionNote(note) {
  note.el.style.left = `${note.x + HALF}px`;
  note.el.style.top = `${note.y + HALF}px`;
}

function isEditing(note) {
  return document.activeElement === note.textEl;
}

function createNoteElement(state) {
  const el = document.createElement('div');
  el.className = 'tavle-note';

  const handle = document.createElement('div');
  handle.className = 'tavle-note-handle';
  handle.title = 'Dra for å flytte';
  handle.setAttribute('aria-hidden', 'true');

  const textEl = document.createElement('div');
  textEl.className = 'tavle-note-text';
  textEl.setAttribute('role', 'textbox');
  textEl.setAttribute('aria-multiline', 'true');
  textEl.spellcheck = false;
  // plaintext-only keeps pasted formatting out; fall back where unsupported.
  textEl.contentEditable = 'plaintext-only';
  if (textEl.contentEditable !== 'plaintext-only') textEl.contentEditable = 'true';
  textEl.textContent = state.text || '';

  el.append(handle, textEl);
  world.append(el);

  const note = {
    ...state,
    el,
    textEl,
    saveTimer: null,
    queue: Promise.resolve(),
    savedText: state.persisted ? state.text || '' : null,
  };
  notes.set(note.id, note);
  positionNote(note);

  textEl.addEventListener('input', () => scheduleSave(note));
  textEl.addEventListener('blur', () => finishEditing(note));
  textEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') textEl.blur();
  });
  textEl.addEventListener('paste', (event) => {
    if (textEl.contentEditable === 'plaintext-only') return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });
  attachDrag(note, handle);
  return note;
}

function scheduleSave(note) {
  clearTimeout(note.saveTimer);
  note.saveTimer = setTimeout(() => flushNote(note), SAVE_DELAY_MS);
}

// Saves are queued per note so a create always lands before its updates.
function flushNote(note, { allowDelete = false } = {}) {
  clearTimeout(note.saveTimer);
  note.saveTimer = null;
  note.queue = note.queue.then(async () => {
    if (note.removed) return;
    const text = readText(note);

    if (!text.trim()) {
      if (!allowDelete) return;
      removeNoteElement(note);
      if (note.persisted) await trackSave(() => deleteNote(note.id)).catch(() => {});
      return;
    }

    if (text === note.savedText) return;
    if (!note.persisted) {
      await trackSave(() => createNote(note.id, { text, x: note.x, y: note.y }, currentUser));
      note.persisted = true;
    } else {
      await trackSave(() => updateNote(note.id, { text }));
    }
    note.savedText = text;
  }).catch(() => { /* reported via status; next edit retries */ });
  return note.queue;
}

function finishEditing(note) {
  note.el.classList.remove('is-active');
  flushNote(note, { allowDelete: true });
}

function removeNoteElement(note) {
  note.removed = true;
  clearTimeout(note.saveTimer);
  note.el.remove();
  notes.delete(note.id);
}

function addNoteAt(clientX, clientY) {
  const rect = world.getBoundingClientRect();
  const x = clamp(clientX - rect.left - HALF, -HALF, HALF - 200);
  // Offset so the caret lands on the click rather than below it.
  const y = clamp(clientY - rect.top - HALF - 12, -HALF, HALF - 40);
  const note = createNoteElement({ id: newNoteId(), text: '', x, y, persisted: false });
  note.el.classList.add('is-active');
  note.textEl.focus();
}

// ── Dragging a note by its handle ─────────────────────────────────────────

function attachDrag(note, handle) {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = note.x;
    const originY = note.y;
    note.dragging = true;
    note.el.classList.add('is-dragging');

    const onMove = (moveEvent) => {
      note.x = clamp(originX + moveEvent.clientX - startX, -HALF, HALF - 200);
      note.y = clamp(originY + moveEvent.clientY - startY, -HALF, HALF - 40);
      positionNote(note);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      note.dragging = false;
      note.el.classList.remove('is-dragging');
      if (note.persisted && (note.x !== originX || note.y !== originY)) {
        note.queue = note.queue
          .then(() => trackSave(() => updateNote(note.id, { x: note.x, y: note.y })))
          .catch(() => {});
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

// ── Lines ─────────────────────────────────────────────────────────────────

const MIN_LINE_LENGTH = 8;
let selectedLine = null;

function layoutLine(line) {
  line.el.classList.toggle('is-vertical', line.orientation === 'v');
  line.el.style.left = `${line.x + HALF}px`;
  line.el.style.top = `${line.y + HALF}px`;
  if (line.orientation === 'v') {
    line.el.style.width = '';
    line.el.style.height = `${line.length}px`;
  } else {
    line.el.style.width = `${line.length}px`;
    line.el.style.height = '';
  }
}

function selectLine(line) {
  if (selectedLine && selectedLine !== line) selectedLine.el.classList.remove('is-selected');
  selectedLine = line;
  line?.el.classList.add('is-selected');
}

function removeLine(line) {
  if (selectedLine === line) selectedLine = null;
  removeNoteElement(line);
  if (line.persisted) trackSave(() => deleteNote(line.id)).catch(() => {});
}

function createLineElement(state) {
  const el = document.createElement('div');
  el.className = 'tavle-line';
  el.title = 'Dra for å flytte · Delete for å slette';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'tavle-line-remove';
  remove.setAttribute('aria-label', 'Slett linje');
  remove.textContent = '×';
  el.append(remove);
  world.append(el);

  const line = { kind: 'line', ...state, el, queue: Promise.resolve() };
  notes.set(line.id, line);
  layoutLine(line);

  remove.addEventListener('pointerdown', (event) => event.stopPropagation());
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    removeLine(line);
  });

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    document.activeElement?.blur?.();
    selectLine(line);
    el.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = line.x;
    const originY = line.y;
    line.dragging = true;

    const onMove = (moveEvent) => {
      line.x = clamp(originX + moveEvent.clientX - startX, -HALF, HALF - 1);
      line.y = clamp(originY + moveEvent.clientY - startY, -HALF, HALF - 1);
      layoutLine(line);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      line.dragging = false;
      if (line.persisted && (line.x !== originX || line.y !== originY)) {
        line.queue = line.queue
          .then(() => trackSave(() => updateNote(line.id, { x: line.x, y: line.y })))
          .catch(() => {});
      }
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  });
  return line;
}

// Drawing: drag on empty board; the line snaps to whichever axis dominates.
let drawing = null;

function worldPoint(event) {
  const rect = world.getBoundingClientRect();
  return { x: event.clientX - rect.left - HALF, y: event.clientY - rect.top - HALF };
}

function lineFromDrag(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { orientation: 'h', x: Math.min(start.x, end.x), y: start.y, length: Math.abs(dx) };
  }
  return { orientation: 'v', x: start.x, y: Math.min(start.y, end.y), length: Math.abs(dy) };
}

world.addEventListener('pointerdown', (event) => {
  if (tool !== 'line' || event.target !== world || event.button !== 0) return;
  event.preventDefault();
  selectLine(null);
  world.setPointerCapture(event.pointerId);
  const start = worldPoint(event);
  const preview = document.createElement('div');
  preview.className = 'tavle-line is-preview';
  world.append(preview);
  drawing = { id: event.pointerId, start, preview, shape: null };
});

world.addEventListener('pointermove', (event) => {
  if (!drawing || event.pointerId !== drawing.id) return;
  drawing.shape = lineFromDrag(drawing.start, worldPoint(event));
  layoutLine({ el: drawing.preview, ...drawing.shape });
});

function endDrawing(event) {
  if (!drawing || event.pointerId !== drawing.id) return;
  const { preview, shape } = drawing;
  drawing = null;
  preview.remove();
  suppressClick = true;
  if (!shape || shape.length < MIN_LINE_LENGTH) return;
  const line = createLineElement({ id: newNoteId(), ...shape, persisted: false });
  line.queue = line.queue
    .then(() => trackSave(() => createLine(line.id, shape, currentUser)))
    .then(() => { line.persisted = true; })
    .catch(() => {});
}
world.addEventListener('pointerup', endDrawing);
world.addEventListener('pointercancel', endDrawing);

document.addEventListener('keydown', (event) => {
  if (document.activeElement?.classList.contains('tavle-note-text')) return;
  if (selectedLine && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    removeLine(selectedLine);
  } else if (event.key === 'Escape') {
    selectLine(null);
    setTool('text');
  } else if (event.key === 'l' || event.key === 'L') {
    setTool(tool === 'line' ? 'text' : 'line');
  }
});

// ── Panning with the mouse, clicking to add ──────────────────────────────
// Touch and trackpads scroll natively; a mouse drag on empty space pans.

let pan = null;
let suppressClick = false;

world.addEventListener('pointerdown', (event) => {
  suppressClick = false;
  if (tool !== 'text' || event.target !== world || event.pointerType !== 'mouse' || event.button !== 0) return;
  pan = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
    moved: false,
  };
});

window.addEventListener('pointermove', (event) => {
  if (!pan || event.pointerId !== pan.id) return;
  const dx = event.clientX - pan.startX;
  const dy = event.clientY - pan.startY;
  if (!pan.moved && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
  if (!pan.moved) {
    pan.moved = true;
    world.classList.add('is-panning');
  }
  viewport.scrollLeft = pan.left - dx;
  viewport.scrollTop = pan.top - dy;
});

function endPan() {
  if (!pan) return;
  suppressClick = pan.moved;
  pan = null;
  world.classList.remove('is-panning');
}
window.addEventListener('pointerup', endPan);
window.addEventListener('pointercancel', endPan);

world.addEventListener('click', (event) => {
  if (event.target !== world) return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (selectedLine) {
    selectLine(null);
    return;
  }
  if (tool !== 'text') return;
  addNoteAt(event.clientX, event.clientY);
});

// Keep focus on the board when clicking empty space (avoids a stray caret).
world.addEventListener('mousedown', (event) => {
  if (event.target === world) event.preventDefault();
  if (document.activeElement?.classList.contains('tavle-note-text') && event.target === world) {
    document.activeElement.blur();
  }
});

world.addEventListener('focusin', (event) => {
  event.target.closest('.tavle-note')?.classList.add('is-active');
});

// ── Remote changes ────────────────────────────────────────────────────────

function applyRemoteChanges(changes) {
  for (const change of changes) {
    const existing = notes.get(change.id);

    if (change.type === 'removed') {
      if (existing && !(existing.textEl && isEditing(existing))) {
        if (selectedLine === existing) selectedLine = null;
        removeNoteElement(existing);
      }
      continue;
    }

    if (change.kind === 'line') {
      const shape = {
        orientation: change.orientation === 'v' ? 'v' : 'h',
        x: Number(change.x) || 0,
        y: Number(change.y) || 0,
        length: Number(change.length) || 0,
      };
      if (!existing) {
        createLineElement({ id: change.id, ...shape, persisted: true });
      } else if (!change.hasPendingWrites && !existing.dragging) {
        Object.assign(existing, shape, { persisted: true });
        layoutLine(existing);
      }
      continue;
    }

    if (!existing) {
      createNoteElement({
        id: change.id,
        text: change.text || '',
        x: Number(change.x) || 0,
        y: Number(change.y) || 0,
        persisted: true,
      });
      continue;
    }

    // Our own writes echo back; never clobber a box that is being edited,
    // dragged, or has unsaved keystrokes.
    if (change.hasPendingWrites || isEditing(existing) || existing.saveTimer || existing.dragging) continue;
    existing.persisted = true;
    if (typeof change.text === 'string' && change.text !== readText(existing)) {
      existing.textEl.textContent = change.text;
      existing.savedText = change.text;
    }
    const x = Number(change.x) || 0;
    const y = Number(change.y) || 0;
    if (x !== existing.x || y !== existing.y) {
      existing.x = x;
      existing.y = y;
      positionNote(existing);
    }
  }
}

// ── Flush before leaving ─────────────────────────────────────────────────

function flushAll() {
  for (const note of notes.values()) {
    if (note.kind !== 'line' && note.saveTimer) flushNote(note);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll();
});
window.addEventListener('pagehide', flushAll);
window.addEventListener('beforeunload', (event) => {
  flushAll();
  if (pendingSaves > 0) event.preventDefault();
});

// ── Init ──────────────────────────────────────────────────────────────────

requireAuth((user) => {
  document.body.classList.remove('app-auth-pending');
  document.body.classList.add('app-auth-ready');
  currentUser = user;
  userLabel.textContent = user.email || '';
  restoreView();
  subscribeNotes(applyRemoteChanges, (err) => {
    console.error('Tavle subscription failed', err);
    setStatus('Kunne ikke laste tavlen', { error: true });
  });
});
