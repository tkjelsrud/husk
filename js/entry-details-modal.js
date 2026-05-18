import { deleteEntry } from './db.js';

let dialog = null;
let titleEl = null;
let metaEl = null;
let jsonEl = null;
let statusEl = null;
let deleteButton = null;
let currentEntry = null;
let pendingOnDelete = null;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.innerHTML = `
    <div class="edit-dialog-inner">
      <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
        <div>
          <p class="eyebrow mb-1">Notat</p>
          <h2 id="entry-details-title" class="h5 mb-0">Detaljer</h2>
        </div>
      </div>
      <div id="entry-details-status" class="alert d-none" role="alert"></div>
      <dl id="entry-details-meta" class="entry-details-meta mb-4"></dl>
      <label class="form-label" for="entry-details-json">JSON</label>
      <pre id="entry-details-json" class="processing-json entry-details-json"></pre>
      <div class="edit-dialog-footer mt-4">
        <button type="button" id="entry-details-delete" class="btn btn-link text-danger">Slett</button>
        <button type="button" id="entry-details-close" class="btn btn-dark">Lukk</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  titleEl = dialog.querySelector('#entry-details-title');
  metaEl = dialog.querySelector('#entry-details-meta');
  jsonEl = dialog.querySelector('#entry-details-json');
  statusEl = dialog.querySelector('#entry-details-status');
  deleteButton = dialog.querySelector('#entry-details-delete');

  dialog.querySelector('#entry-details-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  deleteButton.addEventListener('click', handleDelete);
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

function formatCategory(value) {
  const labels = {
    unknown: 'Ukjent',
    work: 'Jobb',
    creative: 'Kreativt',
    houseproj: 'Houseproj',
    family: 'Familie',
    general: 'Generelt',
    huskmcp: 'Husk MCP',
    'husk mcp': 'Husk MCP'
  };

  const category = String(value || 'unknown');
  return labels[category] || category;
}

function formatPriority(value) {
  const labels = {
    low: 'Lav',
    normal: 'Normal',
    high: 'Hoy'
  };

  const priority = String(value || 'normal');
  return labels[priority] || priority;
}

function formatCalendarStatus(entry) {
  if (entry?.calendarEventCreated) {
    const status = String(entry.calendarSyncStatus || 'created');
    const time = formatTimestamp(entry.calendarSyncTime);
    return `${status} ${time === '-' ? '' : `(${time})`}`.trim();
  }

  const status = String(entry?.calendarSyncStatus || 'nei');
  return status === 'not_attempted' ? 'nei' : status;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeJsonValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)])
    );
  }

  return value;
}

function renderMetaRow(label, value) {
  return `
    <dt>${escapeHtml(label)}</dt>
    <dd>${escapeHtml(value)}</dd>
  `;
}

function showStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${kind}`;
  statusEl.classList.remove('d-none');
}

async function handleDelete() {
  if (!currentEntry?.id) return;
  if (!window.confirm('Slette notatet?')) return;

  deleteButton.disabled = true;
  try {
    await deleteEntry(currentEntry.id);
    dialog.close();
    if (typeof pendingOnDelete === 'function') pendingOnDelete();
  } catch (err) {
    console.error(err);
    showStatus('danger', 'Kunne ikke slette notatet.');
    deleteButton.disabled = false;
  }
}

export function openEntryDetailsModal(entry, onDelete) {
  if (!dialog) buildDialog();

  currentEntry = entry;
  pendingOnDelete = onDelete;
  deleteButton.disabled = false;
  statusEl.classList.add('d-none');

  const title = String(entry?.textInput || 'Detaljer').split('\n')[0].trim() || 'Detaljer';
  titleEl.textContent = title;

  metaEl.innerHTML = [
    renderMetaRow('Kategori', formatCategory(entry?.category)),
    renderMetaRow('Status', entry?.done === true ? 'Ferdig' : 'Aktiv'),
    renderMetaRow('Prosessering', entry?.processed ? 'Prosessert' : 'Ikke prosessert'),
    renderMetaRow('Prioritet', formatPriority(entry?.priority)),
    renderMetaRow('Lagt til', formatTimestamp(entry?.createdAt)),
    renderMetaRow('Frist', formatTimestamp(entry?.dueDate)),
    renderMetaRow('Kalender', formatCalendarStatus(entry)),
    renderMetaRow('Lagt til av', String(entry?.addedByEmail || '-'))
  ].join('');

  jsonEl.textContent = JSON.stringify(normalizeJsonValue(entry), null, 2);
  dialog.showModal();
}
