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
    return { ok: false, message: 'Enter at least 1 line of text.' };
  }

  const lines = normalized.split('\n');
  if (lines.length > 5) {
    return { ok: false, message: 'Use at most 5 lines.' };
  }

  return { ok: true };
}

export function validateCategory(value, allowedCategories) {
  if (!Array.isArray(allowedCategories) || !allowedCategories.includes(value)) {
    return { ok: false, message: 'Choose a valid category.' };
  }

  return { ok: true };
}
