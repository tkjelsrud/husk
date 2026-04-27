import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HIDE_OLDER_THAN_DAYS,
  isOlderThanThreshold,
  isPastDue,
  shouldHideEntry,
  toDate
} from '../js/lib/entries-filter.js';

test('toDate returns null for missing and invalid values', () => {
  assert.equal(toDate(null), null);
  assert.equal(toDate('invalid'), null);
});

test('toDate supports firestore-like timestamp objects', () => {
  const source = new Date('2026-04-01T12:00:00Z');
  const result = toDate({ toDate: () => source });
  assert.equal(result?.toISOString(), source.toISOString());
});

test('isOlderThanThreshold hides entries older than two weeks', () => {
  const now = new Date('2026-04-27T12:00:00Z');
  const oldEntry = new Date(now);
  oldEntry.setDate(oldEntry.getDate() - HIDE_OLDER_THAN_DAYS - 1);

  assert.equal(isOlderThanThreshold(oldEntry, now), true);
});

test('isOlderThanThreshold keeps entries at the threshold visible', () => {
  const now = new Date('2026-04-27T12:00:00Z');
  const thresholdEntry = new Date(now);
  thresholdEntry.setDate(thresholdEntry.getDate() - HIDE_OLDER_THAN_DAYS);

  assert.equal(isOlderThanThreshold(thresholdEntry, now), false);
});

test('isPastDue hides entries with due date in the past', () => {
  const now = new Date('2026-04-27T12:00:00Z');
  assert.equal(isPastDue('2026-04-27T11:59:00Z', now), true);
  assert.equal(isPastDue('2026-04-27T12:01:00Z', now), false);
});

test('shouldHideEntry hides old or past-due entries only', () => {
  const now = new Date('2026-04-27T12:00:00Z');

  assert.equal(
    shouldHideEntry({ createdAt: '2026-04-01T12:00:00Z', dueDate: null }, now),
    true
  );

  assert.equal(
    shouldHideEntry({ createdAt: '2026-04-20T12:00:00Z', dueDate: '2026-04-26T12:00:00Z' }, now),
    true
  );

  assert.equal(
    shouldHideEntry({ createdAt: '2026-04-20T12:00:00Z', dueDate: '2026-04-28T12:00:00Z' }, now),
    false
  );
});
