import { logout, requireAuth } from './auth.js';
import {
  addDocument,
  deleteDocument,
  getDocuments,
  isFirestoreAuthError,
  updateDocument,
} from './docs-db.js';

const docList = document.getElementById('doc-list');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');

const viewPanel = document.getElementById('view-panel');
const emptyState = document.getElementById('empty-state');
const viewMode = document.getElementById('view-mode');
const editMode = document.getElementById('edit-mode');

const viewTitle = document.getElementById('view-title');
const viewBody = document.getElementById('view-body');
const editBtn = document.getElementById('edit-btn');
const archiveBtn = document.getElementById('archive-btn');
const deleteBtn = document.getElementById('delete-btn');

const editTitle = document.getElementById('edit-title');
const editContent = document.getElementById('edit-content');
const draftRecovery = document.getElementById('draft-recovery');
const draftRecoveryText = document.getElementById('draft-recovery-text');
const useDraftBtn = document.getElementById('use-draft-btn');
const discardDraftBtn = document.getElementById('discard-draft-btn');
const saveBtn = document.getElementById('save-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const newBtn = document.getElementById('new-btn');
const backBtn = document.getElementById('back-btn');

let currentUser = null;
let currentDocId = null;
let currentDocs = [];
let isNewDoc = false;
let draftSaveTimer = null;

const DRAFT_STORAGE_KEY = 'husk-write-drafts';
const LONG_DOC_MIN_LENGTH = 250;
const DRAFT_SAVE_DELAY_MS = 400;

logoutButton.addEventListener('click', () => logout());

function getDocIdFromHash() {
  return decodeURIComponent(window.location.hash.replace(/^#/, '')) || null;
}

function setDocIdInHash(id) {
  const next = id ? `#${encodeURIComponent(id)}` : '';
  if (next !== window.location.hash) {
    history.replaceState(null, '', next || window.location.pathname + window.location.search);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDate(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
}

function handleFirestoreError(err, fallback) {
  console.error(err);
  if (isFirestoreAuthError(err)) {
    setTimeout(() => logout(), 700);
    return;
  }
  alert(fallback);
}

function getDraftDocKey(docId = currentDocId) {
  return docId || '__new__';
}

function getDraftStorageKey(docId = currentDocId) {
  return `${currentUser?.uid || 'anonymous'}:${getDraftDocKey(docId)}`;
}

function readDrafts() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDrafts(drafts) {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch (err) {
    console.warn('Could not persist write draft.', err);
  }
}

function getStoredDraft(docId = currentDocId) {
  const draft = readDrafts()[getDraftStorageKey(docId)];
  if (!draft || typeof draft !== 'object') return null;
  return {
    title: typeof draft.title === 'string' ? draft.title : '',
    content: typeof draft.content === 'string' ? draft.content : '',
    savedAt: typeof draft.savedAt === 'number' ? draft.savedAt : 0,
  };
}

function clearStoredDraft(docId = currentDocId) {
  const drafts = readDrafts();
  delete drafts[getDraftStorageKey(docId)];
  writeDrafts(drafts);
}

function shouldPersistDraft(title, content) {
  return Math.max(title.trim().length, content.trim().length) >= LONG_DOC_MIN_LENGTH;
}

function formatDraftSavedAt(value) {
  if (!value) return 'Lokal kladd er nyere enn den lagrede versjonen.';
  return `Lokal kladd lagret ${new Intl.DateTimeFormat('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))}.`;
}

function showDraftRecoveryPrompt(draft) {
  draftRecoveryText.textContent = formatDraftSavedAt(draft.savedAt);
  draftRecovery.classList.remove('d-none');
}

function hideDraftRecoveryPrompt() {
  draftRecovery.classList.add('d-none');
  draftRecoveryText.textContent = '';
}

function scheduleDraftSave() {
  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer);
  }
  draftSaveTimer = window.setTimeout(() => {
    draftSaveTimer = null;
    persistCurrentDraft();
  }, DRAFT_SAVE_DELAY_MS);
}

function flushDraftSave() {
  if (!editMode.classList.contains('d-none') && draftSaveTimer) {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    persistCurrentDraft();
  }
}

function persistCurrentDraft() {
  if (editMode.classList.contains('d-none')) return;

  const title = editTitle.value;
  const content = editContent.value;
  if (!shouldPersistDraft(title, content)) {
    clearStoredDraft();
    return;
  }

  const drafts = readDrafts();
  drafts[getDraftStorageKey()] = {
    title,
    content,
    savedAt: Date.now(),
  };
  writeDrafts(drafts);
}

function maybeShowDraftRecovery(doc) {
  const draft = getStoredDraft();
  const title = doc?.title || '';
  const content = doc?.content || '';
  if (!draft) {
    hideDraftRecoveryPrompt();
    return;
  }

  if (draft.title === title && draft.content === content) {
    clearStoredDraft();
    hideDraftRecoveryPrompt();
    return;
  }

  showDraftRecoveryPrompt(draft);
}

function renderDocList(docs) {
  if (docs.length === 0) {
    docList.innerHTML = '<li class="write-doc-empty">Ingen dokumenter ennå.</li>';
    return;
  }
  docList.innerHTML = docs.map((d) => `
    <li>
      <button class="write-doc-item ${d.id === currentDocId ? 'active' : ''} ${d.archived ? 'write-doc-archived' : ''}"
              type="button" data-doc-id="${escapeHtml(d.id)}">
        <span class="write-doc-title">${escapeHtml(d.title || '(uten tittel)')}</span>
        <span class="write-doc-date">${formatDate(d.updatedAt)}</span>
      </button>
    </li>
  `).join('');
}

function showEmptyState() {
  emptyState.classList.remove('d-none');
  viewMode.classList.add('d-none');
  editMode.classList.add('d-none');
}

function showViewMode(doc) {
  emptyState.classList.add('d-none');
  editMode.classList.add('d-none');
  viewMode.classList.remove('d-none');

  viewTitle.textContent = doc.title || '(uten tittel)';
  viewBody.innerHTML = window.marked
    ? window.marked.parse(doc.content || '')
    : `<pre>${escapeHtml(doc.content || '')}</pre>`;

  if (window.hljs) {
    viewBody.querySelectorAll('pre code').forEach((block) => window.hljs.highlightElement(block));
  }

  archiveBtn.textContent = doc.archived ? 'Hent fram' : 'Arkiver';

  viewPanel.classList.add('write-panel-active');
  backBtn.classList.remove('d-none');
}

function showEditMode(doc) {
  emptyState.classList.add('d-none');
  viewMode.classList.add('d-none');
  editMode.classList.remove('d-none');

  editTitle.value = doc?.title || '';
  editContent.value = doc?.content || '';
  maybeShowDraftRecovery(doc);
  editContent.focus();

  viewPanel.classList.add('write-panel-active');
  backBtn.classList.remove('d-none');
}

async function loadDocs() {
  try {
    currentDocs = await getDocuments();
    renderDocList(currentDocs);
    if (!currentDocId) {
      currentDocId = getDocIdFromHash();
      renderDocList(currentDocs);
    }
    if (currentDocId) {
      const still = currentDocs.find((d) => d.id === currentDocId);
      if (still) showViewMode(still);
      else {
        currentDocId = null;
        setDocIdInHash(null);
        showEmptyState();
      }
    }
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke laste dokumenter.');
  }
}

function selectDoc(id) {
  flushDraftSave();
  currentDocId = id;
  setDocIdInHash(id);
  isNewDoc = false;
  const doc = currentDocs.find((d) => d.id === id);
  if (!doc) return;
  renderDocList(currentDocs);
  showViewMode(doc);
}

docList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-doc-id]');
  if (!btn) return;
  selectDoc(btn.dataset.docId);
});

