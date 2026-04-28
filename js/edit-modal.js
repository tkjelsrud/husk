import { updateEntry, markEntryDone, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';

let dialog = null;
let textField = null;
let categoryField = null;
let statusEl = null;
let saveButton = null;
let doneButton = null;
let currentEntryId = null;
let pendingOnSave = null;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.innerHTML = `
    <div class="edit-dialog-inner">
      <h2 class="h5 mb-3">Rediger</h2>
      <div id="edit-status" class="alert d-none" role="alert"></div>
      <label class="form-label" for="edit-text">Tekst</label>
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
        </select>
      </div>
      <div class="edit-dialog-footer mt-4">
        <button type="button" id="edit-cancel" class="btn btn-link text-muted">Avbryt</button>
        <button type="button" id="edit-done" class="btn btn-outline-secondary">Ferdig</button>
        <button type="button" id="edit-save" class="btn btn-dark">Lagre</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  textField = dialog.querySelector('#edit-text');
  categoryField = dialog.querySelector('#edit-category');
  statusEl = dialog.querySelector('#edit-status');
  saveButton = dialog.querySelector('#edit-save');
  doneButton = dialog.querySelector('#edit-done');

  dialog.querySelector('#edit-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  saveButton.addEventListener('click', handleSave);
  doneButton.addEventListener('click', handleMarkDone);
}

function showStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${kind}`;
  statusEl.classList.remove('d-none');
}

async function handleMarkDone() {
  doneButton.disabled = true;
  saveButton.disabled = true;
  try {
    await markEntryDone(currentEntryId);
    dialog.close();
    if (pendingOnSave) pendingOnSave();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke markere som ferdig.');
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
      category
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

export function openEditModal(entry, onSave) {
  if (!dialog) buildDialog();
  currentEntryId = entry.id;
  pendingOnSave = onSave;
  textField.value = entry.textInput || '';
  categoryField.value = entry.category || 'unknown';
  statusEl.classList.add('d-none');
  saveButton.disabled = false;
  doneButton.disabled = false;
  doneButton.classList.toggle('d-none', entry.done === true);
  dialog.showModal();
  textField.focus();
  textField.setSelectionRange(textField.value.length, textField.value.length);
}
