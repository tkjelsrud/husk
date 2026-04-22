import { logout, requireAuth } from './auth.js';
import { addEntry, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';

const form = document.getElementById('entry-form');
const textField = document.getElementById('entry-text');
const categoryField = document.getElementById('entry-category');
const submitButton = document.getElementById('submit-btn');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');

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

    try {
      await addEntry({
        textInput: normalizeEntryText(rawText),
        category
      }, user);
      form.reset();
      categoryField.value = 'unknown';
      showStatus('success', 'Lagret.');
      textField.focus();
    } catch (err) {
      console.error(err);
      showStatus('danger', 'Kunne ikke lagre.');
    } finally {
      submitButton.disabled = false;
    }
  });
});
