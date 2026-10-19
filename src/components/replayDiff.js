import { DOMParser as PMDOMParser } from '@tiptap/pm/model';

// Replay: durante la riproduzione l'editor mostra il testo finale e si colora di grigio la parte
// che, a quell'istante della registrazione, non era ancora stata scritta. Per saperlo si confronta
// il testo dell'istantanea con quello finale (diff prima per parole, poi per lettere nelle parti diverse).

// Testo di un documento + posizione nel documento di ogni carattere. Un '\n' separa i paragrafi (posizione -1).
export function docChars(doc) {
  const parts = [];
  const pos = [];
  let first = true;
  doc.descendants((node, p) => {
    if (!node.isTextblock) return true;
    if (!first) { parts.push('\n'); pos.push(-1); }
    first = false;
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text.length; i++) { parts.push(child.text[i]); pos.push(p + 1 + offset + i); }
      } else { parts.push('￼'); pos.push(p + 1 + offset); }
    });
    return false;
  });
  return { text: parts.join(''), pos };
}

export function htmlToDoc(editor, html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return PMDOMParser.fromSchema(editor.schema).parse(el);
}

// Coppie [i, j] di elementi uguali (sottosequenza comune più lunga) tra due sequenze, con l'algoritmo di Myers.
// Oltre maxD differenze si rinuncia (nessuna coppia nella parte centrale).
function myersMid(A, B, maxD) {
  const N = A.length;
  const M = B.length;
  if (!N || !M) return [];
  const max = Math.min(N + M, maxD);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2)); // stato prima del giro d: indice di k = k + d + 1
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { found = d; break; }
    }
  }
  if (found < 0) return [];
  const pairs = [];
  let x = N;
  let y = M;
  for (let d = found; d > 0; d--) {
    const vv = trace[d];
    const k = x - y;
    const pk = (k === -d || (k !== d && vv[k - 1 + d + 1] < vv[k + 1 + d + 1])) ? k + 1 : k - 1;
    const px = vv[pk + d + 1];
    const py = px - pk;
    const mx = pk === k + 1 ? px : px + 1;
    const my = mx - k;
    while (x > mx && y > my) { x--; y--; pairs.push([x, y]); }
    x = px; y = py;
  }
  while (x > 0 && y > 0) { x--; y--; pairs.push([x, y]); }
  return pairs.reverse();
}

function lcsPairs(a, b, maxD) {
  const n = a.length;
  const m = b.length;
  let s = 0;
  while (s < n && s < m && a[s] === b[s]) s++;
  let e = 0;
  while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
  const pairs = [];
  for (let i = 0; i < s; i++) pairs.push([i, i]);
  myersMid(a.slice(s, n - e), b.slice(s, m - e), maxD).forEach(([i, j]) => pairs.push([i + s, j + s]));
  for (let k = 0; k < e; k++) pairs.push([n - e + k, m - e + k]);
  return pairs;
}

function tokenize(text) {
  const toks = [];
  const starts = [];
  const re = /\s+|\S+/g;
  let m;
  while ((m = re.exec(text))) { toks.push(m[0]); starts.push(m.index); }
  return { toks, starts };
}

// Intervalli [from, to) del documento finale che NON esistevano ancora nel testo dell'istantanea.
export function unwrittenRanges(final, snapText) {
  const ft = tokenize(final.text);
  const st = tokenize(snapText);
  const keep = new Uint8Array(final.text.length);

  // Parti diverse (tra due parole uguali): si confrontano le lettere, così una parola scritta a metà resta nera fino a dove è arrivata
  const gap = (i0, i1, j0, j1) => {
    if (i1 <= i0 || j1 <= j0) return;
    const fs = ft.starts[i0];
    const fe = ft.starts[i1 - 1] + ft.toks[i1 - 1].length;
    const ss = st.starts[j0];
    const se = st.starts[j1 - 1] + st.toks[j1 - 1].length;
    if (fe - fs > 6000 || se - ss > 6000) return;
    lcsPairs(final.text.slice(fs, fe), snapText.slice(ss, se), 1500).forEach(([x]) => { keep[fs + x] = 1; });
  };

  let pi = -1;
  let pj = -1;
  lcsPairs(ft.toks, st.toks, 2000).forEach(([i, j]) => {
    gap(pi + 1, i, pj + 1, j);
    keep.fill(1, ft.starts[i], ft.starts[i] + ft.toks[i].length);
    pi = i; pj = j;
  });
  gap(pi + 1, ft.toks.length, pj + 1, st.toks.length);

  const out = [];
  let start = -1;
  let prev = -2;
  for (let k = 0; k < keep.length; k++) {
    const p = final.pos[k];
    if (keep[k] || p < 0) {
      if (start >= 0) { out.push({ from: start, to: prev + 1 }); start = -1; }
      continue;
    }
    if (start >= 0 && p === prev + 1) prev = p;
    else { if (start >= 0) out.push({ from: start, to: prev + 1 }); start = p; prev = p; }
  }
  if (start >= 0) out.push({ from: start, to: prev + 1 });
  return out;
}
