import { logout, requireAuth } from './auth.js';
import { addEntry, getEntries, isFirestoreAuthError, markEntryDone, deleteEntry, saveRegularEntriesOrder, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';
import { sortEntries } from './lib/entry-order.js';
import { openEditModal } from './edit-modal.js';
import { matchesRecentFilter as _matchesRecentFilter } from './lib/dashboard-filter.js';

const TOUCH_COLORS = ['', '#c9a030', '#93b62d', '#52a840', '#3a9050', '#267a38'];
function renderTouchDots(meta) {
  const n = Number(meta?.touches) || 0;
  if (n <= 0) return '';
  const color = TOUCH_COLORS[Math.min(n, 5)];
  return Array.from({ length: n }, () =>
    `<span class="touch-dot-pip" style="background:${color}"></span>`
  ).join('');
}

const recentSection = document.getElementById('recent-section');
const recentList = document.getElementById('recent-list');
const recentFilterTabs = document.getElementById('recent-filter-tabs');

const form = document.getElementById('entry-form');
const textField = document.getElementById('entry-text');
const categoryField = document.getElementById('entry-category');
const submitButton = document.getElementById('submit-btn');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');

let currentUser = null;
let activeRecentFilter = 'general';
let currentEntries = [];
let currentFilteredEntries = [];
let currentRenderedEntries = [];

let dragState = {
  pointerId: null,
  handle: null,
  row: null,
  active: false,
  moved: false,
  startY: 0
};

// Handle compact form expand/collapse
function expandForm() {
  form.classList.add('entry-form-expanded');
  textField.setAttribute('rows', '5');
}

function collapseForm() {
  if (!textField.value.trim()) {
    form.classList.remove('entry-form-expanded');
    textField.setAttribute('rows', '1');
  }
}

textField.addEventListener('focus', expandForm);
textField.addEventListener('input', expandForm);

logoutButton.addEventListener('click', () => logout());

function showStatus(kind, message) {
  statusMsg.textContent = message;
  statusMsg.className = `alert alert-${kind}`;
  statusMsg.classList.remove('d-none');
}

function handleFirestoreError(err, fallbackMessage) {
  console.error(err);

  if (isFirestoreAuthError(err)) {
    showStatus('warning', 'Innloggingen mangler eller har utlopet. Sender til login...');
    setTimeout(() => logout(), 700);
    return;
  }

  showStatus('danger', fallbackMessage);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMsg.classList.add('d-none');

  if (!currentUser) {
    showStatus('warning', 'Logger inn. Prov igjen om et oyeblikk.');
    return;
  }

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
  showStatus('secondary', 'Lagrer...');

  try {
    await addEntry({
      textInput: normalizeEntryText(rawText),
      category
    }, currentUser);
    form.reset();
    categoryField.value = 'unknown';
    showStatus('success', 'Lagret.');
    collapseForm(); // Collapse form after successful save
    textField.focus();
    loadRecent();
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke lagre.');
  } finally {
    submitButton.disabled = false;
  }
});

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function formatShortDate(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit' }).format(date);
}

// Swipe gesture handling
let swipeState = {
  startX: 0,
  startY: 0,
  currentX: 0,
  element: null,
  isDone: false
};

const SWIPE_THRESHOLD = 100; // pixels to swipe before marking as done
const VERTICAL_THRESHOLD = 30; // max vertical movement to still count as horizontal swipe

function attachSwipeHandlers() {
  const entries = recentList.querySelectorAll('.recent-entry');
  entries.forEach(entry => {
    // Skip if already done
    if (entry.dataset.editDone === 'true') return;
    
    entry.addEventListener('touchstart', handleTouchStart, { passive: true });
    entry.addEventListener('touchmove', handleTouchMove, { passive: false });
    entry.addEventListener('touchend', handleTouchEnd);
    entry.addEventListener('touchcancel', handleTouchCancel);
  });
}

function isDragHandleTarget(target) {
  return Boolean(target?.closest?.('[data-drag-handle]'));
}

function resetDragState() {
  if (dragState.row) {
    dragState.row.classList.remove('recent-entry-dragging');
  }

  if (dragState.handle && dragState.pointerId !== null && dragState.handle.hasPointerCapture?.(dragState.pointerId)) {
    dragState.handle.releasePointerCapture(dragState.pointerId);
  }

  dragState = {
    pointerId: null,
    handle: null,
    row: null,
    active: false,
    moved: false,
    startY: 0
  };
}

function buildEntryOrderWithUpdatedFilteredIds(updatedFilteredIds) {
  const filteredIds = new Set(currentFilteredEntries.map((entry) => entry.id));
  const updatedEntriesById = new Map(
    updatedFilteredIds
      .map((entryId) => currentEntries.find((entry) => entry.id === entryId))
      .filter(Boolean)
      .map((entry) => [entry.id, entry])
  );
  const remainingFilteredEntries = currentFilteredEntries.filter((entry) => !updatedEntriesById.has(entry.id));
  const orderedFilteredEntries = [
    ...updatedFilteredIds.map((entryId) => updatedEntriesById.get(entryId)).filter(Boolean),
    ...remainingFilteredEntries
  ];

  let filteredIndex = 0;
  return currentEntries.map((entry) => {
    if (!filteredIds.has(entry.id)) return entry;
    const nextEntry = orderedFilteredEntries[filteredIndex];
    filteredIndex += 1;
    return nextEntry || entry;
  });
}

