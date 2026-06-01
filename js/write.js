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
const deleteBtn = document.getElementById('delete-btn');

const editTitle = document.getElementById('edit-title');
const editContent = document.getElementById('edit-content');
const saveBtn = document.getElementById('save-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const newBtn = document.getElementById('new-btn');
const backBtn = document.getElementById('back-btn');

let currentUser = null;
let currentDocId = null;
let currentDocs = [];
let isNewDoc = false;

logoutButton.addEventListener('click', () => logout());

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

function renderDocList(docs) {
  if (docs.length === 0) {
    docList.innerHTML = '<li class="write-doc-empty">Ingen dokumenter ennå.</li>';
    return;
  }
  docList.innerHTML = docs.map((d) => `
    <li>
      <button class="write-doc-item ${d.id === currentDocId ? 'active' : ''}"
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

  viewPanel.classList.add('write-panel-active');
  backBtn.classList.remove('d-none');
}

function showEditMode(doc) {
  emptyState.classList.add('d-none');
  viewMode.classList.add('d-none');
  editMode.classList.remove('d-none');

  editTitle.value = doc?.title || '';
  editContent.value = doc?.content || '';
  editContent.focus();

  viewPanel.classList.add('write-panel-active');
  backBtn.classList.remove('d-none');
}

async function loadDocs() {
  try {
    currentDocs = await getDocuments();
    renderDocList(currentDocs);
    if (currentDocId) {
      const still = currentDocs.find((d) => d.id === currentDocId);
      if (still) showViewMode(still);
      else {
        currentDocId = null;
        showEmptyState();
      }
    }
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke laste dokumenter.');
  }
}

function selectDoc(id) {
  currentDocId = id;
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
  currentDocId = null;
  isNewDoc = true;
  renderDocList(currentDocs);
  showEditMode(null);
  saveBtn.textContent = 'Opprett';
});

cancelEditBtn.addEventListener('click', () => {
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

  if (!title) {
    editTitle.focus();
    return;
  }

  saveBtn.disabled = true;
  try {
    if (isNewDoc) {
      const ref = await addDocument({ title, content }, currentUser);
      currentDocId = ref.id;
      isNewDoc = false;
    } else {
      await updateDocument(currentDocId, { title, content });
    }
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

deleteBtn.addEventListener('click', async () => {
  if (!currentDocId) return;
  const doc = currentDocs.find((d) => d.id === currentDocId);
  const title = doc?.title || 'dette dokumentet';
  if (!confirm(`Slette «${title}»?`)) return;

  try {
    await deleteDocument(currentDocId);
    currentDocId = null;
    showEmptyState();
    viewPanel.classList.remove('write-panel-active');
    backBtn.classList.add('d-none');
    await loadDocs();
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke slette.');
  }
});

backBtn.addEventListener('click', () => {
  viewPanel.classList.remove('write-panel-active');
  backBtn.classList.add('d-none');
  currentDocId = null;
  isNewDoc = false;
  saveBtn.textContent = 'Lagre';
  showEmptyState();
  renderDocList(currentDocs);
});

requireAuth((user) => {
  document.body.classList.remove('app-auth-pending');
  document.body.classList.add('app-auth-ready');
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadDocs();
});
