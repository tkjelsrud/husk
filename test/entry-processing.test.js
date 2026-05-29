import test from 'node:test';
import assert from 'node:assert/strict';

import { needsBackendProcessing } from '../js/lib/entry-validation.js';

test('needsBackendProcessing: family requires backend (calendar sync)', () => {
  assert.equal(needsBackendProcessing('family'), true);
});

test('needsBackendProcessing: unknown requires backend (unclassified)', () => {
  assert.equal(needsBackendProcessing('unknown'), true);
});

test('needsBackendProcessing: empty/null/undefined requires backend', () => {
  assert.equal(needsBackendProcessing(''), true);
  assert.equal(needsBackendProcessing(null), true);
  assert.equal(needsBackendProcessing(undefined), true);
});

test('needsBackendProcessing: work skips backend', () => {
  assert.equal(needsBackendProcessing('work'), false);
});

test('needsBackendProcessing: general skips backend', () => {
  assert.equal(needsBackendProcessing('general'), false);
});

test('needsBackendProcessing: houseproj skips backend', () => {
  assert.equal(needsBackendProcessing('houseproj'), false);
});

test('needsBackendProcessing: creative skips backend', () => {
  assert.equal(needsBackendProcessing('creative'), false);
});

test('needsBackendProcessing: huskmcp skips backend', () => {
  assert.equal(needsBackendProcessing('huskmcp'), false);
});
