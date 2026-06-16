import { logout, requireAuth } from './auth.js';
import {
  addAudioNote,
  deleteAudioNote,
  getAudioNotes,
  isFirestoreAuthError,
  MAX_AUDIO_BYTES,
  updateAudioNote,
  uploadAudioFile,
} from './audio-db.js';

const noteList = document.getElementById('note-list');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');

const viewPanel = document.getElementById('view-panel');
const emptyState = document.getElementById('empty-state');
const viewMode = document.getElementById('view-mode');
const editMode = document.getElementById('edit-mode');

const viewTitle = document.getElementById('view-title');
const viewTouchDots = document.getElementById('view-touch-dots');
const viewPlayer = document.getElementById('view-player');
const viewBody = document.getElementById('view-body');
const archiveBtn = document.getElementById('archive-btn');
const editBtn = document.getElementById('edit-btn');
const deleteBtn = document.getElementById('delete-btn');

const editTitle = document.getElementById('edit-title');
const editText = document.getElementById('edit-text');
const fileField = document.getElementById('file-field');
const fileInput = document.getElementById('audio-file');
const fileError = document.getElementById('file-error');
const touchDotsEl = document.getElementById('audio-touch-dots');
const saveBtn = document.getElementById('save-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const newBtn = document.getElementById('new-btn');
const backBtn = document.getElementById('back-btn');

const ACCEPTED_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];
const TOUCH_COLORS = ['', '#c9a030', '#93b62d', '#52a840', '#3a9050', '#267a38'];

let currentUser = null;
let currentNoteId = null;
let currentNotes = [];
let isNewNote = false;
let currentTouches = 0;

logoutButton.addEventListener('click', () => logout());

function renderTouchPips(meta) {
  const n = Number(meta?.touches) || 0;
  if (n <= 0) return '';
  const color = TOUCH_COLORS[Math.min(n, 5)];
  return Array.from({ length: n }, () =>
    `<span class="touch-dot-pip" style="background:${color}"></span>`
  ).join('');
}

function updateTouchDots() {
  const color = TOUCH_COLORS[currentTouches] || '';
  touchDotsEl.querySelectorAll('.touch-dot-btn').forEach((btn, i) => {
    if (i < currentTouches) {
      btn.style.background = color;
      btn.classList.add('filled');
    } else {
      btn.style.background = '';
      btn.classList.remove('filled');
    }
  });
}

touchDotsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.touch-dot-btn');
  if (!btn) return;
  const dot = parseInt(btn.dataset.dot, 10);
  currentTouches = currentTouches === dot ? 0 : dot;
  updateTouchDots();
});

function getNoteIdFromHash() {
  return decodeURIComponent(window.location.hash.replace(/^#/, '')) || null;
}

function setNoteIdInHash(id) {
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

function renderNoteList(notes) {
  if (notes.length === 0) {
    noteList.innerHTML = '<li class="write-doc-empty">Ingen lydnotater ennå.</li>';
    return;
  }
  noteList.innerHTML = notes.map((n) => `
    <li>
      <button class="write-doc-item ${n.id === currentNoteId ? 'active' : ''} ${n.archived ? 'write-doc-archived' : ''}"
              type="button" data-note-id="${escapeHtml(n.id)}">
        <span class="write-doc-title">${escapeHtml(n.title || '(uten tittel)')}</span>
        <span class="write-doc-date">${formatDate(n.updatedAt)}</span>
      </button>
    </li>
  `).join('');
}

function showEmptyState() {
  emptyState.classList.remove('d-none');
  viewMode.classList.add('d-none');
  editMode.classList.add('d-none');
}

function renderText(text) {
  const value = text || '';
  if (!value.trim()) return '<p class="audio-text-empty text-muted">Ingen notater.</p>';
  return window.marked ? window.marked.parse(value) : `<pre>${escapeHtml(value)}</pre>`;
}

function showViewMode(note) {
  emptyState.classList.add('d-none');
  editMode.classList.add('d-none');
  viewMode.classList.remove('d-none');

  viewTitle.textContent = note.title || '(uten tittel)';
  viewTouchDots.innerHTML = renderTouchPips(note.meta);
  viewPlayer.src = note.audioUrl || '';
  viewBody.innerHTML = renderText(note.text);
  archiveBtn.textContent = note.archived ? 'Hent fram' : 'Arkiver';

  viewPanel.classList.add('write-panel-active');
  backBtn.classList.remove('d-none');
}

function showEditMode(note) {
  emptyState.classList.add('d-none');
  viewMode.classList.add('d-none');
  editMode.classList.remove('d-none');

  editTitle.value = note?.title || '';
  editText.value = note?.text || '';
  fileInput.value = '';
  fileError.classList.add('d-none');
  // The audio file can only be chosen when creating a note.
  fileField.classList.toggle('d-none', !isNewNote);
  saveBtn.textContent = isNewNote ? 'Last opp' : 'Lagre';
  currentTouches = Number(note?.meta?.touches) || 0;
  updateTouchDots();

  viewPanel.classList.add('write-panel-active');
  backBtn.classList.remove('d-none');
  editTitle.focus();
}

async function loadNotes() {
  try {
    currentNotes = await getAudioNotes();
    if (!currentNoteId) currentNoteId = getNoteIdFromHash();
    renderNoteList(currentNotes);
    if (currentNoteId) {
      const still = currentNotes.find((n) => n.id === currentNoteId);
      if (still) showViewMode(still);
      else {
        currentNoteId = null;
        setNoteIdInHash(null);
        showEmptyState();
      }
    }
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke laste lydnotater.');
  }
}

function selectNote(id) {
  currentNoteId = id;
  setNoteIdInHash(id);
  isNewNote = false;
  const note = currentNotes.find((n) => n.id === id);
  if (!note) return;
  renderNoteList(currentNotes);
  showViewMode(note);
}

function validateFile(file) {
  if (!file) return 'Velg en lydfil (mp3 eller wav).';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ACCEPTED_EXT.includes(ext)) return `Filtype .${ext} støttes ikke. Bruk mp3 eller wav.`;
  if (file.size > MAX_AUDIO_BYTES) {
    return `Filen er for stor (${(file.size / 1024 / 1024).toFixed(1)} MB). Maks 30 MB.`;
  }
  return null;
}

noteList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-note-id]');
  if (!btn) return;
  selectNote(btn.dataset.noteId);
});

