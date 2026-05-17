import test from 'node:test';
import assert from 'node:assert/strict';

// Test recurrence formatting logic used in fixed.js

function formatRecurrence(recurrence) {
  if (!recurrence || recurrence.type === 'none') {
    return 'Én gang';
  }
  if (recurrence.type === 'daily') {
    return 'Daglig';
  }
  if (recurrence.type === 'weekly') {
    const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
    const days = (recurrence.daysOfWeek || []).map(d => dayNames[d]).join(', ');
    return `Ukentlig: ${days}`;
  }
  if (recurrence.type === 'monthly') {
    return `Månedlig: ${recurrence.dayOfMonth || '?'}. dag`;
  }
  if (recurrence.type === 'yearly') {
    return `Årlig: ${recurrence.date || '?'}`;
  }
  return 'Ukjent';
}

test('formatRecurrence handles none type', () => {
  assert.equal(formatRecurrence({ type: 'none' }), 'Én gang');
  assert.equal(formatRecurrence(null), 'Én gang');
  assert.equal(formatRecurrence(undefined), 'Én gang');
});

test('formatRecurrence handles daily type', () => {
  assert.equal(formatRecurrence({ type: 'daily' }), 'Daglig');
});

test('formatRecurrence handles weekly type with days', () => {
  const recurrence = { type: 'weekly', daysOfWeek: [1, 3, 5] };
  assert.equal(formatRecurrence(recurrence), 'Ukentlig: Man, Ons, Fre');
});

test('formatRecurrence handles weekly type with single day', () => {
  const recurrence = { type: 'weekly', daysOfWeek: [0] };
  assert.equal(formatRecurrence(recurrence), 'Ukentlig: Søn');
});

test('formatRecurrence handles weekly type with empty days', () => {
  const recurrence = { type: 'weekly', daysOfWeek: [] };
  assert.equal(formatRecurrence(recurrence), 'Ukentlig: ');
});

test('formatRecurrence handles monthly type', () => {
  const recurrence = { type: 'monthly', dayOfMonth: 15 };
  assert.equal(formatRecurrence(recurrence), 'Månedlig: 15. dag');
});

test('formatRecurrence handles monthly type without day', () => {
  const recurrence = { type: 'monthly' };
  assert.equal(formatRecurrence(recurrence), 'Månedlig: ?. dag');
});

test('formatRecurrence handles yearly type', () => {
  const recurrence = { type: 'yearly', date: '05-17' };
  assert.equal(formatRecurrence(recurrence), 'Årlig: 05-17');
});

test('formatRecurrence handles yearly type without date', () => {
  const recurrence = { type: 'yearly' };
  assert.equal(formatRecurrence(recurrence), 'Årlig: ?');
});

test('formatRecurrence handles unknown type', () => {
  const recurrence = { type: 'invalid' };
  assert.equal(formatRecurrence(recurrence), 'Ukjent');
});

// Test recurrence validation

function validateRecurrence(recurrence) {
  if (recurrence.type === 'weekly' && (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0)) {
    return { ok: false, message: 'Velg minst én dag for ukentlig gjentagelse.' };
  }
  if (recurrence.type === 'monthly' && !recurrence.dayOfMonth) {
    return { ok: false, message: 'Angi dag i måneden (1-31).' };
  }
  if (recurrence.type === 'yearly' && !recurrence.date) {
    return { ok: false, message: 'Angi dato i format MM-DD.' };
  }
  return { ok: true };
}

test('validateRecurrence accepts none type', () => {
  assert.deepEqual(validateRecurrence({ type: 'none' }), { ok: true });
});

test('validateRecurrence accepts daily type', () => {
  assert.deepEqual(validateRecurrence({ type: 'daily' }), { ok: true });
});

test('validateRecurrence accepts weekly with days', () => {
  const recurrence = { type: 'weekly', daysOfWeek: [1, 3, 5] };
  assert.deepEqual(validateRecurrence(recurrence), { ok: true });
});

test('validateRecurrence rejects weekly without days', () => {
  const recurrence = { type: 'weekly', daysOfWeek: [] };
  const result = validateRecurrence(recurrence);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Velg minst én dag for ukentlig gjentagelse.');
});

test('validateRecurrence accepts monthly with day', () => {
  const recurrence = { type: 'monthly', dayOfMonth: 15 };
  assert.deepEqual(validateRecurrence(recurrence), { ok: true });
});

test('validateRecurrence rejects monthly without day', () => {
  const recurrence = { type: 'monthly' };
  const result = validateRecurrence(recurrence);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Angi dag i måneden (1-31).');
});

test('validateRecurrence accepts yearly with date', () => {
  const recurrence = { type: 'yearly', date: '05-17' };
  assert.deepEqual(validateRecurrence(recurrence), { ok: true });
});

test('validateRecurrence rejects yearly without date', () => {
  const recurrence = { type: 'yearly' };
  const result = validateRecurrence(recurrence);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Angi dato i format MM-DD.');
});
