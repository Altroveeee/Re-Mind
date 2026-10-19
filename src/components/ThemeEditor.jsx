import React from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { mixHex, LIGHT_THEME } from './nodeColors';
import FontPicker from './FontPicker';

const FIELDS = [
  { key: 'canvas', label: 'Sfondo app e barre' },
  { key: 'paper', label: 'Pannelli' },
  { key: 'ink', label: 'Testo e bordi' },
  { key: 'workspace', label: 'Area di lavoro' },
  { key: 'mapBg', label: 'Sfondo mappa' },
  { key: 'dots', label: 'Puntini di sfondo' },
];

// onReset: se presente (colore modificato) compare il pulsante per riportarlo al valore di partenza
const ColorField = ({ label, value, onChange, onReset }) => (
  <label className="flex items-center justify-between gap-3 py-1.5 text-xs font-semibold text-gray-900 cursor-pointer">
    <span className="truncate">{label}</span>
    <span className="flex items-center gap-2 shrink-0">
      {onReset && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onReset(); }}
          className="px-1 text-[13px] leading-none font-bold text-gray-900 hover:bg-gray-900 hover:text-white"
          title="Ripristina questo colore"
        >
          ↺
        </button>
      )}
      <span className="text-[10px] font-mono uppercase text-gray-500">{value}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 p-0 border-2 border-gray-900 bg-transparent cursor-pointer"
      />
    </span>
  </label>
);

// onReset: pulsante "Ripristina" della sezione (disattivato se non c'è nulla da ripristinare)
const SectionTitle = ({ children, onReset, canReset }) => (
  <div className="flex items-center justify-between mt-3 mb-1">
    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{children}</div>
    {onReset && (
      <button
        type="button"
        onClick={onReset}
        disabled={!canReset}
        className={`px-2 py-0.5 border-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest text-gray-900 ${canReset ? 'hover:bg-gray-900 hover:text-white' : 'opacity-30 cursor-not-allowed'}`}
        title="Riporta questi colori ai valori di partenza"
      >
        Ripristina
      </button>
    )}
  </div>
);

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Pannello quadrato (senza ombra) al centro dello schermo: le modifiche si vedono subito.
export default function ThemeEditor({ id, onClose }) {
  const theme = useStore((s) => (s.customThemes || []).find((t) => t.id === id));
  const updateCustomTheme = useStore((s) => s.updateCustomTheme);
  const removeCustomTheme = useStore((s) => s.removeCustomTheme);
  const resetCustomThemeColors = useStore((s) => s.resetCustomThemeColors);
  if (!theme) return null;

  const setNodeColor = (i, value) =>
    updateCustomTheme(id, { nodeColors: theme.nodeColors.map((c, j) => (j === i ? { ...c, value } : c)) });

  // Valori di partenza della modalità (se manca la copia salvata: quelli del tema chiaro)
  const defaultOf = (key) => theme.defaults?.[key] ?? LIGHT_THEME[key];
  const currentOf = (key) => theme[key] || (key === 'dots' ? mixHex(theme.ink, theme.mapBg, 0.5) : '#000000');
  const defaultNodeColors = theme.defaults?.nodeColors || LIGHT_THEME.nodeColors;

  const changedFields = FIELDS.filter((f) => !same(currentOf(f.key), defaultOf(f.key)));
  const nodeChanged = (i) => !same(theme.nodeColors[i]?.value, defaultNodeColors[i]?.value);
  const anyNodeChanged = theme.nodeColors.some((_, i) => nodeChanged(i));

  const resetInterface = () => {
    const patch = {};
    FIELDS.forEach((f) => { patch[f.key] = defaultOf(f.key); });
    updateCustomTheme(id, patch);
  };

  const handleDelete = () => {
    if (!window.confirm(`Eliminare la modalità «${theme.name}»?`)) return;
    removeCustomTheme(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      {/* Nessun velo: si vedono i colori cambiare dietro al pannello */}
      <div className="absolute inset-0" onMouseDown={onClose} />
      <div className="relative w-[440px] h-[440px] max-w-[95vw] max-h-[90vh] bg-white border-2 border-gray-900 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-gray-900 shrink-0">
          <input
            autoFocus
            value={theme.name}
            onFocus={(e) => e.target.select()}
            onChange={(e) => updateCustomTheme(id, { name: e.target.value })}
            onBlur={(e) => { if (!e.target.value.trim()) updateCustomTheme(id, { name: 'Personalizzata' }); }}
            placeholder="Nome della modalità"
            className="flex-1 min-w-0 bg-transparent outline-none text-xs font-black uppercase tracking-wider text-gray-900"
          />
          <button onClick={onClose} className="p-1 text-gray-900 hover:bg-gray-900 hover:text-white" title="Chiudi">
            <X size={14} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3">
          <SectionTitle onReset={resetInterface} canReset={changedFields.length > 0}>Interfaccia</SectionTitle>
          {FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={currentOf(f.key)}
              onChange={(v) => updateCustomTheme(id, { [f.key]: v })}
              onReset={same(currentOf(f.key), defaultOf(f.key)) ? undefined : () => updateCustomTheme(id, { [f.key]: defaultOf(f.key) })}
            />
          ))}

          <SectionTitle>Carattere</SectionTitle>
          <div className="flex items-center justify-between gap-3 py-1.5 text-xs font-semibold text-gray-900">
            <span className="truncate">Font dell'interfaccia</span>
            <FontPicker
              value={theme.font || ''}
              onChange={(f) => updateCustomTheme(id, { font: f })}
              className="w-[190px] h-7 border-2 border-gray-900"
              title="Scegli dall'elenco o scrivi il nome di un font installato"
            />
          </div>

          <SectionTitle onReset={() => resetCustomThemeColors(id)} canReset={anyNodeChanged}>Colori dei nodi</SectionTitle>
          {theme.nodeColors.map((c, i) => (
            <ColorField
              key={i}
              label={c.name}
              value={c.value}
              onChange={(v) => setNodeColor(i, v)}
              onReset={nodeChanged(i) ? () => resetCustomThemeColors(id, i) : undefined}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t-2 border-gray-900 shrink-0">
          <button onClick={handleDelete} className="px-3 py-1 border-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest text-gray-900 hover:bg-gray-900 hover:text-white">
            Elimina
          </button>
          <button onClick={onClose} className="px-3 py-1 border-2 border-gray-900 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest">
            Fatto
          </button>
        </div>
      </div>
    </div>
  );
}