async function persistDraggedOrder() {
  const renderedIds = Array.from(recentList.querySelectorAll('.recent-entry[data-entry-id]'))
    .map((row) => row.dataset.entryId)
    .filter(Boolean);
  const activeRenderedIds = currentRenderedEntries
    .filter((entry) => entry.done !== true)
    .map((entry) => entry.id);

  if (renderedIds.length === 0 || activeRenderedIds.length === 0) return;

  const reorderedActiveIds = renderedIds.filter((entryId) => activeRenderedIds.includes(entryId));
  const nextOrderedEntries = buildEntryOrderWithUpdatedFilteredIds(reorderedActiveIds);

  currentEntries = nextOrderedEntries;
  await saveRegularEntriesOrder(currentEntries.map((entry) => entry.id));
}

async function handleDragFinish() {
  if (dragState.active && dragState.moved) {
    try {
      await persistDraggedOrder();
      await loadRecent();
    } catch (err) {
      console.error('Failed to reorder entries:', err);
      await loadRecent();
    }
  }

  resetDragState();
}

function handleDragPointerDown(event) {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle) return;

  const row = handle.closest('.recent-entry[data-entry-id]');
  if (!row) return;

  event.preventDefault();
  event.stopPropagation();

  dragState.pointerId = event.pointerId;
  dragState.handle = handle;
  dragState.row = row;
  dragState.active = false;
  dragState.moved = false;
  dragState.startY = event.clientY;

  handle.setPointerCapture?.(event.pointerId);
}

function handleDragPointerMove(event) {
  if (!dragState.row || dragState.pointerId !== event.pointerId) return;

  const deltaY = Math.abs(event.clientY - dragState.startY);
  if (!dragState.active && deltaY < 6) return;

  event.preventDefault();
  dragState.active = true;
  dragState.moved = true;
  dragState.row.classList.add('recent-entry-dragging');

  const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.recent-entry[data-entry-id]');
  if (!targetRow || targetRow === dragState.row || targetRow.parentElement !== recentList) return;

  const rect = targetRow.getBoundingClientRect();
  const insertBefore = event.clientY < rect.top + rect.height / 2;
  recentList.insertBefore(dragState.row, insertBefore ? targetRow : targetRow.nextSibling);
}

function handleDragPointerEnd(event) {
  if (dragState.pointerId !== event.pointerId) return;
  handleDragFinish();
}

function handleTouchStart(e) {
  if (isDragHandleTarget(e.target)) return;
  const touch = e.touches[0];
  swipeState.startX = touch.clientX;
  swipeState.startY = touch.clientY;
  swipeState.currentX = touch.clientX;
  swipeState.element = e.currentTarget;
  swipeState.isDone = false;
}

function handleTouchMove(e) {
  if (isDragHandleTarget(e.target)) return;
  if (!swipeState.element) return;
  
  const touch = e.touches[0];
  const deltaX = touch.clientX - swipeState.startX;
  const deltaY = Math.abs(touch.clientY - swipeState.startY);
  
  // Check if this is a horizontal swipe (not vertical scroll)
  if (deltaY > VERTICAL_THRESHOLD && Math.abs(deltaX) < 20) {
    // This is more of a vertical scroll, cancel swipe
    resetSwipe();
    return;
  }
  
  // Only allow swipe to the right
  if (deltaX > 0) {
    e.preventDefault(); // Prevent scrolling while swiping
    swipeState.currentX = touch.clientX;
    
    // Apply transform to show swipe feedback
    const translateX = Math.min(deltaX, SWIPE_THRESHOLD + 20);
    swipeState.element.style.transform = `translateX(${translateX}px)`;
    swipeState.element.style.transition = 'none';
    
    // Add visual feedback when threshold is reached
    if (deltaX >= SWIPE_THRESHOLD) {
      swipeState.element.style.opacity = '0.6';
      swipeState.isDone = true;
    } else {
      swipeState.element.style.opacity = '1';
      swipeState.isDone = false;
    }
  }
}

async function handleTouchEnd() {
  if (!swipeState.element) return;
  
  const deltaX = swipeState.currentX - swipeState.startX;
  
  if (swipeState.isDone && deltaX >= SWIPE_THRESHOLD) {
    // Complete the swipe - mark as done
    const entryId = swipeState.element.dataset.editId;
    
    // Animate out
    swipeState.element.style.transition = 'all 0.3s ease';
    swipeState.element.style.transform = `translateX(${window.innerWidth}px)`;
    swipeState.element.style.opacity = '0';
    
    try {
      await markEntryDone(entryId);
      
      // Wait for animation to complete before reloading
      setTimeout(() => {
        loadRecent();
      }, 300);
    } catch (err) {
      console.error('Failed to mark entry as done:', err);
      resetSwipe();
    }
  } else {
    // Cancel the swipe - animate back
    resetSwipe();
  }
}

