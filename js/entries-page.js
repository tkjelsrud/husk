import { logout, requireAuth } from './auth.js';
import { getEntries } from './db.js';

const logoutButton = document.getElementById('logout-btn');
const refreshButton = document.getElementById('refresh-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');
const entriesBody = document.getElementById('entries-body');

logoutButton.addEventListener('click', () => logout());

function showStatus(kind, message) {
  statusMsg.textContent = message;
  statusMsg.className = `alert alert-${kind}`;
  statusMsg.classList.remove('d-none');
}

function hideStatus() {
  statusMsg.classList.add('d-none');
}

function renderEntries(entries) {
  if (entries.length === 0) {
    entriesBody.innerHTML = '<tr><td colspan="4" class="text-muted py-4">No entries yet.</td></tr>';
    return;
  }

  entriesBody.innerHTML = entries.map((entry) => {
    const processedLabel = entry.processed ? 'Yes' : 'No';
    const processedClass = entry.processed ? 'done' : 'pending';
    const text = escapeHtml(String(entry.text || ''));
    const addedBy = escapeHtml(String(entry.addedByEmail || ''));
    const date = escapeHtml(String(entry.date || ''));

    return `
      <tr>
        <td>${date}</td>
        <td><pre class="entry-text">${text}</pre></td>
        <td><span class="status-badge ${processedClass}">${processedLabel}</span></td>
        <td>${addedBy}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadEntries() {
  hideStatus();
  refreshButton.disabled = true;

  try {
    const entries = await getEntries();
    renderEntries(entries);
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Could not load entries.');
    entriesBody.innerHTML = '<tr><td colspan="4" class="text-muted py-4">Entries could not be loaded.</td></tr>';
  } finally {
    refreshButton.disabled = false;
  }
}

requireAuth((user) => {
  userLabel.textContent = user.email || '';
  refreshButton.addEventListener('click', loadEntries);
  loadEntries();
});
