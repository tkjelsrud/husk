import test from 'node:test';
import assert from 'node:assert/strict';

// Test swipe gesture logic constants and calculations
const SWIPE_THRESHOLD = 100; // pixels to swipe before marking as done
const VERTICAL_THRESHOLD = 30; // max vertical movement to still count as horizontal swipe

function shouldCompleteSwipe(deltaX, deltaY) {
  // Check if movement is horizontal enough
  if (deltaY > VERTICAL_THRESHOLD && Math.abs(deltaX) < 20) {
    return false; // Too vertical, cancel swipe
  }
  
  // Only complete if swiped right past threshold
  return deltaX >= SWIPE_THRESHOLD;
}

function calculateSwipeTransform(deltaX) {
  // Only allow swipe to the right, cap at threshold + 20
  if (deltaX <= 0) return 0;
  return Math.min(deltaX, SWIPE_THRESHOLD + 20);
}

function isSwipeThresholdReached(deltaX) {
  return deltaX >= SWIPE_THRESHOLD;
}

test('shouldCompleteSwipe returns true when threshold is reached', () => {
  assert.equal(shouldCompleteSwipe(100, 5), true);
  assert.equal(shouldCompleteSwipe(150, 10), true);
});

test('shouldCompleteSwipe returns false when threshold not reached', () => {
  assert.equal(shouldCompleteSwipe(50, 5), false);
  assert.equal(shouldCompleteSwipe(99, 10), false);
});

test('shouldCompleteSwipe returns false when movement is too vertical', () => {
  assert.equal(shouldCompleteSwipe(15, 31), false);
  assert.equal(shouldCompleteSwipe(10, 50), false);
});

test('shouldCompleteSwipe allows horizontal swipe with some vertical movement', () => {
  assert.equal(shouldCompleteSwipe(100, 20), true);
  assert.equal(shouldCompleteSwipe(120, 29), true);
});

test('shouldCompleteSwipe returns false for left swipe', () => {
  assert.equal(shouldCompleteSwipe(-100, 5), false);
  assert.equal(shouldCompleteSwipe(-50, 10), false);
});

test('calculateSwipeTransform returns 0 for negative deltaX', () => {
  assert.equal(calculateSwipeTransform(-50), 0);
  assert.equal(calculateSwipeTransform(-100), 0);
});

test('calculateSwipeTransform returns deltaX when below cap', () => {
  assert.equal(calculateSwipeTransform(50), 50);
  assert.equal(calculateSwipeTransform(100), 100);
});

test('calculateSwipeTransform caps at threshold + 20', () => {
  assert.equal(calculateSwipeTransform(130), 120);
  assert.equal(calculateSwipeTransform(200), 120);
});

test('isSwipeThresholdReached detects when threshold is met', () => {
  assert.equal(isSwipeThresholdReached(100), true);
  assert.equal(isSwipeThresholdReached(150), true);
  assert.equal(isSwipeThresholdReached(99), false);
  assert.equal(isSwipeThresholdReached(50), false);
});

test('swipe constants are reasonable values', () => {
  assert.equal(SWIPE_THRESHOLD > 0, true);
  assert.equal(VERTICAL_THRESHOLD > 0, true);
  assert.equal(SWIPE_THRESHOLD > VERTICAL_THRESHOLD, true);
});
