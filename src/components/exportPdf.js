import { readableTextColor } from './nodeColors';

// ==========================================
// ESPORTAZIONE PDF: costruisce pagine HTML pronte da stampare (o da mostrare in anteprima).
// Tre tipi: testi, mappa (A4 orizzontale), flashcard (aperte oppure fronte/retro da ritagliare).
// Funzioni pure: ricevono i dati e restituiscono { html, title, previewW, orientation }.
// ==========================================
const INK = '#111827';
const MM = 96 / 25.4; // pixel CSS per millimetro
const PAGE = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escHtmlAttr = esc;

// CSS comune: pagina A4, colori fedeli in stampa, anteprima grigia a schermo.
function baseCss(orientation, marginMm) {
  const p = PAGE[orientation];
  return `
  @page { size: A4 ${orientation}; margin: ${marginMm}mm; }
  :root { --ink: ${INK}; --paper: #ffffff; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Helvetica, Arial, sans-serif; color: var(--ink); background: #fff; }
  .text-gray-400 { color: #9ca3af; }
  .font-bold { font-weight: 700; }
  @media screen {
    html { background: #e5e7eb; }
    body { background: transparent; padding: 16px; width: ${Math.round(p.w * MM) + 32}px; }
  }`;
}

// Pagina a misura fissa (mappa, flashcard): margine 0 nel @page, il contenuto si dispone da solo.
function fixedPageCss(orientation) {
  const p = PAGE[orientation];
  return `
  @page { size: A4 ${orientation}; margin: 0; }
  .page { position: relative; width: ${p.w}mm; height: ${p.h}mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }
  @media screen { .page { margin: 0 auto 16px; box-shadow: 0 1px 6px rgba(0,0,0,.25); } }
  @media print { html, body { width: ${p.w}mm; } }`;
}

