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

  const lines = normalized.split('\n');
  if (lines.length > 5) {
    return { ok: false, message: 'Bruk maks 5 linjer.' };
  }

  return { ok: true };
}

export function validateCategory(value, allowedCategories) {
  if (!Array.isArray(allowedCategories) || !allowedCategories.includes(value)) {
    return { ok: false, message: 'Velg en gyldig kategori.' };
  }

  return { ok: true };
}
