export function normalizeEntryText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function validateEntryText(value) {
  const normalized = normalizeEntryText(value);
  if (!normalized) {
    return { ok: false, message: 'Skriv minst en linje.' };
  }

  return { ok: true };
}

export function validateCategory(value, allowedCategories) {
  if (!Array.isArray(allowedCategories) || !allowedCategories.includes(value)) {
    return { ok: false, message: 'Velg en gyldig kategori.' };
  }

  return { ok: true };
}

// Returns true when the backend processor must handle the entry.
// family: backend syncs to Google Calendar.
// unknown: backend would classify (kept for safety; UI always sets a category).
// Everything else: user set an explicit category, mark processed immediately.
export function needsBackendProcessing(category) {
  return !category || category === 'unknown' || category === 'family';
}
