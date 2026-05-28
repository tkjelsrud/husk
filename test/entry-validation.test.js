import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEntryText, validateCategory, validateEntryText } from '../js/lib/entry-validation.js';

test('normalizeEntryText trims lines and removes blanks', () => {
  assert.equal(normalizeEntryText(' one \n\n two \n'), 'one\ntwo');
});

test('validateEntryText rejects empty input', () => {
  assert.deepEqual(validateEntryText('   '), {
    ok: false,
    message: 'Skriv minst en linje.'
  });
});

test('validateEntryText rejects more than five lines', () => {
  assert.deepEqual(validateEntryText('1\n2\n3\n4\n5\n6'), {
    ok: false,
    message: 'Bruk maks 5 linjer.'
  });
});

test('validateEntryText accepts one to five lines', () => {
  assert.deepEqual(validateEntryText('1\n2\n3'), { ok: true });
});

test('validateCategory rejects invalid category', () => {
  assert.deepEqual(validateCategory('invalid', ['unknown', 'work']), {
    ok: false,
    message: 'Velg en gyldig kategori.'
  });
});

test('validateCategory accepts allowed category', () => {
  assert.deepEqual(validateCategory('unknown', ['unknown', 'work']), { ok: true });
});

test('validateCategory accepts huskmcp category when allowed', () => {
  assert.deepEqual(validateCategory('huskmcp', ['unknown', 'huskmcp']), { ok: true });
});

test('validateCategory accepts axiom category when included in allowed list', () => {
  const categories = ['unknown', 'work', 'creative', 'houseproj', 'family', 'general', 'huskmcp', 'axiom'];
  assert.deepEqual(validateCategory('axiom', categories), { ok: true });
});

test('validateCategory rejects axiom when not in allowed list', () => {
  assert.deepEqual(validateCategory('axiom', ['unknown', 'work']), {
    ok: false,
    message: 'Velg en gyldig kategori.'
  });
});

test('validateEntryText accepts multi-line axiom text with attribution', () => {
  const axiom = 'If I had an hour to solve a problem\nI would spend 55 minutes on the problem.\n~ Albert Einstein';
  assert.deepEqual(validateEntryText(axiom), { ok: true });
});

test('validateEntryText rejects axiom text exceeding five lines', () => {
  const tooLong = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n~ Source';
  assert.deepEqual(validateEntryText(tooLong), {
    ok: false,
    message: 'Bruk maks 5 linjer.'
  });
});
