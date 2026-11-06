import test from 'node:test';
import assert from 'node:assert/strict';

import { fenceBareMermaid, isMermaidHeader } from '../js/lib/mermaid-blocks.js';

test('isMermaidHeader accepts diagram headers', () => {
  for (const line of ['flowchart LR', 'graph TD', 'flowchart', 'sequenceDiagram', 'stateDiagram-v2', 'pie title Pets', 'gantt', 'mindmap']) {
    assert.ok(isMermaidHeader(line), line);
  }
});

test('isMermaidHeader rejects ordinary prose', () => {
  for (const line of ['graph theory is fun', 'pie is good', 'gantt chart for Q3', 'flowchart for the team', 'Timeline']) {
    assert.ok(!isMermaidHeader(line), line);
  }
});

test('existing mermaid fences are left alone', () => {
  const md = 'Intro\n\n```mermaid\nflowchart LR\n  A --> B\n```\n';
  assert.equal(fenceBareMermaid(md), md);
});

test('code fences of other languages are not scanned', () => {
  const md = '```\n\nflowchart LR\n  A --> B\n```';
  assert.equal(fenceBareMermaid(md), md);
});

test('bare diagram after a horizontal rule is fenced, including blank lines inside', () => {
  const md = 'Vvv\n\n---\nflowchart LR\n    A --> B\n\n    classDef x fill:#fff\n    class A x\n';
  const out = fenceBareMermaid(md);
  assert.equal(out, 'Vvv\n\n---\n\n```mermaid\nflowchart LR\n    A --> B\n\n    classDef x fill:#fff\n    class A x\n```\n');
});

test('indented diagram ends where unindented text resumes', () => {
  const md = 'flowchart LR\n  A --> B\n\nNow some text.';
  assert.equal(fenceBareMermaid(md), '```mermaid\nflowchart LR\n  A --> B\n```\n\nNow some text.');
});

test('diagram ends at a heading', () => {
  const md = 'sequenceDiagram\nA->>B: hi\n\n## Next';
  assert.equal(fenceBareMermaid(md), '```mermaid\nsequenceDiagram\nA->>B: hi\n```\n\n## Next');
});

test('header in the middle of a paragraph is not a diagram', () => {
  const md = 'Some line\nflowchart LR\n  A --> B';
  assert.equal(fenceBareMermaid(md), md);
});
