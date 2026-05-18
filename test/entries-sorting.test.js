import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSequentialSortOrders, compareEntries, sortEntries } from '../js/lib/entry-order.js';

test('compareEntries sorts active notes by sortOrder descending', () => {
  const entries = [
    { id: 1, done: false, sortOrder: 1000, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, sortOrder: 3000, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: false, sortOrder: 2000, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntries(entries);

  assert.deepEqual(sorted.map((entry) => entry.id), [2, 3, 1]);
});

test('compareEntries keeps done notes below active notes', () => {
  const entries = [
    { id: 1, done: true, sortOrder: 9000, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, sortOrder: 1000, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: true, sortOrder: 8000, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntries(entries);

  assert.deepEqual(sorted.map((entry) => entry.id), [2, 1, 3]);
});

test('compareEntries falls back to createdAt for legacy notes without sortOrder', () => {
  const entries = [
    { id: 1, done: false, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: false, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntries(entries);

  assert.deepEqual(sorted.map((entry) => entry.id), [2, 3, 1]);
});

test('assignSequentialSortOrders gives highest order to first entry', () => {
  const entries = [
    { id: 'a', done: false },
    { id: 'b', done: false },
    { id: 'c', done: true }
  ];

  const normalized = assignSequentialSortOrders(entries);

  assert.deepEqual(
    normalized.map((entry) => ({ id: entry.id, sortOrder: entry.sortOrder })),
    [
      { id: 'a', sortOrder: 3000 },
      { id: 'b', sortOrder: 2000 },
      { id: 'c', sortOrder: 1000 }
    ]
  );
});
