import { updateEntry, markEntryDone, markEntryNotDone, markEntryLater, markEntryNotLater, ENTRY_CATEGORIES } from './db.js';
import { openEntryDetailsModal } from './entry-details-modal.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';

const TOUCH_COLORS = ['', '#c9a030', '#93b62d', '#52a840', '#3a9050', '#267a38'];

let dialog = null;
let textField = null;
let categoryField = null;
let statusEl = null;
let saveButton = null;
let doneButton = null;
let laterButton = null;
let detailsButton = null;
let touchDotsEl = null;
let currentEntryId = null;
let currentEntryDone = false;
let currentEntryLater = false;
let currentTouches = 0;
let currentEntry = null;
let pendingOnSave = null;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.innerHTML = `
    <div class="edit-dialog-inner">
      <div class="edit-dialog-topbar">
        <button type="button" id="edit-details" class="btn btn-link edit-details-link">Detaljer</button>
      </div>
      <div id="edit-status" class="alert d-none" role="alert"></div>
      <textarea id="edit-text" class="form-control" rows="5" maxlength="1500"></textarea>
      <div class="mt-3">
        <label class="form-label" for="edit-category">Kategori</label>
        <select id="edit-category" class="form-select">
          <option value="unknown">Ukjent</option>
          <option value="work">Jobb</option>
          <option value="creative">Kreativt</option>
          <option value="houseproj">Houseproj</option>
          <option value="family">Familie</option>
          <option value="general">Generelt</option>
          <option value="huskmcp">Husk MCP</option>
          <option value="axiom">Aksiomat</option>
        </select>
      </div>
      <div class="edit-dialog-footer mt-4">
        <div class="d-flex align-items-center gap-2">
          <button type="button" id="edit-later" class="btn btn-outline-secondary">Utsett</button>
          <div class="touch-dot-row" id="edit-touch-dots" role="group" aria-label="Fremgang">
            <button class="touch-dot-btn" data-dot="1" type="button" aria-label="1"></button>
            <button class="touch-dot-btn" data-dot="2" type="button" aria-label="2"></button>
            <button class="touch-dot-btn" data-dot="3" type="button" aria-label="3"></button>
            <button class="touch-dot-btn" data-dot="4" type="button" aria-label="4"></button>
            <button class="touch-dot-btn" data-dot="5" type="button" aria-label="5"></button>
          </div>
        </div>
        <div class="d-flex gap-2">
          <button type="button" id="edit-done" class="btn btn-outline-secondary">Ferdig</button>
          <button type="button" id="edit-save" class="btn btn-dark">Lukk</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  textField = dialog.querySelector('#edit-text');
  categoryField = dialog.querySelector('#edit-category');
  statusEl = dialog.querySelector('#edit-status');
  saveButton = dialog.querySelector('#edit-save');
  doneButton = dialog.querySelector('#edit-done');
  laterButton = dialog.querySelector('#edit-later');
  detailsButton = dialog.querySelector('#edit-details');
  touchDotsEl = dialog.querySelector('#edit-touch-dots');

  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  saveButton.addEventListener('click', handleSave);
  doneButton.addEventListener('click', handleMarkDone);
  laterButton.addEventListener('click', handleMarkLater);
  detailsButton.addEventListener('click', handleDetails);
  touchDotsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.touch-dot-btn');
    if (!btn) return;
    const dot = parseInt(btn.dataset.dot, 10);
    currentTouches = currentTouches === dot ? 0 : dot;
    updateTouchDots();
  });
}

function updateTouchDots() {
  const buttons = touchDotsEl.querySelectorAll('.touch-dot-btn');
  const color = TOUCH_COLORS[currentTouches] || '';
  buttons.forEach((btn, i) => {
    if (i < currentTouches) {
      btn.style.background = color;
      btn.classList.add('filled');
    } else {
      btn.style.background = '';
      btn.classList.remove('filled');
    }
  });
}

function showStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${kind}`;
  statusEl.classList.remove('d-none');
}

async function handleMarkLater() {
  laterButton.disabled = true;
  saveButton.disabled = true;
  try {
    if (currentEntryLater) {
      await markEntryNotLater(currentEntryId);
    } else {
      await markEntryLater(currentEntryId);
    }
    dialog.close();
    if (pendingOnSave) pendingOnSave();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke oppdatere.');
    laterButton.disabled = false;
    saveButton.disabled = false;
  }
}

async function handleMarkDone() {
  doneButton.disabled = true;
  saveButton.disabled = true;
  try {
    if (currentEntryDone) {
      // Mark as not done (back to pending)
      await markEntryNotDone(currentEntryId);
    } else {
      // Mark as done
      await markEntryDone(currentEntryId);
    }
    dialog.close();
    if (pendingOnSave) pendingOnSave();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke oppdatere status.');
    doneButton.disabled = false;
    saveButton.disabled = false;
  }
}

async function handleSave() {
  const rawText = textField.value;
  const category = categoryField.value;

  const textValidation = validateEntryText(rawText);
  if (!textValidation.ok) {
    showStatus('danger', textValidation.message);
    return;
  }

  const categoryValidation = validateCategory(category, ENTRY_CATEGORIES);
  if (!categoryValidation.ok) {
    showStatus('danger', categoryValidation.message);
    return;
  }

  saveButton.disabled = true;
  try {
    await updateEntry(currentEntryId, {
      textInput: normalizeEntryText(rawText),
      category,
      touches: currentTouches,
    });
    dialog.close();
    if (pendingOnSave) pendingOnSave();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke lagre.');
  } finally {
    saveButton.disabled = false;
  }
}

function handleDetails() {
  if (!currentEntry) return;
  dialog.close();
  openEntryDetailsModal(currentEntry, pendingOnSave);
}

export function openEditModal(entry, onSave) {
  if (!dialog) buildDialog();
  currentEntry = entry;
  currentEntryId = entry.id;
  currentEntryDone = entry.done === true;
  currentEntryLater = entry.later === true;
  currentTouches = Number(entry.meta?.touches) || 0;
  pendingOnSave = onSave;
  textField.value = entry.textInput || '';
  categoryField.value = entry.category || 'unknown';
  updateTouchDots();
  statusEl.classList.add('d-none');
  saveButton.disabled = false;
  doneButton.disabled = false;
  laterButton.disabled = false;
  detailsButton.disabled = false;

  if (currentEntryDone) {
    doneButton.textContent = 'Marker som uferdig';
    doneButton.className = 'btn btn-outline-warning';
  } else {
    doneButton.textContent = 'Ferdig';
    doneButton.className = 'btn btn-done-action';
  }

  if (currentEntryLater) {
    laterButton.textContent = 'Fjern utsettelse';
    laterButton.className = 'btn btn-outline-warning';
  } else {
    laterButton.textContent = 'Utsett';
    laterButton.className = 'btn btn-outline-secondary';
  }
  
  dialog.showModal();
  textField.focus();
  textField.setSelectionRange(textField.value.length, textField.value.length);
}
