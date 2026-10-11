// Palette condivisa tra nodi, collegamenti, testo e evidenziatore.
export const NODE_COLORS = [
  { name: 'Corallo', value: '#ff6b6b' },
  { name: 'Arancio', value: '#ffa94d' },
  { name: 'Giallo', value: '#ffd43b' },
  { name: 'Verde', value: '#69db7c' },
  { name: 'Azzurro', value: '#4dabf7' },
  { name: 'Viola', value: '#b197fc' },
  { name: 'Rosa', value: '#f783ac' },
];

// ==========================================
// TEMI: chiaro e scuro sono predefiniti, quelli personalizzati stanno nello store (customThemes).
// Ogni tema = colori dell'interfaccia + palette dei nodi.
// ==========================================
export const LIGHT_THEME = {
  ink: '#111827', paper: '#ffffff', canvas: '#f3f4f6', workspace: '#e5e7eb', mapBg: '#f4f4f4', dots: '#111827', font: '',
  nodeColors: NODE_COLORS,
};
export const DARK_THEME = {
  ink: '#e5e7eb', paper: '#1b1b1f', canvas: '#141416', workspace: '#0e0e10', mapBg: '#17171a', dots: '#71717a', font: '',
  nodeColors: NODE_COLORS,
};

export function resolveTheme(theme, customThemes = []) {
  if (theme === 'dark') return DARK_THEME;
  const custom = (customThemes || []).find((t) => t.id === theme);
  return custom || LIGHT_THEME;
}

// Mescola due colori esadecimali: t = quota di "a" (0..1).
export function mixHex(a, b, t) {
  const ok = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
  if (!ok(a) || !ok(b)) return a || b;
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

// Colore dei collegamenti quando il nodo non è colorato.
export const DEFAULT_LINK_COLOR = '#111827';

// Restituisce il colore del testo (scuro o chiaro) più leggibile sullo sfondo dato.
export function readableTextColor(hex) {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return '#111827';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.35 ? '#111827' : '#ffffff';
}