editBtn.addEventListener('click', () => {
  const note = currentNotes.find((n) => n.id === currentNoteId);
  if (!note) return;
  isNewNote = false;
  showEditMode(note);
});

newBtn.addEventListener('click', () => {
  currentNoteId = null;
  isNewNote = true;
  renderNoteList(currentNotes);
  showEditMode(null);
  saveBtn.textContent = 'Last opp';
});

cancelEditBtn.addEventListener('click', () => {
  if (isNewNote) {
    isNewNote = false;
    showEmptyState();
    viewPanel.classList.remove('write-panel-active');
    backBtn.classList.add('d-none');
  } else {
    const note = currentNotes.find((n) => n.id === currentNoteId);
    if (note) showViewMode(note);
  }
  saveBtn.textContent = 'Lagre';
});

saveBtn.addEventListener('click', async () => {
  const title = editTitle.value.trim();
  const text = editText.value;

  if (!title) {
    editTitle.focus();
    return;
  }

  let file = null;
  if (isNewNote) {
    file = fileInput.files[0];
    const fileProblem = validateFile(file);
    if (fileProblem) {
      fileError.textContent = fileProblem;
      fileError.classList.remove('d-none');
      return;
    }
    fileError.classList.add('d-none');
  }

  saveBtn.disabled = true;
  const originalLabel = saveBtn.textContent;
  try {
    let savedId = currentNoteId;
    let savedAudioUrl = '';

    if (isNewNote) {
      saveBtn.textContent = 'Laster opp…';
      const { audioPath, audioUrl, mimeType } = await uploadAudioFile(file, currentUser);
      savedAudioUrl = audioUrl;
      const ref = await addAudioNote(
        { title, text, audioPath, audioUrl, mimeType, source: 'upload', touches: currentTouches },
        currentUser
      );
      savedId = ref.id;
      currentNoteId = savedId;
      setNoteIdInHash(savedId);
      isNewNote = false;
    } else {
      await updateAudioNote(currentNoteId, { title, text, touches: currentTouches });
    }
    saveBtn.textContent = 'Lagre';
    await loadNotes();
    // loadNotes() may reset currentNoteId to null if Firestore doesn't yet return
    // the note we just wrote (intermittent read issue). Restore and fall back to
    // locally-known data so view mode is always shown after a successful save.
    currentNoteId = savedId;
    const updated = currentNotes.find((n) => n.id === savedId)
      || { id: savedId, title, text, audioUrl: savedAudioUrl };
    showViewMode(updated);
  } catch (err) {
    saveBtn.textContent = originalLabel;
    handleFirestoreError(err, 'Kunne ikke lagre lydnotatet.');
  } finally {
    saveBtn.disabled = false;
  }
});

archiveBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  const note = currentNotes.find((n) => n.id === currentNoteId);
  if (!note) return;
  const nextArchived = !note.archived;
  archiveBtn.disabled = true;
  try {
    await updateAudioNote(currentNoteId, { archived: nextArchived });
    await loadNotes();
    const updated = currentNotes.find((n) => n.id === currentNoteId);
    if (updated) showViewMode(updated);
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke endre arkivstatus.');
  } finally {
    archiveBtn.disabled = false;
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  const note = currentNotes.find((n) => n.id === currentNoteId);
  const title = note?.title || 'dette lydnotatet';
  if (!confirm(`Slette «${title}»? Lydfilen slettes også.`)) return;

  try {
    await deleteAudioNote(currentNoteId, note?.audioPath);
    currentNoteId = null;
    setNoteIdInHash(null);
    showEmptyState();
    viewPanel.classList.remove('write-panel-active');
    backBtn.classList.add('d-none');
    await loadNotes();
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke slette lydnotatet.');
  }
});

backBtn.addEventListener('click', () => {
  viewPanel.classList.remove('write-panel-active');
  backBtn.classList.add('d-none');
  currentNoteId = null;
  setNoteIdInHash(null);
  isNewNote = false;
  saveBtn.textContent = 'Lagre';
  showEmptyState();
  renderNoteList(currentNotes);
});

requireAuth((user) => {
  document.body.classList.remove('app-auth-pending');
  document.body.classList.add('app-auth-ready');
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadNotes();
});
