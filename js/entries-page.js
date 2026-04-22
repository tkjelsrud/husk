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
    entriesBody.innerHTML = '<tr><td colspan="6" class="text-muted py-4">Ingen ennå.</td></tr>';
    return;
  }

  entriesBody.innerHTML = entries.map((entry) => {
    const processedLabel = entry.processed ? 'Ja' : 'Nei';
    const processedClass = entry.processed ? 'done' : 'pending';
    const text = escapeHtml(String(entry.textInput || ''));
    const addedBy = escapeHtml(String(entry.addedByEmail || ''));
    const createdAt = escapeHtml(formatTimestamp(entry.createdAt));
    const dueDate = escapeHtml(formatTimestamp(entry.dueDate));
    const category = escapeHtml(formatCategory(entry.category));

    return `
      <tr>
        <td>${createdAt}</td>
        <td><pre class="entry-text">${text}</pre></td>
        <td>${category}</td>
        <td><span class="status-badge ${processedClass}">${processedLabel}</span></td>
        <td>${dueDate}</td>
        <td>${addedBy}</td>
      </tr>
    `;
  }).join('');
}

function formatCategory(value) {
  const category = String(value || 'unknown');
  const labels = {
    unknown: 'Ukjent',
    work: 'Jobb',
    creative: 'Kreativt',
    houseproj: 'Houseproj',
    family: 'Familie',
    general: 'Generelt'
  };

  return labels[category] || category;
}

function formatTimestamp(value) {
  if (!value) return '-';

  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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
    showStatus('danger', 'Kunne ikke laste listen.');
    entriesBody.innerHTML = '<tr><td colspan="6" class="text-muted py-4">Kunne ikke laste listen.</td></tr>';
  } finally {
    refreshButton.disabled = false;
  }
}

requireAuth((user) => {
  userLabel.textContent = user.email || '';
  refreshButton.addEventListener('click', loadEntries);
  loadEntries();
});
