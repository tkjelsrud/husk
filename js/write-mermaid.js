// Draws ```mermaid blocks in a rendered Skriv document. Mermaid is large, so
// it is only downloaded the first time a document actually contains a diagram.

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';

let mermaidPromise = null;
let diagramCount = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_URL).then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      });
      return mermaid;
    }).catch((err) => {
      mermaidPromise = null; // allow a retry on the next render
      throw err;
    });
  }
  return mermaidPromise;
}

function showError(container, source, message) {
  container.classList.add('write-mermaid-error');
  container.replaceChildren();
  const title = document.createElement('div');
  title.className = 'write-mermaid-error-title';
  title.textContent = 'Kunne ikke tegne diagrammet';
  const detail = document.createElement('div');
  detail.className = 'write-mermaid-error-detail';
  detail.textContent = String(message || '').trim();
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = source;
  pre.append(code);
  container.append(title, detail, pre);
}

// ── Enlarged view ─────────────────────────────────────────────────────────

let overlay = null;

function closeOverlay() {
  overlay?.remove();
  overlay = null;
  document.removeEventListener('keydown', onOverlayKey);
}

function onOverlayKey(event) {
  if (event.key === 'Escape') closeOverlay();
}

function openOverlay(svg) {
  closeOverlay();
  overlay = document.createElement('div');
  overlay.className = 'write-mermaid-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Diagram');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'write-mermaid-overlay-close';
  close.setAttribute('aria-label', 'Lukk');
  close.textContent = '×';
  close.addEventListener('click', closeOverlay);

  const stage = document.createElement('div');
  stage.className = 'write-mermaid-overlay-stage';
  const copy = svg.cloneNode(true);
  // Show at natural size; the stage scrolls when the diagram is bigger.
  copy.removeAttribute('width');
  copy.style.maxWidth = 'none';
  const viewBox = copy.viewBox?.baseVal;
  if (viewBox?.width) {
    copy.style.width = `${Math.max(viewBox.width, Math.min(window.innerWidth - 64, viewBox.width * 1.5))}px`;
  }
  stage.append(copy);
  stage.addEventListener('click', (event) => {
    if (event.target === stage) closeOverlay();
  });

  overlay.append(close, stage);
  document.body.append(overlay);
  document.addEventListener('keydown', onOverlayKey);
  close.focus();
}

// ── Rendering ─────────────────────────────────────────────────────────────

export async function renderMermaidBlocks(root) {
  const blocks = [...root.querySelectorAll('pre > code.language-mermaid')];
  if (!blocks.length) return;

  const items = blocks.map((code) => {
    const source = code.textContent;
    const container = document.createElement('div');
    container.className = 'write-mermaid is-loading';
    container.textContent = 'Tegner diagram…';
    code.parentElement.replaceWith(container);
    return { source, container };
  });

  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    console.error('Failed to load Mermaid', err);
    items.forEach(({ source, container }) => showError(container, source, 'Mermaid kunne ikke lastes. Sjekk nettforbindelsen.'));
    return;
  }

  // One at a time: Mermaid's renderer is not safe to run concurrently.
  for (const { source, container } of items) {
    if (!container.isConnected) continue; // user navigated to another doc
    const id = `write-mermaid-${++diagramCount}`;
    try {
      const { svg, bindFunctions } = await mermaid.render(id, source);
      if (!container.isConnected) continue;
      container.classList.remove('is-loading');
      container.innerHTML = svg;
      bindFunctions?.(container);
      const svgEl = container.querySelector('svg');
      if (svgEl) {
        container.title = 'Klikk for å forstørre';
        container.tabIndex = 0;
        container.setAttribute('role', 'button');
        const open = () => openOverlay(svgEl);
        container.addEventListener('click', open);
        container.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        });
      }
    } catch (err) {
      // Mermaid leaves a stray error element in <body> on failure.
      document.getElementById(`d${id}`)?.remove();
      showError(container, source, err?.message || err);
    }
  }
}