editBtn.addEventListener('click', () => {
  const doc = currentDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  showEditMode(doc);
});

newBtn.addEventListener('click', () => {
  flushDraftSave();
  currentDocId = null;
  isNewDoc = true;
  renderDocList(currentDocs);
  showEditMode(null);
  saveBtn.textContent = 'Opprett';
});

cancelEditBtn.addEventListener('click', () => {
  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  clearStoredDraft();
  hideDraftRecoveryPrompt();
  if (isNewDoc) {
    isNewDoc = false;
    showEmptyState();
    viewPanel.classList.remove('write-panel-active');
    backBtn.classList.add('d-none');
  } else {
    const doc = currentDocs.find((d) => d.id === currentDocId);
    if (doc) showViewMode(doc);
  }
  saveBtn.textContent = 'Lagre';
});

saveBtn.addEventListener('click', async () => {
  const title = editTitle.value.trim();
  const content = editContent.value;
  const draftDocId = isNewDoc ? null : currentDocId;

  if (!title) {
    editTitle.focus();
    return;
  }

  saveBtn.disabled = true;
  try {
    if (isNewDoc) {
      const ref = await addDocument({ title, content }, currentUser);
      currentDocId = ref.id;
      setDocIdInHash(ref.id);
      isNewDoc = false;
    } else {
      await updateDocument(currentDocId, { title, content });
    }
    clearStoredDraft(draftDocId);
    hideDraftRecoveryPrompt();
    saveBtn.textContent = 'Lagre';
    await loadDocs();
    const updated = currentDocs.find((d) => d.id === currentDocId);
    if (updated) showViewMode(updated);
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke lagre.');
  } finally {
    saveBtn.disabled = false;
  }
});

