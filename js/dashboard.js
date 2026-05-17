import { logout, requireAuth } from './auth.js';
import { addEntry, getEntries, markEntryDone, ENTRY_CATEGORIES } from './db.js';
import { normalizeEntryText, validateCategory, validateEntryText } from './lib/entry-validation.js';
import { openEditModal } from './edit-modal.js';

const recentSection = document.getElementById('recent-section');
const recentList = document.getElementById('recent-list');

const form = document.getElementById('entry-form');
const textField = document.getElementById('entry-text');
const categoryField = document.getElementById('entry-category');
const submitButton = document.getElementById('submit-btn');
const logoutButton = document.getElementById('logout-btn');
const userLabel = document.getElementById('user-label');
const statusMsg = document.getElementById('status-msg');

let currentUser = null;

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
    console.error(err);
    showStatus('danger', 'Kunne ikke lagre.');
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
  return new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
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

function handleTouchStart(e) {
  const touch = e.touches[0];
  swipeState.startX = touch.clientX;
  swipeState.startY = touch.clientY;
  swipeState.currentX = touch.clientX;
  swipeState.element = e.currentTarget;
  swipeState.isDone = false;
}

function handleTouchMove(e) {
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
    const entries = await getEntries();
    if (entries.length === 0) return;
    recentSection.classList.remove('d-none');
    const isJobbVisible = jobbFilter && jobbFilter.checked;
    const filteredEntries = entries.filter((e) => isJobbVisible || e.category !== 'work');
    
    // Sort: done items at the bottom (by createdAt for each group)
    const sortedEntries = filteredEntries.sort((a, b) => {
      // First, separate by done status
      if (a.done !== b.done) {
        return a.done ? 1 : -1; // done items go to bottom
      }
      // Within each group, sort by createdAt (newest first)
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    
    recentList.innerHTML = sortedEntries.slice(0, 10).map((e) => {
      const text = escapeHtml(String(e.textInput || '').replace(/\s+/g, ' ').trim());
      const date = escapeHtml(formatShortDate(e.createdAt));
      const statusClass = e.processed ? 'done' : 'pending';
      const doneClass = e.done === true ? 'entry-done' : '';
      return `<div class="recent-entry ${doneClass}" role="button" tabindex="0"
        data-edit-id="${escapeHtml(e.id)}"
        data-edit-text="${escapeAttr(String(e.textInput || ''))}"
        data-edit-category="${escapeHtml(String(e.category || 'unknown'))}"
        data-edit-done="${e.done === true ? 'true' : 'false'}">
        <span class="status-dot ${statusClass}" aria-hidden="true"></span>
        <span class="recent-entry-text">${text}</span>
        <span class="recent-entry-date">${date}</span>
      </div>`;
    }).join('');
    
    // Attach swipe gesture handlers after rendering
    attachSwipeHandlers();
  } catch (err) {
    console.error(err);
  }
}

// Filter the dashboard when 'Vis jobber' checkbox is toggled
const jobbFilter = document.getElementById('filter-jobb');
if (jobbFilter) {
  jobbFilter.addEventListener('change', () => loadRecent());
}

recentList.addEventListener('click', (e) => {
  const row = e.target.closest('[data-edit-id]');
  if (!row) return;
  openEditModal({
    id: row.dataset.editId,
    textInput: row.dataset.editText,
    category: row.dataset.editCategory,
    done: row.dataset.editDone === 'true'
  }, loadRecent);
});

recentList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('[data-edit-id]');
  if (!row) return;
  e.preventDefault();
  row.click();
});

requireAuth((user) => {
  currentUser = user;
  userLabel.textContent = user.email || '';
  loadRecent();
});
