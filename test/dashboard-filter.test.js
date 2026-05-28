import test from 'node:test';
import assert from 'node:assert/strict';

import { hasFixedCalendarDate, matchesRecentFilter } from '../js/lib/dashboard-filter.js';

// ── hasFixedCalendarDate ──────────────────────────────────

test('hasFixedCalendarDate returns false when dueDate is absent', () => {
  assert.equal(hasFixedCalendarDate({}), false);
  assert.equal(hasFixedCalendarDate({ dueDate: null }), false);
  assert.equal(hasFixedCalendarDate(null), false);
});

test('hasFixedCalendarDate returns true when dueDate is set', () => {
  assert.equal(hasFixedCalendarDate({ dueDate: '2026-06-01' }), true);
  assert.equal(hasFixedCalendarDate({ dueDate: { toDate: () => new Date() } }), true);
});

// ── Axiom exclusion ───────────────────────────────────────

test('matchesRecentFilter excludes axiom entries from general tab', () => {
  assert.equal(matchesRecentFilter({ category: 'axiom' }, 'general'), false);
});

test('matchesRecentFilter excludes axiom entries from work tab', () => {
  assert.equal(matchesRecentFilter({ category: 'axiom' }, 'work'), false);
});

test('matchesRecentFilter excludes axiom entries from calendar tab', () => {
  assert.equal(matchesRecentFilter({ category: 'axiom', dueDate: '2026-06-01' }, 'calendar'), false);
});

// ── General tab ───────────────────────────────────────────

test('matchesRecentFilter general tab shows non-work entries without dueDate', () => {
  assert.equal(matchesRecentFilter({ category: 'family' }, 'general'), true);
  assert.equal(matchesRecentFilter({ category: 'unknown' }, 'general'), true);
  assert.equal(matchesRecentFilter({ category: 'general' }, 'general'), true);
});

test('matchesRecentFilter general tab excludes work entries', () => {
  assert.equal(matchesRecentFilter({ category: 'work' }, 'general'), false);
});

test('matchesRecentFilter general tab excludes entries with dueDate', () => {
  assert.equal(matchesRecentFilter({ category: 'family', dueDate: '2026-06-01' }, 'general'), false);
});

// ── Work tab ──────────────────────────────────────────────

test('matchesRecentFilter work tab shows work entries without dueDate', () => {
  assert.equal(matchesRecentFilter({ category: 'work' }, 'work'), true);
});

test('matchesRecentFilter work tab excludes non-work entries', () => {
  assert.equal(matchesRecentFilter({ category: 'family' }, 'work'), false);
  assert.equal(matchesRecentFilter({ category: 'general' }, 'work'), false);
});

test('matchesRecentFilter work tab excludes work entries with dueDate', () => {
  assert.equal(matchesRecentFilter({ category: 'work', dueDate: '2026-06-01' }, 'work'), false);
});

// ── Calendar tab ──────────────────────────────────────────

test('matchesRecentFilter calendar tab shows entries with dueDate', () => {
  assert.equal(matchesRecentFilter({ category: 'work', dueDate: '2026-06-01' }, 'calendar'), true);
  assert.equal(matchesRecentFilter({ category: 'family', dueDate: '2026-06-01' }, 'calendar'), true);
});

test('matchesRecentFilter calendar tab excludes entries without dueDate', () => {
  assert.equal(matchesRecentFilter({ category: 'work' }, 'calendar'), false);
  assert.equal(matchesRecentFilter({ category: 'family', dueDate: null }, 'calendar'), false);
});
