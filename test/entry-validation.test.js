import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEntryText, validateCategory, validateEntryText } from '../js/lib/entry-validation.js';

test('normalizeEntryText trims lines and removes blanks', () => {
  assert.equal(normalizeEntryText(' one \n\n two \n'), 'one\ntwo');
});

test('validateEntryText rejects empty input', () => {
  assert.deepEqual(validateEntryText('   '), {
    ok: false,
    message: 'Enter at least 1 line of text.'
  });
});

test('validateEntryText rejects more than five lines', () => {
  assert.deepEqual(validateEntryText('1\n2\n3\n4\n5\n6'), {
    ok: false,
    message: 'Use at most 5 lines.'
  });
});

test('validateEntryText accepts one to five lines', () => {
  assert.deepEqual(validateEntryText('1\n2\n3'), { ok: true });
});

test('validateCategory rejects invalid category', () => {
  assert.deepEqual(validateCategory('invalid', ['unknown', 'work']), {
    ok: false,
    message: 'Choose a valid category.'
  });
});

test('validateCategory accepts allowed category', () => {
  assert.deepEqual(validateCategory('unknown', ['unknown', 'work']), { ok: true });
});
