// Mermaid support for markdown in Skriv.
//
// Diagrams normally live in ```mermaid fences, but pasted diagrams often come
// without one. fenceBareMermaid wraps such bare diagrams in a fence so the
// markdown renderer leaves them alone and the page can draw them.

const DIRECTION = '(?:TB|TD|BT|RL|LR)';

// Header lines that start a diagram. Kept strict (keyword alone on its line,
// or with its known arguments) so ordinary prose is never mistaken for one.
const HEADER_PATTERNS = [
  new RegExp(`^(?:flowchart|graph)(?:\\s+${DIRECTION})?\\s*;?\\s*$`),
  /^(?:sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|xychart-beta|sankey-beta|block-beta|packet-beta|architecture-beta|kanban|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\s*$/,
  /^pie(?:\s+showData)?(?:\s+title\s+.+)?\s*$/,
];

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function isMermaidHeader(line) {
  const trimmed = String(line).trim();
  return HEADER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isBlank(line) {
  return line.trim() === '';
}

function isIndented(line) {
  return /^\s/.test(line);
}

// Statement keywords that can start a Mermaid line which otherwise reads like
// a sentence, e.g. "Note over A: Klar til start."
const STATEMENT = /^(?:note|participant|actor|title|section|class|classDef|style|linkStyle|click|loop|alt|else|opt|par|and|critical|break|rect|end|autonumber|activate|deactivate|state|direction|subgraph|dateFormat|axisFormat|excludes|accTitle|accDescr)\b/i;

// A sentence ("Tekst i mellom.") rather than diagram syntax: ends like prose
// and has none of Mermaid's arrows, brackets or statement keywords.
function looksLikeProse(line) {
  const trimmed = line.trim();
  return /[.!?]$/.test(trimmed)
    && /\s/.test(trimmed)
    && !STATEMENT.test(trimmed)
    && !/-->|->>|-\)|--x|==>|-\.->|---|[[\]{}()|]/.test(trimmed);
}

// Index of the last line belonging to a bare diagram that starts at `start`.
function findDiagramEnd(lines, start) {
  // If the diagram body is indented under its header, an unindented line after
  // a blank line means the diagram is over and normal text resumes.
  const firstBody = lines.slice(start + 1).find((line) => !isBlank(line));
  const bodyIndented = firstBody !== undefined && isIndented(firstBody);

  let end = start;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line) || HEADING.test(line) || RULE.test(line)) break;
    if (bodyIndented && !isBlank(line) && !isIndented(line) && isBlank(lines[i - 1])) break;
    if (!bodyIndented && isBlank(lines[i - 1]) && looksLikeProse(line)) break;
    if (!isBlank(line)) end = i;
  }
  return end;
}

export function fenceBareMermaid(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const out = [];
  let fence = null; // marker of the code fence we are inside, if any

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fence) {
      out.push(line);
      if (line.trim().startsWith(fence)) fence = null;
      continue;
    }

    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }

    const prev = i > 0 ? lines[i - 1] : '';
    const atBlockStart = i === 0 || isBlank(prev) || RULE.test(prev);
    if (atBlockStart && isMermaidHeader(line)) {
      const end = findDiagramEnd(lines, i);
      if (RULE.test(prev) && out.length && !isBlank(out[out.length - 1])) {
        // Keep "---" a horizontal rule rather than a setext heading marker.
        out.push('');
      }
      out.push('```mermaid', ...lines.slice(i, end + 1), '```');
      i = end;
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}
