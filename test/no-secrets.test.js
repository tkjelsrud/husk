import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

// Firebase web API keys always start with AIzaSy followed by 33 base64url chars
const FIREBASE_API_KEY = /AIzaSy[A-Za-z0-9_\-]{33}/;

// Files that are gitignored and must NOT be scanned (they are allowed to have keys)
const GITIGNORED = new Set([
  'js/firebase-config.js',
  'js/runtime-config.js'
]);

function collectSourceFiles(dir, base = dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const rel  = full.slice(base.length + 1);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, base, results);
    } else if (['.html', '.js'].includes(extname(entry)) && !GITIGNORED.has(rel)) {
      results.push({ rel, full });
    }
  }
  return results;
}

const root = resolve('.');
const files = collectSourceFiles(root);

test('no committed source files contain a Firebase API key', () => {
  const violations = files
    .filter(({ full }) => FIREBASE_API_KEY.test(readFileSync(full, 'utf8')))
    .map(({ rel }) => rel);

  assert.deepEqual(
    violations,
    [],
    `Firebase API key found in committed file(s):\n  ${violations.join('\n  ')}\n` +
    'Move credentials to js/firebase-config.js (gitignored) — never inline them.'
  );
});

test('firebase-config.example.js uses placeholder values only', () => {
  const content = readFileSync(resolve('js/firebase-config.example.js'), 'utf8');
  assert.doesNotMatch(
    content,
    FIREBASE_API_KEY,
    'firebase-config.example.js must contain placeholder values, not a real API key'
  );
});
