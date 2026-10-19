import { create } from 'zustand';

// ==========================================
// RICERCA: stato condiviso tra testo, nodi e glossario.
// Ogni pannello aperto legge da qui e agisce nello stesso momento.
//  - query:   la parola cercata
//  - step:    quale risultato è quello "corrente" (cresce con Invio, cala con Maiusc+Invio; ogni pannello lo
//             riporta al numero dei propri risultati)
//  - version: cambia a ogni azione (nuova parola, Invio, chiusura): i pannelli si spostano sul risultato
// ==========================================

// Minuscole e senza accenti, lettera per lettera: la lunghezza non cambia, quindi le posizioni restano valide
const foldChar = (ch) => {
  const n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (n.length === 1) return n;
  const l = ch.toLowerCase();
  return l.length === 1 ? l : ch;
};
export const fold = (s) => {
  const str = String(s ?? '');
  let out = '';
  for (let i = 0; i < str.length; i++) out += foldChar(str[i]);
  return out;
};

// Tutte le occorrenze della parola in un testo: [{ start, end }]
export function findAll(text, query) {
  const needle = fold(query).trim();
  if (!needle) return [];
  const hay = fold(text);
  const out = [];
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    out.push({ start: i, end: i + needle.length });
    i += needle.length;
  }
  return out;
}

// Un testo diviso in pezzi [{ text, hit }], con hit = true dove c'è la parola cercata
export function splitByHits(text, query) {
  const str = String(text ?? '');
  const hits = findAll(str, query);
  if (!hits.length) return [{ text: str, hit: false }];
  const parts = [];
  let last = 0;
  hits.forEach(({ start, end }) => {
    if (start > last) parts.push({ text: str.slice(last, start), hit: false });
    parts.push({ text: str.slice(start, end), hit: true });
    last = end;
  });
  if (last < str.length) parts.push({ text: str.slice(last), hit: false });
  return parts;
}

// Indice del risultato corrente, dato il numero di risultati (anche con step negativo)
export const currentIndex = (step, count) => (count ? ((step % count) + count) % count : 0);

export const useSearchStore = create((set) => ({
  open: false,
  query: '',
  step: 0,
  version: 0,
  currentNodeId: null, // il nodo su cui la mappa si è appena centrata
  openSearch: () => set({ open: true }),
  closeSearch: () => set((s) => ({ open: false, query: '', step: 0, version: s.version + 1, currentNodeId: null })),
  setQuery: (q) => set((s) => ({ query: q, step: 0, version: s.version + 1 })),
  next: () => set((s) => ({ step: s.step + 1, version: s.version + 1 })),
  prev: () => set((s) => ({ step: s.step - 1, version: s.version + 1 })),
  setCurrentNode: (id) => set({ currentNodeId: id }),
}));
