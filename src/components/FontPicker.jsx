import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

// Font sempre proposti; chi usa Chrome/Edge può aggiungere tutti quelli installati sul computer.
export const DEFAULT_FONTS = ['Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana'];
export const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];

let localFontsCache = null;
let localFontsPromise = null;
const supportsLocalFonts = () => typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';

// Legge i font installati (Local Font Access API: Chrome/Edge, chiede il permesso una volta).
// Dove non esiste (Safari, Firefox) restituisce [] e resta possibile scrivere a mano il nome di un font installato.
export function loadLocalFonts() {
  if (localFontsCache) return Promise.resolve(localFontsCache);
  if (!supportsLocalFonts()) return Promise.resolve([]);
  if (!localFontsPromise) {
    localFontsPromise = window.queryLocalFonts()
      .then((fonts) => {
        localFontsCache = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
        return localFontsCache;
      })
      .catch(() => { localFontsPromise = null; return []; });
  }
  return localFontsPromise;
}

// Elenco a comparsa nello stesso stile dei menu dell'app (riquadro squadrato, bordo pieno, niente ombra).
// Sta fuori dal pannello (portal) così non viene tagliato da nessun contenitore.
function FloatingList({ anchorRef, onClose, minWidth = 0, children }) {
  const listRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const up = below < 180 && r.top > below;
    setPos({
      left: r.left,
      width: Math.max(r.width, minWidth),
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxH: Math.max(120, Math.min(288, (up ? r.top : below) - 8)),
    });
  }, [anchorRef, minWidth]);

  useEffect(() => {
    const down = (e) => {
      if (listRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      closeRef.current();
    };
    const scroll = (e) => { if (!listRef.current?.contains(e.target)) closeRef.current(); };
    const close = () => closeRef.current();
    document.addEventListener('mousedown', down);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={listRef}
      // Non toglie il focus al campo mentre si usa l'elenco
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxH }}
      className="z-[100] overflow-y-auto bg-white border-2 border-gray-900"
    >
      {children}
    </div>,
    document.body
  );
}

const Item = ({ active, onPick, style, children }) => (
  <button
    type="button"
    onClick={onPick}
    style={style}
    className="flex items-center w-full text-left px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-900 hover:text-white"
  >
    <span className="w-4 inline-block shrink-0">{active ? '✓' : ''}</span>
    <span className="truncate">{children}</span>
  </button>
);

const Arrow = () => <ChevronDown size={12} strokeWidth={3} className="shrink-0" />;

// Campo font: si sceglie dall'elenco o si scrive il nome di un font (Invio per confermare). "Predefinito" = nessun font.
// La forma (larghezza, altezza, bordo) arriva da className.
export default function FontPicker({ value, onChange, className = '', title = 'Font' }) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null = non si sta scrivendo
  const [fonts, setFonts] = useState(localFontsCache || []);

  const close = useCallback(() => { setOpen(false); setQuery(null); }, []);
  const openList = () => { setOpen(true); loadLocalFonts().then(setFonts); };

  const options = useMemo(() => [...new Set([...DEFAULT_FONTS, ...fonts])], [fonts]);
  const q = (query || '').trim().toLowerCase();
  const shown = q ? options.filter((f) => f.toLowerCase().includes(q)) : options;

  const pick = (f) => {
    inputRef.current?.blur();
    close();
    onChange(f);
  };

  const commitTyped = () => {
    if (query === null) { close(); return; }
    const raw = query.replace(/["';{}]/g, '').trim();
    const exact = options.find((f) => f.toLowerCase() === raw.toLowerCase());
    pick(!raw || raw.toLowerCase() === 'predefinito' ? '' : (exact || raw));
  };

  return (
    <div ref={wrapRef} className={`relative flex items-center ${className}`}>
      <input
        ref={inputRef}
        value={query ?? (value || 'Predefinito')}
        title={title}
        spellCheck={false}
        autoComplete="off"
        onFocus={(e) => { const el = e.target; requestAnimationFrame(() => el.select()); openList(); }}
        onClick={() => { if (!open) openList(); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitTyped(); }
          else if (e.key === 'Escape') { close(); e.target.blur(); }
          else if (e.key === 'Tab') close();
        }}
        className="flex-1 min-w-0 h-full px-2 bg-transparent outline-none text-[11px] font-bold text-gray-900 cursor-pointer"
      />
      <button
        type="button"
        tabIndex={-1}
        title={title}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) close();
          else { inputRef.current?.focus(); openList(); }
        }}
        className="h-full pr-2 flex items-center shrink-0 text-gray-900"
      >
        <Arrow />
      </button>

      {open && (
        <FloatingList anchorRef={wrapRef} onClose={close} minWidth={210}>
          <Item active={!value && query === null} onPick={() => pick('')}>Predefinito</Item>
          {shown.map((f) => (
            <Item key={f} active={value === f} onPick={() => pick(f)} style={{ fontFamily: `"${f}"` }}>{f}</Item>
          ))}
          {q && !options.some((f) => f.toLowerCase() === q) && (
            <Item onPick={commitTyped}>Usa «{query.trim()}»</Item>
          )}
          {!supportsLocalFonts() && !q && (
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 border-t-2 border-gray-900">
              Per altri font installati scrivi il nome e premi Invio.
            </div>
          )}
        </FloatingList>
      )}
    </div>
  );
}

// Dimensione del carattere: stesso aspetto e stessa freccia del campo font.
export function SizePicker({ value, onChange, className = '', title = 'Dimensione' }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div ref={ref} className={`relative flex items-center ${className}`}>
      <button
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="flex items-center gap-2 h-full px-2 text-[11px] font-bold text-gray-900"
      >
        <span>{value}</span>
        <Arrow />
      </button>
      {open && (
        <FloatingList anchorRef={ref} onClose={close} minWidth={76}>
          {FONT_SIZES.map((s) => (
            <Item key={s} active={s === value} onPick={() => { close(); onChange(s); }}>{s}</Item>
          ))}
        </FloatingList>
      )}
    </div>
  );
}