const wrapHtml = (title, css, body) =>
  `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;

// ------------------------------------------
// 1) TESTI
// ------------------------------------------
const TEXT_CSS = `
  .sheet p { margin: 0 0 0.9em; line-height: 1.55; }
  .sheet ul, .sheet ol { margin: 0 0 0.9em; padding-left: 1.4em; }
  .sheet blockquote { margin: 0 0 0.9em; padding-left: 1em; border-left: 3px solid var(--ink); }
  .sheet h2, .sheet h3 { line-height: 1.3; margin: 1em 0 .5em; }
  .sheet h1 { background-color: var(--ink); color: var(--paper); display: inline; -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 2px 4px; font-size: inherit; font-weight: inherit; margin: 0; line-height: 1.9; }
  .sheet h1 span[style] { background-color: var(--ink); color: var(--paper); padding: 2px 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .sheet mark[data-hl] { color: #111827; padding: 0; }
  .sheet .semantic-mark-node { --fill: var(--paper); display: inline; position: relative; line-height: inherit; padding: 1lh 2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; background: linear-gradient(var(--ink), var(--ink)) no-repeat center / 100% calc(1lh + 4px); }
  .sheet .semantic-mark-node .sem-fill { position: relative; display: inline; line-height: inherit; color: var(--ink); padding: 1lh 0.25em; -webkit-box-decoration-break: clone; box-decoration-break: clone; background: linear-gradient(var(--fill), var(--fill)) no-repeat center / 100% 1lh; }
  .sheet .semantic-mark-node[data-color] { --fill: var(--sem-color); }
  .sheet .semantic-mark-node[data-color] .sem-fill { color: var(--sem-text); }
  .sheet.hide-highlights mark[data-hl] { background-color: transparent !important; }
  .sheet.hide-highlights .sem-fill { background: transparent !important; color: inherit !important; padding: 0 !important; }
  .sheet.hide-highlights .semantic-mark-node { background: transparent !important; color: inherit !important; padding: 0 !important; }
  .sheet img { max-width: 100%; }
  .doc-name { font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; border-bottom: 1.5px solid var(--ink); padding-bottom: 4px; margin: 0 0 14px; }
  .proj-name { font-size: 16pt; font-weight: 800; margin: 0 0 18px; }
  .doc { break-inside: auto; }
  .doc + .doc { break-before: page; page-break-before: always; }
  .sheet { font-size: var(--fs); }
  @media screen { .sheet { background: #fff; padding: var(--m); width: 210mm; min-height: 297mm; box-shadow: 0 1px 6px rgba(0,0,0,.25); margin: 0 auto; } }
`;

export function buildTextsHtml({ project, documents, opts }) {
  const chosen = documents.filter((d) => opts.docIds.includes(d.id));
  const orientation = 'portrait';
  const fs = `${opts.fontPt}pt`;
  const m = `${opts.marginMm}mm`;
  const body = chosen.map((d, i) => `
    <section class="doc">
      ${i === 0 && opts.projectTitle ? `<div class="proj-name">${esc(project?.name || '')}</div>` : ''}
      ${opts.docNames ? `<div class="doc-name">${esc(d.name)}</div>` : ''}
      ${d.content || ''}
    </section>`).join('');
  const css = baseCss(orientation, opts.marginMm) + TEXT_CSS + `.sheet { --fs: ${fs}; --m: ${m}; }
    @media screen { body { width: ${Math.round(PAGE.portrait.w * MM) + 32}px; } }`;
  const html = wrapHtml(`${project?.name || 'Quaderno'} – Testi`, css,
    `<div class="sheet ${opts.boxes ? '' : 'hide-highlights'}">${body || '<p style="color:#9ca3af">Nessun testo selezionato.</p>'}</div>`);
  return { html, title: `${project?.name || 'Quaderno'} – Testi`, orientation, previewW: Math.round(PAGE.portrait.w * MM) + 32, pages: null };
}

// ------------------------------------------
// 2) MAPPA (A4 orizzontale)
// ------------------------------------------
const NODE_W = 288;
const NODE_H = 130;
const FRAME_PAD = 56;
const GAP = 18; // distanza del punto di attacco dal bordo del nodo (come i terminali del nodo)

// Curva dei collegamenti: stessa formula di React Flow (curvatura 0.25)
const ctrlOffset = (d, c) => (d >= 0 ? 0.5 * d : c * 25 * Math.sqrt(-d));
function bezier(sx, sy, sp, tx, ty, tp) {
  const c = 0.25;
  const ctrl = (pos, x1, y1, x2, y2) => {
    if (pos === 'left') return [x1 - ctrlOffset(x1 - x2, c), y1];
    if (pos === 'right') return [x1 + ctrlOffset(x2 - x1, c), y1];
    if (pos === 'top') return [x1, y1 - ctrlOffset(y1 - y2, c)];
    return [x1, y1 + ctrlOffset(y2 - y1, c)];
  };
  const [c1x, c1y] = ctrl(sp, sx, sy, tx, ty);
  const [c2x, c2y] = ctrl(tp, tx, ty, sx, sy);
  return {
    d: `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`,
    lx: sx * 0.125 + c1x * 0.375 + c2x * 0.375 + tx * 0.125,
    ly: sy * 0.125 + c1y * 0.375 + c2y * 0.375 + ty * 0.125,
  };
}

function nodeBox(n, vista, current) {
  // Le misure reali (n.width/n.height) valgono solo per la vista in uso nell'app
  const measured = current === vista && n.width && n.height;
  if (measured) return { w: n.width, h: n.height };
  if (vista === 'sintetica') return { w: 220, h: 36 };
  const lines = Math.max(1, Math.ceil(String(n.data?.label || '').length * 7.4 / (NODE_W - 40)));
  return { w: NODE_W, h: 38 + 28 + lines * 20 };
}

// Lato di attacco e distanza lungo il lato, come nella mappa
function layoutEdges(nodes, edges, boxOf) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const prepared = [];
  edges.forEach((edge) => {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (!s || !t) return;
    const dx = t.position.x - s.position.x;
    const dy = t.position.y - s.position.y;
    let sp, tp;
    if (Math.abs(dx) > Math.abs(dy)) { sp = dx > 0 ? 'right' : 'left'; tp = dx > 0 ? 'left' : 'right'; }
    else { sp = dy > 0 ? 'bottom' : 'top'; tp = dy > 0 ? 'top' : 'bottom'; }
    prepared.push({ edge, s, t, sp, tp, so: 0, to: 0 });
  });
  const slots = new Map();
  const add = (id, side, item) => { const k = `${id}:${side}`; if (!slots.has(k)) slots.set(k, { id, side, items: [] }); slots.get(k).items.push(item); };
  prepared.forEach((p) => { add(p.edge.source, p.sp, { p, role: 'out' }); add(p.edge.target, p.tp, { p, role: 'in' }); });
  slots.forEach(({ id, side, items }) => {
    const ins = items.filter((i) => i.role === 'in');
    const outs = items.filter((i) => i.role === 'out');
    if (!ins.length || !outs.length) return;
    const b = boxOf(byId.get(id));
    const len = side === 'left' || side === 'right' ? b.h : b.w;
    const sep = Math.min(18, Math.max(len - 16, 0));
    ins.forEach((i) => { i.p.to = -sep / 2; });
    outs.forEach((i) => { i.p.so = sep / 2; });
  });
  return prepared;
}

function anchor(n, b, side, off) {
  const { x, y } = n.position;
  if (side === 'top') return [x + b.w / 2 + off, y - GAP];
  if (side === 'bottom') return [x + b.w / 2 + off, y + b.h + GAP];
  if (side === 'left') return [x - GAP, y + b.h / 2 + off];
  return [x + b.w + GAP, y + b.h / 2 + off];
}

function arrowPts(x, y, pos) {
  const p = {
    left: [[x - 6, y - 6], [x - 6, y + 6], [x + 6, y]],
    right: [[x + 6, y - 6], [x + 6, y + 6], [x - 6, y]],
    top: [[x - 6, y - 6], [x + 6, y - 6], [x, y + 6]],
    bottom: [[x - 6, y + 6], [x + 6, y + 6], [x, y - 6]],
  }[pos];
  return p.map((q) => q.join(',')).join(' ');
}

// Capitoli: un titolo (H1) apre un capitolo con tutti i riquadri fino al titolo successivo (come nella mappa)
function chapterMap(documents) {
  const map = {};
  documents.forEach((doc) => {
    const body = new DOMParser().parseFromString(doc.content || '', 'text/html').body;
    let chapter = null; let idx = 0;
    Array.from(body.children).forEach((block) => {
      if (block.tagName === 'H1') chapter = { key: `${doc.id}:${idx++}`, title: block.textContent.trim() };
      if (!chapter) return;
      block.querySelectorAll('[data-semantic-id], [data-id], .semantic-mark-node, [id^="nodo-"]').forEach((el) => {
        Array.from(el.attributes).forEach((a) => { if (a.value) map[a.value] = chapter; });
      });
    });
  });
  return map;
}

const MAP_CSS = `
  .stage { position: absolute; transform-origin: 0 0; }
  .nd { position: absolute; background: #fff; border: 2px solid var(--ink); border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; }
  .nd .hd { border-bottom: 2px solid var(--ink); padding: 8px 12px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; min-height: 34px; line-height: 1.3; }
  .nd .bd { padding: 10px 16px 14px; font-size: 14px; font-weight: 500; line-height: 1.4; color: #1f2937; overflow-wrap: anywhere; white-space: pre-wrap; }
  .nd .bd img { display: block; width: 100%; height: auto; border: 2px solid var(--ink); margin-bottom: 10px; }
  .nd-s { padding: 0 10px; justify-content: center; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .fr { position: absolute; border: 2px solid var(--ink); pointer-events: none; }
  .fr .tab { position: absolute; left: -2px; bottom: calc(100% + 2px); white-space: nowrap; background: var(--ink); color: #fff; font-size: 14px; font-weight: 500; line-height: 1; padding: 4px 6px; }
  .cap { position: absolute; left: 10mm; top: 6mm; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; }
`;

function mapPage({ nodes, edges, documents, title, opts, current, imageOf }) {
  const page = PAGE.landscape;
  const W = page.w * MM; const H = page.h * MM;
  const boxes = new Map(nodes.map((n) => [n.id, nodeBox(n, opts.vista, current)]));
  const boxOf = (n) => boxes.get(n.id);

  // cornici dei capitoli
  const frames = [];
  if (opts.frames) {
    const ch = chapterMap(documents);
    const groups = new Map();
    nodes.forEach((n) => {
      const c = ch[n.id]; if (!c) return;
      const b = boxOf(n);
      const g = groups.get(c.key) || { title: c.title, x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
      g.x1 = Math.min(g.x1, n.position.x); g.y1 = Math.min(g.y1, n.position.y);
      g.x2 = Math.max(g.x2, n.position.x + b.w); g.y2 = Math.max(g.y2, n.position.y + b.h);
      groups.set(c.key, g);
    });
    groups.forEach((g) => frames.push({ title: g.title, x: g.x1 - FRAME_PAD, y: g.y1 - FRAME_PAD, w: g.x2 - g.x1 + FRAME_PAD * 2, h: g.y2 - g.y1 + FRAME_PAD * 2 }));
  }

  const laid = layoutEdges(nodes, edges, boxOf);
  const geo = laid.map((p) => {
    const [sx, sy] = (() => { const [x, y] = anchor(p.s, boxOf(p.s), p.sp, 0); return p.sp === 'left' || p.sp === 'right' ? [x, y + p.so] : [x + p.so, y]; })();
    const [tx, ty] = (() => { const [x, y] = anchor(p.t, boxOf(p.t), p.tp, 0); return p.tp === 'left' || p.tp === 'right' ? [x, y + p.to] : [x + p.to, y]; })();
    return { ...p, sx, sy, tx, ty, ...bezier(sx, sy, p.sp, tx, ty, p.tp) };
  });

  // riquadro che contiene tutto
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const grow = (x, y, w, h) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); };
  nodes.forEach((n) => { const b = boxOf(n); grow(n.position.x - GAP - 8, n.position.y - GAP - 8, b.w + (GAP + 8) * 2, b.h + (GAP + 8) * 2); });
  frames.forEach((f) => grow(f.x, f.y - 24, f.w, f.h + 24));
  geo.forEach((g) => grow(g.lx - 90, g.ly - 30, 180, 60));
  if (!isFinite(x1)) { x1 = 0; y1 = 0; x2 = 100; y2 = 60; }
  const bw = x2 - x1; const bh = y2 - y1;

  const marginX = 10 * MM; const top = (opts.caption ? 16 : 10) * MM; const bottom = 10 * MM;
  const availW = W - marginX * 2; const availH = H - top - bottom;
  const scale = Math.min(availW / bw, availH / bh, 1.5);
  const left = marginX + (availW - bw * scale) / 2;
  const topPx = top + (availH - bh * scale) / 2;

  const gid = (i) => `g${i}`;
  const defs = geo.map((g, i) => {
    const from = g.s.data?.color || INK; const to = g.t.data?.color || INK;
    return `<linearGradient id="${gid(i)}" gradientUnits="userSpaceOnUse" x1="${g.sx}" y1="${g.sy}" x2="${g.tx}" y2="${g.ty}"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient>`;
  }).join('');
  const svgEdges = geo.map((g, i) => {
    const from = g.s.data?.color || INK; const to = g.t.data?.color || INK;
    const tick = g.sp === 'left' || g.sp === 'right'
      ? `<rect x="${g.sx - 1}" y="${g.sy - 7}" width="2" height="14" fill="${from}"/>`
      : `<rect x="${g.sx - 7}" y="${g.sy - 1}" width="14" height="2" fill="${from}"/>`;
    const dash = g.edge.data?.dashed ? ' stroke-dasharray="7 6"' : '';
    let label = '';
    const text = g.edge.data?.label;
    if (text !== undefined && text !== null && String(text).trim() !== '') {
      const lines = String(text).split('\n');
      const lw = Math.min(Math.max(...lines.map((l) => l.length), 8), 22) * 6.6 + 20;
      const lh = lines.length * 14 + 8;
      const a = g.s.data?.color; const b = g.t.data?.color;
      const fill = a || b ? (a === b || !b || !a ? (a || b) : `url(#lb${i})`) : '#fff';
      const lg = a && b && a !== b ? `<linearGradient id="lb${i}" x1="0" x2="1"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient>` : '';
      const tc = readableTextColor(a || b || '#ffffff');
      label = `${lg}<rect x="${g.lx - lw / 2}" y="${g.ly - lh / 2}" width="${lw}" height="${lh}" fill="${fill}" stroke="${INK}" stroke-width="2"/>` +
        lines.map((l, k) => `<text x="${g.lx}" y="${g.ly - lh / 2 + 4 + 11 + k * 14}" text-anchor="middle" font-size="11" font-weight="700" fill="${tc}" font-family="Helvetica, Arial, sans-serif">${esc(l)}</text>`).join('');
    }
    return `<path d="${g.d}" fill="none" stroke="url(#${gid(i)})" stroke-width="1.5"${dash}/>${tick}<polygon points="${arrowPts(g.tx, g.ty, g.tp)}" fill="${to}"/>${label}`;
  }).join('');

  const frameHtml = frames.map((f) => `<div class="fr" style="left:${f.x - x1}px;top:${f.y - y1}px;width:${f.w}px;height:${f.h}px">${f.title ? `<div class="tab">${esc(f.title)}</div>` : ''}</div>`).join('');

  const nodeHtml = nodes.map((n) => {
    const b = boxOf(n);
    const c = n.data?.color;
    const headStyle = c ? `background:${c};color:${readableTextColor(c)};` : '';
    const pos = `left:${n.position.x - x1}px;top:${n.position.y - y1}px;width:${b.w}px;height:${b.h}px;`;
    const t = esc(n.data?.title || '');
    if (opts.vista === 'sintetica') {
      return `<div class="nd nd-s" style="${pos}${headStyle}"><span>${t}</span></div>`;
    }
    const img = opts.images ? imageOf?.(n.data || {}) : null;
    return `<div class="nd" style="${pos}"><div class="hd" style="${headStyle}">${t}</div><div class="bd">${img?.src ? `<img src="${escHtmlAttr(img.src)}" style="filter:${img.filter || 'none'}">` : ''}${esc(n.data?.label || '')}</div></div>`;
  }).join('');

  const dots = opts.dots ? `background-image: radial-gradient(#9ca3af 1px, transparent 1px); background-size: ${16 * scale}px ${16 * scale}px; background-position: ${left}px ${topPx}px;` : '';
  return `<div class="page" style="${dots}">
    ${opts.caption ? `<div class="cap">${esc(title)}</div>` : ''}
    <div class="stage" style="left:${left}px;top:${topPx}px;width:${bw}px;height:${bh}px;transform:scale(${scale})">
      ${frameHtml}
      <svg width="${bw}" height="${bh}" viewBox="0 0 ${bw} ${bh}" style="position:absolute;left:0;top:0;overflow:visible"><defs></defs><g transform="translate(${-x1},${-y1})"><defs>${defs}</defs>${svgEdges}</g></svg>
      ${nodeHtml}
    </div>
  </div>`;
}

export function buildMapHtml({ project, documents, nodes, edges, opts, currentViewMode, imageOf }) {
  const docIds = new Set(opts.docIds);
  const pool = nodes.filter((n) => docIds.has(n.data?.docId));
  const groups = opts.scope === 'perDoc'
    ? documents.filter((d) => docIds.has(d.id)).map((d) => ({ title: `${project?.name || 'Quaderno'} · ${d.name}`, nodes: pool.filter((n) => n.data?.docId === d.id) })).filter((g) => g.nodes.length)
    : [{ title: project?.name || 'Quaderno', nodes: pool }];
  const pages = groups.map((g) => {
    const ids = new Set(g.nodes.map((n) => n.id));
    return mapPage({
      nodes: g.nodes,
      edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
      documents, title: g.title, opts, current: currentViewMode, imageOf,
    });
  });
  const css = baseCss('landscape', 0) + fixedPageCss('landscape') + MAP_CSS;
  const html = wrapHtml(`${project?.name || 'Quaderno'} – Mappa`, css, pages.join('') || `<div class="page"><div class="cap">Nessun nodo da esportare.</div></div>`);
  return { html, title: `${project?.name || 'Quaderno'} – Mappa`, orientation: 'landscape', previewW: Math.round(PAGE.landscape.w * MM) + 32 };
}

// ------------------------------------------
// 3) FLASHCARD
// ------------------------------------------
const CARD_CSS = `
  .open-wrap { padding: 12mm; }
  .open-grid { display: grid; gap: 5mm; align-items: start; }
  .tc { border: 2px solid var(--ink); border-radius: 5px; break-inside: avoid; page-break-inside: avoid; background: #fff; overflow: hidden; }
  .tc .hd { border-bottom: 2px solid var(--ink); padding: 6px 10px; font-size: 9pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; overflow-wrap: anywhere; }
  .tc .bd { padding: 8px 10px 10px; font-family: Georgia, 'Times New Roman', serif; font-size: 10pt; line-height: 1.45; color: #374151; white-space: pre-wrap; overflow-wrap: anywhere; }
  .tc .bd img { display: block; width: 100%; height: auto; border: 2px solid var(--ink); margin-bottom: 8px; }
  .cut-grid { position: absolute; left: 10mm; right: 10mm; top: 10mm; bottom: 10mm; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(4, 1fr); }
  .cell { border: 0.3mm dashed #6b7280; margin: -0.15mm; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
  .cell.front { align-items: center; justify-content: center; padding: 6mm; text-align: center; }
  .cell.front h3 { margin: 0; font-size: 17pt; font-weight: 700; overflow-wrap: anywhere; }
  .cell.back .hd { padding: 3mm 4mm; border-bottom: 1.5px solid var(--ink); font-size: 8pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; overflow-wrap: anywhere; }
  .cell.back .bd { padding: 3mm 4mm; font-family: Georgia, 'Times New Roman', serif; line-height: 1.35; color: #374151; white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; flex: 1; }
  .cell.back .bd img { display: block; width: 100%; max-height: 24mm; object-fit: contain; border: 1.5px solid var(--ink); margin-bottom: 2mm; }
  .side-tag { position: absolute; left: 10mm; bottom: 4mm; font-size: 7pt; color: #9ca3af; letter-spacing: .1em; text-transform: uppercase; }
`;

// Quante schede per foglio nella versione da ritagliare: numero -> colonne x righe
export const CARD_LAYOUTS = {
  4: { cols: 2, rows: 2 },
  6: { cols: 2, rows: 3 },
  8: { cols: 2, rows: 4 },
  12: { cols: 3, rows: 4 },
  16: { cols: 4, rows: 4 },
  20: { cols: 4, rows: 5 },
  24: { cols: 4, rows: 6 },
};

export function buildCardsHtml({ project, terms, opts, imageOf }) {
  const chosen = terms.filter((t) => opts.docIds.includes(t.docId)).sort((a, b) => a.word.localeCompare(b.word));
  const imgOf = (t) => (opts.images ? imageOf?.(t) : null);
  const title = `${project?.name || 'Quaderno'} – Flashcard`;

  if (opts.layout === 'open') {
    const cards = chosen.map((t) => {
      const img = imgOf(t);
      return `<div class="tc"><div class="hd">${esc(t.word)}</div><div class="bd">${img?.src ? `<img src="${escHtmlAttr(img.src)}" style="filter:${img.filter || 'none'}">` : ''}${esc(t.definition || '')}</div></div>`;
    }).join('');
    const css = baseCss('portrait', 0) + CARD_CSS + `.open-grid { grid-template-columns: repeat(${opts.cols}, 1fr); }
      @media screen { .open-wrap { width: 210mm; min-height: 297mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); margin: 0 auto; } }
      @page { margin: 12mm; } @media print { .open-wrap { padding: 0; } }`;
    return {
      html: wrapHtml(title, css, `<div class="open-wrap"><div class="open-grid">${cards || '<p style="color:#9ca3af">Nessun termine da esportare.</p>'}</div></div>`),
      title, orientation: 'portrait', previewW: Math.round(PAGE.portrait.w * MM) + 32,
    };
  }

  // fronte e retro da ritagliare: 3 x 4 per foglio; il retro è specchiato per la stampa fronte/retro
  const { cols: COLS, rows: ROWS } = CARD_LAYOUTS[opts.perPage] || CARD_LAYOUTS[12];
  const PER = COLS * ROWS;
  const gridStyle = `grid-template-columns:repeat(${COLS},1fr);grid-template-rows:repeat(${ROWS},1fr)`;
  const imgMax = Math.round((277 / ROWS) * 0.35); // altezza massima dell'immagine, in mm, in proporzione alla scheda
  const pages = [];
  for (let i = 0; i < chosen.length; i += PER) {
    const chunk = chosen.slice(i, i + PER);
    const slot = (idx) => chunk[idx] || null;
    const fronts = Array.from({ length: PER }, (_, k) => slot(k));
    const backs = Array.from({ length: PER }, (_, k) => {
      const r = Math.floor(k / COLS); const c = k % COLS;
      return slot(opts.mirror ? r * COLS + (COLS - 1 - c) : k);
    });
    const dense = PER > 12; // con tante schede per foglio il titolo e i margini si riducono
    const frontHtml = fronts.map((t) => `<div class="cell front"${dense ? ' style="padding:3mm"' : ''}>${t ? `<h3${dense ? ' style="font-size:12pt"' : ''}>${esc(t.word)}</h3>` : ''}</div>`).join('');
    const backHtml = backs.map((t) => {
      if (!t) return '<div class="cell back"></div>';
      const img = imgOf(t);
      return `<div class="cell back"><div class="hd">${esc(t.word)}</div><div class="bd" style="font-size:${opts.backPt}pt">${img?.src ? `<img src="${escHtmlAttr(img.src)}" style="filter:${img.filter || 'none'};max-height:${imgMax}mm">` : ''}${esc(t.definition || '')}</div></div>`;
    }).join('');
    pages.push(`<div class="page"><div class="cut-grid" style="${gridStyle}">${frontHtml}</div><div class="side-tag">Fronte</div></div>`);
    pages.push(`<div class="page"><div class="cut-grid" style="${gridStyle}">${backHtml}</div><div class="side-tag">Retro${opts.mirror ? ' (specchiato)' : ''}</div></div>`);
  }
  const css = baseCss('portrait', 0) + fixedPageCss('portrait') + CARD_CSS;
  return {
    html: wrapHtml(title, css, pages.join('') || `<div class="page"><div class="side-tag">Nessun termine da esportare.</div></div>`),
    title, orientation: 'portrait', previewW: Math.round(PAGE.portrait.w * MM) + 32,
  };
}
