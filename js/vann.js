const STORAGE_KEY = 'husk-water-intake';
const GLASS_COUNT = 8;
const BOTTLE_COUNT = 5;
const GLASS_LITERS = 0.25;
const BOTTLE_LITERS = 0.5;
const TARGET_LITERS = 1.5;

const datePill = document.getElementById('water-date-pill');
const totalLitersEl = document.getElementById('water-total-liters');
const targetBadgeEl = document.getElementById('water-target-badge');
const progressBarEl = document.getElementById('water-progress-bar');
const glassCountEl = document.getElementById('water-glass-count');
const bottleCountEl = document.getElementById('water-bottle-count');
const glassButtonsEl = document.getElementById('water-glass-buttons');
const bottleButtonsEl = document.getElementById('water-bottle-buttons');
const resetButton = document.getElementById('water-reset-btn');

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEmptyState() {
  return {
    date: getTodayKey(),
    glasses: 0,
    bottles: 0
  };
}

function clampCount(value, max) {
  return Math.max(0, Math.min(max, Number(value) || 0));
}

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    const today = getTodayKey();

    if (!parsed || parsed.date !== today) {
      return getEmptyState();
    }

    return {
      date: today,
      glasses: clampCount(parsed.glasses, GLASS_COUNT),
      bottles: clampCount(parsed.bottles, BOTTLE_COUNT)
    };
  } catch {
    return getEmptyState();
  }
}

function writeState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatLiters(value) {
  return `${value.toFixed(2).replace('.', ',')} L`;
}

function formatDate() {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  }).format(new Date());
}

function getTotalLiters(state) {
  return state.glasses * GLASS_LITERS + state.bottles * BOTTLE_LITERS;
}

function setCount(state, key, nextValue, max) {
  const currentValue = state[key];
  state[key] = currentValue === nextValue ? Math.max(0, nextValue - 1) : clampCount(nextValue, max);
  state.date = getTodayKey();
  writeState(state);
  render(state);
}

function createButtons(container, count, type, icon, label, state, max) {
  container.innerHTML = '';

  for (let index = 1; index <= count; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'water-icon-button';
    button.innerHTML = `
      <span class="water-icon" aria-hidden="true">${icon}</span>
      <span class="water-icon-label">${index}</span>
    `;
    button.setAttribute('aria-label', `${label} ${index}`);
    button.addEventListener('click', () => setCount(state, type, index, max));
    container.appendChild(button);
  }
}

function updateButtonStates(container, activeCount) {
  Array.from(container.children).forEach((button, index) => {
    const isActive = index < activeCount;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function render(state) {
  const totalLiters = getTotalLiters(state);
  const progress = Math.min(100, (totalLiters / TARGET_LITERS) * 100);
  const targetReached = totalLiters >= TARGET_LITERS;

  datePill.textContent = formatDate();
  totalLitersEl.textContent = formatLiters(totalLiters);
  targetBadgeEl.textContent = targetReached ? 'Mal nadd' : 'Under mal';
  targetBadgeEl.classList.toggle('is-complete', targetReached);
  progressBarEl.style.width = `${progress}%`;
  progressBarEl.classList.toggle('is-complete', targetReached);

  glassCountEl.textContent = `${state.glasses} / ${GLASS_COUNT}`;
  bottleCountEl.textContent = `${state.bottles} / ${BOTTLE_COUNT}`;

  updateButtonStates(glassButtonsEl, state.glasses);
  updateButtonStates(bottleButtonsEl, state.bottles);
}

const state = readState();
writeState(state);

createButtons(glassButtonsEl, GLASS_COUNT, 'glasses', '🥛', 'Glass', state, GLASS_COUNT);
createButtons(bottleButtonsEl, BOTTLE_COUNT, 'bottles', '🫙', 'Flaske', state, BOTTLE_COUNT);

resetButton.addEventListener('click', () => {
  const resetState = getEmptyState();
  writeState(resetState);
  render(resetState);
});

render(state);
