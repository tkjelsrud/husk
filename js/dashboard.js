import { logout, requireAuth } from './auth.js';
import { addEntry, getEntries, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';
import { openEditModal } from './edit-modal.js';

const recentSection = document.getElementById('recent-section');
const recentList = document.getElementById('recent-list');

const form = document.getElementById('entry-form');
const textField = document.getElementById('entry-text');
const categoryField = document.getElementById('entry-category');
const submitButton = document.getElementById('submit-btn');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');

let currentUser = null;

logoutButton.addEventListener('click', () => logout());

function showStatus(kind, message) {
  statusMsg.textContent = message;
  statusMsg.className = `alert alert-${kind}`;
  statusMsg.classList.remove('d-none');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMsg.classList.add('d-none');

  if (!currentUser) {
    showStatus('warning', 'Logger inn. Prov igjen om et oyeblikk.');
    return;
  }

  const rawText = textField.value;
  const category = categoryField.value;
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

  submitButton.disabled = true;
  showStatus('secondary', 'Lagrer...');

  try {
    await addEntry({
      textInput: normalizeEntryText(rawText),
      category
    }, currentUser);
    form.reset();
    categoryField.value = 'unknown';
    showStatus('success', 'Lagret.');
    textField.focus();
    loadRecent();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke lagre.');
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

function formatShortDate(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function loadRecent() {
  try {
    const entries = await getEntries();
    if (entries.length === 0) return;
    recentSection.classList.remove('d-none');
    recentList.innerHTML = entries.slice(0, 10).map((e) => {
      const text = escapeHtml(String(e.textInput || '').replace(/\s+/g, ' ').trim());
      const date = escapeHtml(formatShortDate(e.createdAt));
      const statusClass = e.processed ? 'done' : 'pending';
      return `<div class="recent-entry" role="button" tabindex="0"
        data-edit-id="${escapeHtml(e.id)}"
        data-edit-text="${escapeAttr(String(e.textInput || ''))}"
        data-edit-category="${escapeHtml(String(e.category || 'unknown'))}">
        <span class="status-dot ${statusClass}" aria-hidden="true"></span>
        <span class="recent-entry-text">${text}</span>
        <span class="recent-entry-date">${date}</span>
      </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

recentList.addEventListener('click', (e) => {
  const row = e.target.closest('[data-edit-id]');
  if (!row) return;
  openEditModal({
    id: row.dataset.editId,
    textInput: row.dataset.editText,
    category: row.dataset.editCategory
  }, loadRecent);
});

recentList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('[data-edit-id]');
  if (!row) return;
  e.preventDefault();
  row.click();
});

requireAuth((user) => {
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadRecent();
});
