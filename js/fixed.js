import { logout, requireAuth } from './auth.js';
import { addFixedEntry, getFixedEntries, deleteEntry, isFirestoreAuthError, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';
import { openFixedEditModal } from './fixed-edit-modal.js';

const fixedSection = document.getElementById('fixed-section');
const fixedList = document.getElementById('fixed-list');

const form = document.getElementById('fixed-form');
const textField = document.getElementById('fixed-text');
const categoryField = document.getElementById('fixed-category');
const recurrenceTypeField = document.getElementById('recurrence-type');
const submitButton = document.getElementById('submit-btn');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');

// Recurrence option containers
const weeklyOptions = document.getElementById('weekly-options');
const monthlyOptions = document.getElementById('monthly-options');
const yearlyOptions = document.getElementById('yearly-options');
const dayOfMonthField = document.getElementById('day-of-month');
const yearlyDateField = document.getElementById('yearly-date');

let currentUser = null;

logoutButton.addEventListener('click', () => logout());

function showStatus(kind, message) {
  statusMsg.textContent = message;
  statusMsg.className = `alert alert-${kind}`;
  statusMsg.classList.remove('d-none');
}

function handleFirestoreError(err, fallbackMessage) {
  console.error(err);

  if (isFirestoreAuthError(err)) {
    showStatus('warning', 'Innloggingen mangler eller har utlopet. Sender til login...');
    setTimeout(() => logout(), 700);
    return;
  }

  showStatus('danger', fallbackMessage);
}

// Show/hide recurrence options based on type
recurrenceTypeField.addEventListener('change', () => {
  const type = recurrenceTypeField.value;
  weeklyOptions.classList.toggle('d-none', type !== 'weekly');
  monthlyOptions.classList.toggle('d-none', type !== 'monthly');
  yearlyOptions.classList.toggle('d-none', type !== 'yearly');
});

function parseRecurrence() {
  const type = recurrenceTypeField.value;
  const recurrence = { type };

  if (type === 'weekly') {
    const days = [];
    for (let i = 0; i <= 6; i++) {
      const checkbox = document.getElementById(`day-${i}`);
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMsg.classList.add('d-none');

  if (!currentUser) {
    showStatus('warning', 'Logger inn. Prøv igjen om et øyeblikk.');
    return;
  }

  const rawText = textField.value;
  const category = categoryField.value;
  const recurrence = parseRecurrence();

  const validation = validateEntryText(rawText);
  if (!validation.ok) {
    showStatus('danger', validation.message);
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

  submitButton.disabled = true;
  showStatus('secondary', 'Lagrer...');

  try {
    await addFixedEntry({
      textInput: normalizeEntryText(rawText),
      category,
      recurrence
    }, currentUser);
    form.reset();
    categoryField.value = 'unknown';
    recurrenceTypeField.value = 'none';
    weeklyOptions.classList.add('d-none');
    monthlyOptions.classList.add('d-none');
    yearlyOptions.classList.add('d-none');
    showStatus('success', 'Lagret.');
    textField.focus();
    loadFixed();
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke lagre.');
  } finally {
    submitButton.disabled = false;
  }
});

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function formatRecurrence(recurrence) {
  if (!recurrence || recurrence.type === 'none') {
    return 'Én gang';
  }
  if (recurrence.type === 'daily') {
    return 'Daglig';
  }
  if (recurrence.type === 'weekly') {
    const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
    const days = (recurrence.daysOfWeek || []).map(d => dayNames[d]).join(', ');
    return `Ukentlig: ${days}`;
  }
  if (recurrence.type === 'monthly') {
    return `Månedlig: ${recurrence.dayOfMonth || '?'}. dag`;
  }
  if (recurrence.type === 'yearly') {
    return `Årlig: ${recurrence.date || '?'}`;
  }
  return 'Ukjent';
}

async function loadFixed() {
  try {
    const entries = await getFixedEntries();
    if (entries.length === 0) {
      fixedSection.classList.add('d-none');
      return;
    }
    
    fixedSection.classList.remove('d-none');
    
    fixedList.innerHTML = entries.map((e) => {
      const text = escapeHtml(String(e.textInput || '').replace(/\s+/g, ' ').trim());
      const recurrenceStr = escapeHtml(formatRecurrence(e.recurrence));
      const categoryLabels = {
        unknown: 'Ukjent',
        work: 'Jobb',
        creative: 'Kreativt',
        houseproj: 'Houseproj',
        family: 'Familie',
        general: 'Generelt',
        huskmcp: 'Husk MCP'
      };
      const categoryLabel = escapeHtml(categoryLabels[e.category] || e.category);
      
      return `<div class="entry-card entry-card-desktop" role="button" tabindex="0"
        data-edit-id="${escapeHtml(e.id)}"
        data-edit-text="${escapeAttr(String(e.textInput || ''))}"
        data-edit-category="${escapeHtml(String(e.category || 'unknown'))}"
        data-edit-recurrence="${escapeAttr(JSON.stringify(e.recurrence || { type: 'none' }))}">
        <div class="entry-card-main entry-card-main-desktop">
          <div class="entry-card-content">
            <div class="entry-card-header">
              <p class="entry-text">${text}</p>
            </div>
            <div class="entry-card-subline">
              <span>${categoryLabel}</span>
              <span>•</span>
              <span>${recurrenceStr}</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke laste faste paminnelser.');
  }
}

fixedList.addEventListener('click', (e) => {
  const card = e.target.closest('[data-edit-id]');
  if (!card) return;
  
  let recurrence;
  try {
    recurrence = JSON.parse(card.dataset.editRecurrence);
  } catch {
    recurrence = { type: 'none' };
  }
  
  openFixedEditModal({
    id: card.dataset.editId,
    textInput: card.dataset.editText,
    category: card.dataset.editCategory,
    recurrence
  }, loadFixed);
});

fixedList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-edit-id]');
  if (!card) return;
  e.preventDefault();
  card.click();
});

requireAuth((user) => {
  document.body.classList.remove('app-auth-pending');
  document.body.classList.add('app-auth-ready');
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadFixed();
});
