import React from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { mixHex } from './nodeColors';
import FontPicker from './FontPicker';

const FIELDS = [
  { key: 'canvas', label: 'Sfondo app e barre' },
  { key: 'paper', label: 'Pannelli' },
  { key: 'ink', label: 'Testo e bordi' },
  { key: 'workspace', label: 'Area di lavoro' },
  { key: 'mapBg', label: 'Sfondo mappa' },
  { key: 'dots', label: 'Puntini di sfondo' },
];

const ColorField = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-3 py-1.5 text-xs font-semibold text-gray-900 cursor-pointer">
    <span className="truncate">{label}</span>
    <span className="flex items-center gap-2 shrink-0">
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

const SectionTitle = ({ children }) => (
  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mt-3 mb-1">{children}</div>
);

// Pannello quadrato (senza ombra) al centro dello schermo: le modifiche si vedono subito.
export default function ThemeEditor({ id, onClose }) {
  const theme = useStore((s) => (s.customThemes || []).find((t) => t.id === id));
  const updateCustomTheme = useStore((s) => s.updateCustomTheme);
  const removeCustomTheme = useStore((s) => s.removeCustomTheme);
  if (!theme) return null;

  const setNodeColor = (i, value) =>
    updateCustomTheme(id, { nodeColors: theme.nodeColors.map((c, j) => (j === i ? { ...c, value } : c)) });

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
          <SectionTitle>Interfaccia</SectionTitle>
          {FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={theme[f.key] || (f.key === 'dots' ? mixHex(theme.ink, theme.mapBg, 0.5) : '#000000')}
              onChange={(v) => updateCustomTheme(id, { [f.key]: v })}
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

          <SectionTitle>Colori dei nodi</SectionTitle>
          {theme.nodeColors.map((c, i) => (
            <ColorField key={i} label={c.name} value={c.value} onChange={(v) => setNodeColor(i, v)} />
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
