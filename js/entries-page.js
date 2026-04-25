import { logout, requireAuth } from './auth.js';
import { deleteEntry, getEntries } from './db.js';

const logoutButton = document.getElementById('logout-btn');
const refreshButton = document.getElementById('refresh-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');
const entriesDesktopList = document.getElementById('entries-desktop-list');
const entriesList = document.getElementById('entries-list');

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
    entriesDesktopList.innerHTML = '<div class="text-muted py-3">Ingen ennå.</div>';
    entriesList.innerHTML = '<div class="text-muted py-3">Ingen ennå.</div>';
    return;
  }

  entriesDesktopList.innerHTML = entries.map(renderDesktopEntry).join('');
  entriesList.innerHTML = entries.map(renderMobileEntry).join('');
}

function renderDesktopEntry(entry) {
  const processedLabel = entry.processed ? 'Ferdig' : 'Apen';
  const processedClass = entry.processed ? 'done' : 'pending';
  const text = escapeHtml(String(entry.textInput || ''));
  const entryId = escapeHtml(String(entry.id || ''));
  const summary = escapeHtml(String(entry.processingSummary || 'Ingen prosessering enda.'));
  const calendarStatus = escapeHtml(formatCalendarStatus(entry));
  const addedBy = escapeHtml(String(entry.addedByEmail || ''));
  const createdAt = escapeHtml(formatTimestamp(entry.createdAt));
  const dueDate = escapeHtml(formatTimestamp(entry.dueDate));
  const category = escapeHtml(formatCategory(entry.category));
  const priority = escapeHtml(formatPriority(entry.priority));
  const details = entry.processingDetails ? escapeHtml(JSON.stringify(entry.processingDetails, null, 2)) : '';
  const detailsSection = entry.processingDetails ? `
    <details class="entry-extra-details">
      <summary>Detaljer</summary>
      <pre class="processing-json">${details}</pre>
    </details>
  ` : '';

  return `
    <article class="entry-card entry-card-desktop ${processedClass}">
      <div class="entry-card-main entry-card-main-desktop">
        <span class="status-dot ${processedClass}" aria-hidden="true"></span>
        <div class="entry-card-content">
          <div class="entry-card-header">
            <div class="entry-card-subline">
              <span>${createdAt}</span>
              <span>${dueDate === '-' ? 'Ingen frist' : `Frist ${dueDate}`}</span>
            </div>
            <button class="delete-entry-link delete-entry-link-mobile" type="button" data-entry-id="${entryId}" aria-label="Slett">Slett</button>
          </div>
          <pre class="entry-text">${text}</pre>
          <div class="entry-chip-row">
            <span class="status-badge ${processedClass}">${processedLabel}</span>
            <span class="entry-chip">${category}</span>
            <span class="entry-chip">${priority}</span>
          </div>
          <div class="entry-card-grid">
            <div>
              <div class="entry-card-label">Lagt til av</div>
              <div class="entry-extra-meta mt-1">${addedBy || '-'}</div>
            </div>
            <div class="processing-cell processing-cell-desktop">
              <div class="entry-card-label">Prosessering</div>
              <div class="processing-summary mt-1">${summary}</div>
              <div class="processing-meta">Kalender: ${calendarStatus}</div>
              ${detailsSection}
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderMobileEntry(entry) {
  const processedLabel = entry.processed ? 'Ferdig' : 'Apen';
  const processedClass = entry.processed ? 'done' : 'pending';
  const text = escapeHtml(String(entry.textInput || ''));
  const createdAt = escapeHtml(formatTimestamp(entry.createdAt));
  const dueDate = escapeHtml(formatTimestamp(entry.dueDate));
  const category = escapeHtml(formatCategory(entry.category));
  const priority = escapeHtml(formatPriority(entry.priority));
  const addedBy = escapeHtml(String(entry.addedByEmail || '-'));
  const summary = escapeHtml(String(entry.processingSummary || 'Ingen prosessering enda.'));
  const calendarStatus = escapeHtml(formatCalendarStatus(entry));
  const details = entry.processingDetails ? escapeHtml(JSON.stringify(entry.processingDetails, null, 2)) : '';
  const detailsSection = entry.processingDetails ? `
    <details class="entry-extra-details">
      <summary>Detaljer</summary>
      <pre class="processing-json">${details}</pre>
    </details>
  ` : '';

  return `
    <article class="entry-card ${processedClass}">
      <div class="entry-card-main">
        <span class="status-dot ${processedClass}" aria-hidden="true"></span>
        <div class="entry-card-content">
          <pre class="entry-text entry-text-mobile">${text}</pre>
          <div class="entry-card-subline">
            <span>${createdAt}</span>
            <span>${dueDate === '-' ? 'Ingen frist' : `Frist ${dueDate}`}</span>
          </div>
        </div>
        <button class="delete-entry-link delete-entry-link-mobile" type="button" data-entry-id="${escapeHtml(entry.id)}" aria-label="Slett">Slett</button>
      </div>
      <details class="entry-extra">
        <summary>Mer</summary>
        <div class="entry-chip-row">
          <span class="status-badge ${processedClass}">${processedLabel}</span>
          <span class="entry-chip">${category}</span>
          <span class="entry-chip">${priority}</span>
        </div>
        <div class="entry-extra-meta">Lagt til av ${addedBy}</div>
        <div class="processing-cell processing-cell-mobile">
          <div class="processing-summary">${summary}</div>
          <div class="processing-meta">Kalender: ${calendarStatus}</div>
          ${detailsSection}
        </div>
      </details>
    </article>
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
    general: 'Generelt',
    'husk mcp': 'Husk MCP',
    huskmcp: 'Husk MCP'
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
    entriesDesktopList.innerHTML = '<div class="text-muted py-3">Kunne ikke laste listen.</div>';
    entriesList.innerHTML = '<div class="text-muted py-3">Kunne ikke laste listen.</div>';
  } finally {
    refreshButton.disabled = false;
  }
}

async function handleDeleteClick(event) {
  const deleteButton = event.target.closest('[data-entry-id]');
  if (!deleteButton) return;

  const entryId = deleteButton.dataset.entryId;
  if (!entryId) return;

  if (!window.confirm('Slette notatet?')) return;

  hideStatus();
  deleteButton.disabled = true;
  try {
    await deleteEntry(entryId);
    showStatus('success', 'Notatet ble slettet.');
    await loadEntries();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke slette notatet.');
    deleteButton.disabled = false;
  }
}

requireAuth((user) => {
  userLabel.textContent = user.email || '';
  refreshButton.addEventListener('click', loadEntries);
  document.addEventListener('click', handleDeleteClick);
  loadEntries();
});
