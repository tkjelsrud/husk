import { updateFixedEntry, deleteEntry, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';

let dialog = null;
let textField = null;
let categoryField = null;
let recurrenceTypeField = null;
let weeklyOptions = null;
let monthlyOptions = null;
let yearlyOptions = null;
let dayOfMonthField = null;
let yearlyDateField = null;
let statusEl = null;
let saveButton = null;
let deleteButton = null;
let currentEntryId = null;
let pendingOnSave = null;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.innerHTML = `
    <div class="edit-dialog-inner">
      <h2 class="h5 mb-3">Rediger fast påminnelse</h2>
      <div id="fixed-edit-status" class="alert d-none" role="alert"></div>
      
      <label class="form-label" for="fixed-edit-text">Tekst</label>
      <textarea id="fixed-edit-text" class="form-control" rows="5" maxlength="1500"></textarea>
      
      <div class="mt-3">
        <label class="form-label" for="fixed-edit-category">Kategori</label>
        <select id="fixed-edit-category" class="form-select">
          <option value="unknown">Ukjent</option>
          <option value="work">Jobb</option>
          <option value="creative">Kreativt</option>
          <option value="houseproj">Houseproj</option>
          <option value="family">Familie</option>
          <option value="general">Generelt</option>
          <option value="huskmcp">Husk MCP</option>
        </select>
      </div>

      <div class="mt-3">
        <label class="form-label" for="fixed-edit-recurrence-type">Gjentagelse</label>
        <select id="fixed-edit-recurrence-type" class="form-select">
          <option value="none">Ingen (engangspåminnelse)</option>
          <option value="daily">Daglig</option>
          <option value="weekly">Ukentlig</option>
          <option value="monthly">Månedlig</option>
          <option value="yearly">Årlig</option>
        </select>
      </div>

      <div id="fixed-edit-weekly-options" class="mt-3 d-none">
        <label class="form-label">Dager</label>
        <div class="d-flex flex-wrap gap-2">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-1" value="1">
            <label class="form-check-label" for="fixed-edit-day-1">Man</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-2" value="2">
            <label class="form-check-label" for="fixed-edit-day-2">Tir</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-3" value="3">
            <label class="form-check-label" for="fixed-edit-day-3">Ons</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-4" value="4">
            <label class="form-check-label" for="fixed-edit-day-4">Tor</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-5" value="5">
            <label class="form-check-label" for="fixed-edit-day-5">Fre</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-6" value="6">
            <label class="form-check-label" for="fixed-edit-day-6">Lør</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fixed-edit-day-0" value="0">
            <label class="form-check-label" for="fixed-edit-day-0">Søn</label>
          </div>
        </div>
      </div>

      <div id="fixed-edit-monthly-options" class="mt-3 d-none">
        <label class="form-label" for="fixed-edit-day-of-month">Dag i måneden (1-31)</label>
        <input type="number" id="fixed-edit-day-of-month" class="form-control" min="1" max="31">
      </div>

      <div id="fixed-edit-yearly-options" class="mt-3 d-none">
        <label class="form-label" for="fixed-edit-yearly-date">Dato (MM-DD)</label>
        <input type="text" id="fixed-edit-yearly-date" class="form-control" pattern="\\d{2}-\\d{2}">
        <small class="form-text text-muted">Format: MM-DD (f.eks. 05-17 for 17. mai)</small>
      </div>
      
      <div class="edit-dialog-footer mt-4">
        <button type="button" id="fixed-edit-delete" class="btn btn-link text-danger">Slett</button>
        <button type="button" id="fixed-edit-cancel" class="btn btn-link text-muted">Avbryt</button>
        <button type="button" id="fixed-edit-save" class="btn btn-dark">Lagre</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  textField = dialog.querySelector('#fixed-edit-text');
  categoryField = dialog.querySelector('#fixed-edit-category');
  recurrenceTypeField = dialog.querySelector('#fixed-edit-recurrence-type');
  weeklyOptions = dialog.querySelector('#fixed-edit-weekly-options');
  monthlyOptions = dialog.querySelector('#fixed-edit-monthly-options');
  yearlyOptions = dialog.querySelector('#fixed-edit-yearly-options');
  dayOfMonthField = dialog.querySelector('#fixed-edit-day-of-month');
  yearlyDateField = dialog.querySelector('#fixed-edit-yearly-date');
  statusEl = dialog.querySelector('#fixed-edit-status');
  saveButton = dialog.querySelector('#fixed-edit-save');
  deleteButton = dialog.querySelector('#fixed-edit-delete');

  dialog.querySelector('#fixed-edit-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  saveButton.addEventListener('click', handleSave);
  deleteButton.addEventListener('click', handleDelete);
  
  recurrenceTypeField.addEventListener('change', () => {
    const type = recurrenceTypeField.value;
    weeklyOptions.classList.toggle('d-none', type !== 'weekly');
    monthlyOptions.classList.toggle('d-none', type !== 'monthly');
    yearlyOptions.classList.toggle('d-none', type !== 'yearly');
  });
}

function showStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${kind}`;
  statusEl.classList.remove('d-none');
}

