import { logout, requireAuth } from './auth.js';
import { addEntry, getTodayLocalDate } from './db.js';
import { normalizeEntryText, validateEntryText } from './lib/entry-validation.js';

const form = document.getElementById('entry-form');
const textField = document.getElementById('entry-text');
const submitButton = document.getElementById('submit-btn');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');
const datePill = document.getElementById('date-pill');

datePill.textContent = getTodayLocalDate();
logoutButton.addEventListener('click', () => logout());

function showStatus(kind, message) {
  statusMsg.textContent = message;
  statusMsg.className = `alert alert-${kind}`;
  statusMsg.classList.remove('d-none');
}

requireAuth((user) => {
  userLabel.textContent = user.email || '';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusMsg.classList.add('d-none');

    const rawText = textField.value;
    const validation = validateEntryText(rawText);
    if (!validation.ok) {
      showStatus('danger', validation.message);
      return;
    }

    submitButton.disabled = true;

    try {
      await addEntry(normalizeEntryText(rawText), user);
      form.reset();
      showStatus('success', 'Entry saved.');
      textField.focus();
    } catch (err) {
      console.error(err);
      showStatus('danger', 'Could not save the entry.');
    } finally {
      submitButton.disabled = false;
    }
  });
});
