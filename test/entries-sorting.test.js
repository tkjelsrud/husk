import test from 'node:test';
import assert from 'node:assert/strict';

// Test the sorting logic used in dashboard.js for recent entries
// Done items should be at the bottom, sorted by createdAt within each group

function sortEntriesByDoneStatus(entries) {
  return entries.sort((a, b) => {
    // First, separate by done status
    if (a.done !== b.done) {
      return a.done ? 1 : -1; // done items go to bottom
    }
    // Within each group, sort by createdAt (newest first)
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
}

test('sortEntriesByDoneStatus puts done items at bottom', () => {
  const entries = [
    { id: 1, done: true, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 2000 } },
    { id: 3, done: false, createdAt: { toMillis: () => 3000 } }
  ];

  const sorted = sortEntriesByDoneStatus(entries);
  
  assert.equal(sorted[0].done, false);
  assert.equal(sorted[1].done, false);
  assert.equal(sorted[2].done, true);
});

test('sortEntriesByDoneStatus sorts by newest first within pending group', () => {
  const entries = [
    { id: 1, done: false, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: false, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntriesByDoneStatus(entries);
  
  assert.equal(sorted[0].id, 2); // newest (3000)
  assert.equal(sorted[1].id, 3); // middle (2000)
  assert.equal(sorted[2].id, 1); // oldest (1000)
});

test('sortEntriesByDoneStatus sorts by newest first within done group', () => {
  const entries = [
    { id: 1, done: true, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: true, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: true, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntriesByDoneStatus(entries);
  
  assert.equal(sorted[0].id, 2); // newest (3000)
  assert.equal(sorted[1].id, 3); // middle (2000)
  assert.equal(sorted[2].id, 1); // oldest (1000)
});

test('sortEntriesByDoneStatus handles mixed entries correctly', () => {
  const entries = [
    { id: 1, done: true, createdAt: { toMillis: () => 5000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 2000 } },
    { id: 3, done: true, createdAt: { toMillis: () => 1000 } },
    { id: 4, done: false, createdAt: { toMillis: () => 4000 } },
    { id: 5, done: false, createdAt: { toMillis: () => 3000 } }
  ];

  const sorted = sortEntriesByDoneStatus(entries);
  
  // First 3 should be pending (not done), sorted newest first
  assert.equal(sorted[0].done, false);
  assert.equal(sorted[0].id, 4); // 4000
  assert.equal(sorted[1].done, false);
  assert.equal(sorted[1].id, 5); // 3000
  assert.equal(sorted[2].done, false);
  assert.equal(sorted[2].id, 2); // 2000
  
  // Last 2 should be done, sorted newest first
  assert.equal(sorted[3].done, true);
  assert.equal(sorted[3].id, 1); // 5000
  assert.equal(sorted[4].done, true);
  assert.equal(sorted[4].id, 3); // 1000
});

test('sortEntriesByDoneStatus handles entries without createdAt', () => {
  const entries = [
    { id: 1, done: false, createdAt: null },
    { id: 2, done: false, createdAt: { toMillis: () => 2000 } },
    { id: 3, done: true, createdAt: null }
  ];

  const sorted = sortEntriesByDoneStatus(entries);
  
  // Should not throw and should maintain done at bottom
  assert.equal(sorted[0].done, false);
  assert.equal(sorted[1].done, false);
  assert.equal(sorted[2].done, true);
});
