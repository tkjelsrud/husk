import test from 'node:test';
import assert from 'node:assert/strict';

// Test the sorting logic used in dashboard.js for recent entries
// Entries are sorted by createdAt (newest first) from getEntries()
// This test verifies the expected sorting behavior

function sortEntriesByCreatedAt(entries) {
  return entries.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime; // newest first
  });
}

test('sortEntriesByCreatedAt sorts by newest first', () => {
  const entries = [
    { id: 1, done: false, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: false, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntriesByCreatedAt(entries);
  
  assert.equal(sorted[0].id, 2); // newest (3000)
  assert.equal(sorted[1].id, 3); // middle (2000)
  assert.equal(sorted[2].id, 1); // oldest (1000)
});

test('sortEntriesByCreatedAt treats done and pending equally', () => {
  const entries = [
    { id: 1, done: true, createdAt: { toMillis: () => 1000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 3000 } },
    { id: 3, done: true, createdAt: { toMillis: () => 2000 } }
  ];

  const sorted = sortEntriesByCreatedAt(entries);
  
  // Should be sorted by createdAt only, not by done status
  assert.equal(sorted[0].id, 2); // newest (3000)
  assert.equal(sorted[1].id, 3); // middle (2000)
  assert.equal(sorted[2].id, 1); // oldest (1000)
});

test('sortEntriesByCreatedAt handles mixed entries correctly', () => {
  const entries = [
    { id: 1, done: true, createdAt: { toMillis: () => 5000 } },
    { id: 2, done: false, createdAt: { toMillis: () => 2000 } },
    { id: 3, done: true, createdAt: { toMillis: () => 1000 } },
    { id: 4, done: false, createdAt: { toMillis: () => 4000 } },
    { id: 5, done: false, createdAt: { toMillis: () => 3000 } }
  ];

  const sorted = sortEntriesByCreatedAt(entries);
  
  // All entries sorted by createdAt descending
  assert.equal(sorted[0].id, 1); // 5000
  assert.equal(sorted[1].id, 4); // 4000
  assert.equal(sorted[2].id, 5); // 3000
  assert.equal(sorted[3].id, 2); // 2000
  assert.equal(sorted[4].id, 3); // 1000
});

test('sortEntriesByCreatedAt handles entries without createdAt', () => {
  const entries = [
    { id: 1, done: false, createdAt: null },
    { id: 2, done: false, createdAt: { toMillis: () => 2000 } },
    { id: 3, done: true, createdAt: null }
  ];

  const sorted = sortEntriesByCreatedAt(entries);
  
  // Entries with null createdAt should have timestamp 0 and be at the end
  assert.equal(sorted[0].id, 2); // 2000
  // id 1 and 3 both have 0, order between them is undefined
  assert.equal(sorted[0].createdAt?.toMillis?.() || 0, 2000);
});
