import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAxiom } from '../js/lib/axiom-parser.js';

test('parseAxiom returns plain text as quote with no source', () => {
  const result = parseAxiom('Simplicity is the ultimate sophistication.');
  assert.deepEqual(result, {
    quote: 'Simplicity is the ultimate sophistication.',
    source: ''
  });
});

test('parseAxiom extracts source after tilde prefix', () => {
  const raw = 'If I had an hour to solve a problem\nI would spend 55 minutes on the problem.\n~ Albert Einstein';
  const result = parseAxiom(raw);
  assert.equal(result.quote, 'If I had an hour to solve a problem\nI would spend 55 minutes on the problem.');
  assert.equal(result.source, '— Albert Einstein');
});

test('parseAxiom extracts source after dash prefix', () => {
  const raw = 'Done is better than perfect.\n- Mark Zuckerberg';
  const result = parseAxiom(raw);
  assert.equal(result.quote, 'Done is better than perfect.');
  assert.equal(result.source, '— Mark Zuckerberg');
});

test('parseAxiom extracts source after em-dash prefix', () => {
  const raw = 'Stay hungry, stay foolish.\n— Steve Jobs';
  const result = parseAxiom(raw);
  assert.equal(result.quote, 'Stay hungry, stay foolish.');
  assert.equal(result.source, '— Steve Jobs');
});

test('parseAxiom trims leading and trailing whitespace', () => {
  const result = parseAxiom('  Quality over quantity.  ');
  assert.equal(result.quote, 'Quality over quantity.');
  assert.equal(result.source, '');
});

test('parseAxiom handles empty string', () => {
  const result = parseAxiom('');
  assert.deepEqual(result, { quote: '', source: '' });
});

test('parseAxiom handles only whitespace', () => {
  const result = parseAxiom('   \n  ');
  assert.deepEqual(result, { quote: '', source: '' });
});

test('parseAxiom uses first source line when multiple attribution lines exist', () => {
  const raw = 'The only way out is through.\n~ Robert Frost\nExtra line';
  const result = parseAxiom(raw);
  assert.equal(result.quote, 'The only way out is through.');
  assert.equal(result.source, '— Robert Frost');
});

test('parseAxiom strips leading ~ and spaces from source', () => {
  const raw = 'Act as if.\n~   Epictetus';
  const result = parseAxiom(raw);
  assert.equal(result.source, '— Epictetus');
});

test('parseAxiom returns multi-line quote intact', () => {
  const raw = 'Line one.\nLine two.\nLine three.\n~ Author';
  const result = parseAxiom(raw);
  assert.equal(result.quote, 'Line one.\nLine two.\nLine three.');
});