function handleTouchCancel() {
  resetSwipe();
}

function resetSwipe() {
  if (swipeState.element) {
    swipeState.element.style.transition = 'all 0.2s ease';
    swipeState.element.style.transform = 'translateX(0)';
    swipeState.element.style.opacity = '1';
  }
  
  swipeState = {
    startX: 0,
    startY: 0,
    currentX: 0,
    element: null,
    isDone: false
  };
}

async function loadRecent() {
  try {
    currentEntries = await getEntries();
    const entries = currentEntries;
    if (entries.length === 0) {
      recentSection.classList.add('d-none');
      recentList.innerHTML = '';
      return;
    }

    recentSection.classList.remove('d-none');
    currentFilteredEntries = entries.filter(matchesRecentFilter);
    const filteredEntries = currentFilteredEntries;

    if (filteredEntries.length === 0) {
      recentList.innerHTML = '<div class="text-muted py-2">Ingen treff i denne fanen.</div>';
      return;
    }

    currentRenderedEntries = filteredEntries.slice(0, 20);
    recentList.innerHTML = currentRenderedEntries.map((e) => {
      const text = escapeHtml(String(e.textInput || '').replace(/\s+/g, ' ').trim());
      const date = escapeHtml(formatShortDate(e.createdAt));
      const statusClass = e.processed ? 'done' : 'pending';
      const doneClass = e.done === true ? 'entry-done' : (e.later === true ? 'entry-later' : '');
      const dragHandle = e.done === true
        ? ''
        : `<button class="recent-entry-handle" type="button" aria-label="Flytt notat" data-drag-handle="true">⋮⋮</button>`;
      return `<div class="recent-entry ${doneClass}" role="button" tabindex="0"
        data-entry-id="${escapeHtml(e.id)}"
        data-edit-id="${escapeHtml(e.id)}"
        data-edit-done="${e.done === true ? 'true' : 'false'}">
        ${dragHandle}
        <span class="status-dot ${statusClass}" aria-hidden="true"></span>
        <span class="recent-entry-text">${text}</span>
        <span class="touch-dots recent-entry-touch-dots">${renderTouchDots(e.meta)}</span>
        <span class="recent-entry-date">${date}</span>
      </div>`;
    }).join('');
    
    // Attach swipe gesture handlers after rendering
    attachSwipeHandlers();

    const doneEntries = currentFilteredEntries.filter(e => e.done === true);
    if (doneEntries.length > 0) {
      const cleanupRow = document.createElement('div');
      cleanupRow.className = 'cleanup-row';
      cleanupRow.innerHTML = `<button class="cleanup-link" type="button">rydd opp</button>`;
      cleanupRow.querySelector('.cleanup-link').addEventListener('click', async () => {
        try {
          await Promise.all(doneEntries.map(e => deleteEntry(e.id)));
          loadRecent();
        } catch (err) {
          console.error('Cleanup failed:', err);
        }
      });
      recentList.appendChild(cleanupRow);
    }
  } catch (err) {
    handleFirestoreError(err, 'Kunne ikke laste notater.');
  }
}

function matchesRecentFilter(entry) {
  return _matchesRecentFilter(entry, activeRecentFilter);
}

function updateRecentFilterTabs() {
  if (!recentFilterTabs) return;

  recentFilterTabs.querySelectorAll('[data-filter-tab]').forEach((button) => {
    const isActive = button.dataset.filterTab === activeRecentFilter;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

if (recentFilterTabs) {
  recentFilterTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-tab]');
    if (!button) return;

    const nextFilter = button.dataset.filterTab || 'general';
    if (nextFilter === activeRecentFilter) return;

    collapseForm();
    activeRecentFilter = nextFilter;
    updateRecentFilterTabs();
    loadRecent();
  });
}

updateRecentFilterTabs();

recentList.addEventListener('click', (e) => {
  if (dragState.moved || e.target.closest('[data-drag-handle]')) return;
  const row = e.target.closest('[data-edit-id]');
  if (!row) return;
  const entry = currentEntries.find((item) => item.id === row.dataset.editId);
  openEditModal({
    id: row.dataset.editId,
    textInput: row.dataset.editText,
    category: row.dataset.editCategory,
    done: row.dataset.editDone === 'true',
    ...entry
  }, loadRecent);
});

recentList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('[data-drag-handle]')) return;
  const row = e.target.closest('[data-edit-id]');
  if (!row) return;
  e.preventDefault();
  row.click();
});

requireAuth((user) => {
  document.body.classList.remove('app-auth-pending');
  document.body.classList.add('app-auth-ready');
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadRecent();
});

recentList.addEventListener('pointerdown', handleDragPointerDown);
recentList.addEventListener('pointermove', handleDragPointerMove);
recentList.addEventListener('pointerup', handleDragPointerEnd);
recentList.addEventListener('pointercancel', handleDragPointerEnd);