function parseRecurrence() {
  const type = recurrenceTypeField.value;
  const recurrence = { type };

  if (type === 'weekly') {
    const days = [];
    for (let i = 0; i <= 6; i++) {
      const checkbox = dialog.querySelector(`#fixed-edit-day-${i}`);
      if (checkbox && checkbox.checked) {
        days.push(parseInt(checkbox.value));
      }
    }
    recurrence.daysOfWeek = days;
  } else if (type === 'monthly') {
    const day = parseInt(dayOfMonthField.value);
    if (day >= 1 && day <= 31) {
      recurrence.dayOfMonth = day;
    }
  } else if (type === 'yearly') {
    const dateStr = yearlyDateField.value.trim();
    if (/^\d{2}-\d{2}$/.test(dateStr)) {
      recurrence.date = dateStr;
    }
  }

  return recurrence;
}

function validateRecurrence(recurrence) {
  if (recurrence.type === 'weekly' && (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0)) {
    return { ok: false, message: 'Velg minst én dag for ukentlig gjentagelse.' };
  }
  if (recurrence.type === 'monthly' && !recurrence.dayOfMonth) {
    return { ok: false, message: 'Angi dag i måneden (1-31).' };
  }
  if (recurrence.type === 'yearly' && !recurrence.date) {
    return { ok: false, message: 'Angi dato i format MM-DD.' };
  }
  return { ok: true };
}

async function handleDelete() {
  if (!confirm('Er du sikker på at du vil slette denne påminnelsen?')) {
    return;
  }
  
  deleteButton.disabled = true;
  saveButton.disabled = true;
  try {
    await deleteEntry(currentEntryId);
    dialog.close();
    if (pendingOnSave) pendingOnSave();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke slette.');
    deleteButton.disabled = false;
    saveButton.disabled = false;
  }
}

async function handleSave() {
  const rawText = textField.value;
  const category = categoryField.value;
  const recurrence = parseRecurrence();

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

  const recurrenceValidation = validateRecurrence(recurrence);
  if (!recurrenceValidation.ok) {
    showStatus('danger', recurrenceValidation.message);
    return;
  }

  saveButton.disabled = true;
  try {
    await updateFixedEntry(currentEntryId, {
      textInput: normalizeEntryText(rawText),
      category,
      recurrence
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

export function openFixedEditModal(entry, onSave) {
  if (!dialog) buildDialog();
  currentEntryId = entry.id;
  pendingOnSave = onSave;
  textField.value = entry.textInput || '';
  categoryField.value = entry.category || 'unknown';
  
  // Set recurrence
  const recurrence = entry.recurrence || { type: 'none' };
  recurrenceTypeField.value = recurrence.type || 'none';
  
  // Clear all checkboxes and fields
  for (let i = 0; i <= 6; i++) {
    const checkbox = dialog.querySelector(`#fixed-edit-day-${i}`);
    if (checkbox) checkbox.checked = false;
  }
  dayOfMonthField.value = '';
  yearlyDateField.value = '';
  
  // Set recurrence values
  if (recurrence.type === 'weekly' && recurrence.daysOfWeek) {
    recurrence.daysOfWeek.forEach(day => {
      const checkbox = dialog.querySelector(`#fixed-edit-day-${day}`);
      if (checkbox) checkbox.checked = true;
    });
  } else if (recurrence.type === 'monthly' && recurrence.dayOfMonth) {
    dayOfMonthField.value = recurrence.dayOfMonth;
  } else if (recurrence.type === 'yearly' && recurrence.date) {
    yearlyDateField.value = recurrence.date;
  }
  
  // Show/hide options
  weeklyOptions.classList.toggle('d-none', recurrence.type !== 'weekly');
  monthlyOptions.classList.toggle('d-none', recurrence.type !== 'monthly');
  yearlyOptions.classList.toggle('d-none', recurrence.type !== 'yearly');
  
  statusEl.classList.add('d-none');
  saveButton.disabled = false;
  deleteButton.disabled = false;
  
  dialog.showModal();
  textField.focus();
  textField.setSelectionRange(textField.value.length, textField.value.length);
}
