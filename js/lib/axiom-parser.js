export function parseAxiom(raw) {
  const lines = raw.trim().split('\n');
  const sourceIdx = lines.findIndex(l => /^[~\-—]/.test(l.trim()));
  if (sourceIdx !== -1) {
    const quote = lines.slice(0, sourceIdx).join('\n').trim();
    const src   = lines[sourceIdx].replace(/^[~\-—]\s*/, '').trim();
    return { quote, source: '— ' + src };
  }
  return { quote: raw.trim(), source: '' };
}