archiveBtn.addEventListener('click', async () => {
  if (!currentDocId) return;
  const doc = currentDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  const nextArchived = !doc.archived;
  archiveBtn.disabled = true;
  try {
    await updateDocument(currentDocId, { archived: nextArchived });
    await loadDocs();
    const updated = currentDocs.find((d) => d.id === currentDocId);
    if (updated) showViewMode(updated);
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke endre arkivstatus.');
  } finally {
    archiveBtn.disabled = false;
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!currentDocId) return;
  const doc = currentDocs.find((d) => d.id === currentDocId);
  const title = doc?.title || 'dette dokumentet';
  if (!confirm(`Slette «${title}»?`)) return;

  try {
    await deleteDocument(currentDocId);
    currentDocId = null;
    setDocIdInHash(null);
    showEmptyState();
    viewPanel.classList.remove('write-panel-active');
    backBtn.classList.add('d-none');
    await loadDocs();
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke slette.');
  }
});

backBtn.addEventListener('click', () => {
  flushDraftSave();
  viewPanel.classList.remove('write-panel-active');
  backBtn.classList.add('d-none');
  currentDocId = null;
  setDocIdInHash(null);
  isNewDoc = false;
  saveBtn.textContent = 'Lagre';
  showEmptyState();
  renderDocList(currentDocs);
});

useDraftBtn.addEventListener('click', () => {
  const draft = getStoredDraft();
  if (!draft) {
    hideDraftRecoveryPrompt();
    return;
  }
  editTitle.value = draft.title;
  editContent.value = draft.content;
  hideDraftRecoveryPrompt();
  editContent.focus();
  scheduleDraftSave();
});

discardDraftBtn.addEventListener('click', () => {
  clearStoredDraft();
  hideDraftRecoveryPrompt();
});

editTitle.addEventListener('input', scheduleDraftSave);
editContent.addEventListener('input', scheduleDraftSave);

window.addEventListener('beforeunload', () => {
  flushDraftSave();
  persistCurrentDraft();
});

editContent.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const start = editContent.selectionStart;
  const end = editContent.selectionEnd;
  editContent.value = editContent.value.slice(0, start) + '  ' + editContent.value.slice(end);
  editContent.selectionStart = editContent.selectionEnd = start + 2;
});

requireAuth((user) => {
  document.body.classList.remove('app-auth-pending');
  document.body.classList.add('app-auth-ready');
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadDocs();
});
