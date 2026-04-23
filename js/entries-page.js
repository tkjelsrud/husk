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
    entriesBody.innerHTML = '<tr><td colspan="8" class="text-muted py-4">Ingen ennå.</td></tr>';
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
    const priority = escapeHtml(formatPriority(entry.priority));
    const processing = renderProcessing(entry);

    return `
      <tr>
        <td>${createdAt}</td>
        <td><pre class="entry-text">${text}</pre></td>
        <td>${category}</td>
        <td>${priority}</td>
        <td><span class="status-badge ${processedClass}">${processedLabel}</span></td>
        <td>${dueDate}</td>
        <td>${processing}</td>
        <td>${addedBy}</td>
      </tr>
    `;
  }).join('');
}

function renderProcessing(entry) {
  const details = entry.processingDetails;
  const summary = escapeHtml(String(entry.processingSummary || '-'));
  const calendarStatus = escapeHtml(formatCalendarStatus(entry));

  if (!details) {
    return `
      <div class="processing-cell">
        <div class="processing-summary">${summary}</div>
        <div class="processing-meta">Kalender: ${calendarStatus}</div>
      </div>
    `;
  }

  const prettyJson = escapeHtml(JSON.stringify(details, null, 2));
  return `
    <div class="processing-cell">
      <div class="processing-summary">${summary}</div>
      <div class="processing-meta">Kalender: ${calendarStatus}</div>
      <details class="processing-details mt-2">
        <summary>Vis detaljer</summary>
        <pre class="processing-json">${prettyJson}</pre>
      </details>
    </div>
  `;
}

function formatCalendarStatus(entry) {
  if (entry.calendarEventCreated) {
    const status = String(entry.calendarSyncStatus || 'created');
    const time = formatTimestamp(entry.calendarSyncTime);
    return `${status} ${time === '-' ? '' : `(${time})`}`.trim();
  }

  const status = String(entry.calendarSyncStatus || 'nei');
  return status === 'not_attempted' ? 'nei' : status;
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

function formatPriority(value) {
  const priority = String(value || 'normal');
  const labels = {
    low: 'Lav',
    normal: 'Normal',
    high: 'Hoy'
  };

  return labels[priority] || priority;
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
    entriesBody.innerHTML = '<tr><td colspan="8" class="text-muted py-4">Kunne ikke laste listen.</td></tr>';
  } finally {
    refreshButton.disabled = false;
  }
}

requireAuth((user) => {
  userLabel.textContent = user.email || '';
  refreshButton.addEventListener('click', loadEntries);
  loadEntries();
});
