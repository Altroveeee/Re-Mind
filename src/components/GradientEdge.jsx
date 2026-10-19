import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { BaseEdge, Position, getBezierPath } from 'reactflow';
import { DEFAULT_LINK_COLOR } from './nodeColors';
import { useStore } from '../store/useStore';

// Sposta un punto di attacco lungo il lato del nodo, separare più collegamenti sullo stesso punto)
const shift = (x, y, position, off) => {
  if (!off) return [x, y];
  return position === Position.Left || position === Position.Right ? [x, y + off] : [x + off, y];
};

// Tacca di partenza
const SourceTick = ({ x, y, position, color }) => {
  const vertical = position === Position.Left || position === Position.Right;
  return vertical
    ? <rect x={x - 1} y={y - 7} width={2} height={14} fill={color} />
    : <rect x={x - 7} y={y - 1} width={14} height={2} fill={color} />;
};

// Freccia di arrivo, rivolta verso il nodo
const TargetArrow = ({ x, y, position, color }) => {
  const pts = {
    [Position.Left]: [[x - 6, y - 6], [x - 6, y + 6], [x + 6, y]],
    [Position.Right]: [[x + 6, y - 6], [x + 6, y + 6], [x - 6, y]],
    [Position.Top]: [[x - 6, y - 6], [x + 6, y - 6], [x, y + 6]],
    [Position.Bottom]: [[x - 6, y + 6], [x + 6, y + 6], [x, y - 6]],
  }[position] || [];
  return <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={color} />;
};

const SELECTED = '#9ca3af';

//lunghezza massima label
const LABEL_MAX_CH = 22;

// Etichetta del collegamento: solo testo, senza sfondo né bordo. Va a capo da sola se è lunga e, premendo Invio,
// anche a mano. Esc per uscire dalla modifica.
function EdgeLabel({ value, onChange, onEmpty, onSize }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  // Comunica la misura del testo: serve a lasciare vuoto il pezzo di linea che ci passa sotto
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onSize) return;
    const report = () => onSize({ w: el.offsetWidth, h: el.offsetHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onSize, value]);

  const longestLine = String(value).split('\n').reduce((m, l) => Math.max(m, l.length), 0);

  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={value === ''}
      value={value}
      placeholder="Etichetta"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => { if (!e.target.value.trim()) onEmpty(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') e.target.blur(); }}
      style={{
        width: `${Math.min(Math.max(longestLine, 8), LABEL_MAX_CH) + 2}ch`,
        background: 'transparent',
        color: 'var(--ink)',
        border: 0,
        pointerEvents: 'all',
      }}
      className="block text-[11px] font-bold leading-snug px-2 py-0.5 text-center outline-none cursor-text resize-none overflow-hidden whitespace-pre-wrap break-words"
    />
  );
}

// Collegamento con gradiente: dal colore del nodo di partenza a quello del nodo di arrivo.
// Il <linearGradient> usa coordinate assolute (userSpaceOnUse) così funziona anche
// per tratti perfettamente orizzontali o verticali, dove la bounding box ha altezza/larghezza 0.
// Le tacche e le frecce sono disegnate qui, così seguono il collegamento anche quando più collegamenti
// condividono lo stesso lato di un nodo (data.sourceOffset / data.targetOffset li distanziano).
export default function GradientEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  selected,
}) {
  const updateEdgeData = useStore((state) => state.updateEdgeData);
  const [labelSize, setLabelSize] = useState({ w: 0, h: 0 });
  const handleSize = React.useCallback((sz) => setLabelSize((cur) => (cur.w === sz.w && cur.h === sz.h ? cur : sz)), []);
  const [sx, sy] = shift(sourceX, sourceY, sourcePosition, data?.sourceOffset);
  const [tx, ty] = shift(targetX, targetY, targetPosition, data?.targetOffset);
  const [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition, targetX: tx, targetY: ty, targetPosition });

  const from = data?.fromColor || DEFAULT_LINK_COLOR;
  const to = data?.toColor || DEFAULT_LINK_COLOR;
  const gradientId = `grad-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const hasLabel = data?.label !== undefined && data?.label !== null;
  const maskId = `mask-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const GAP = 5; // aria vuota attorno al testo

  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={tx} y2={ty}>
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      {hasLabel && (
        // Maschera: tutta bianca (linea visibile) tranne un rettangolo nero (linea nascosta) dove sta il testo
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
          <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
          {labelSize.w > 0 && (
            <rect
              x={labelX - labelSize.w / 2 - GAP}
              y={labelY - labelSize.h / 2 - GAP}
              width={labelSize.w + GAP * 2}
              height={labelSize.h + GAP * 2}
              fill="black"
            />
          )}
        </mask>
      )}
      <g mask={hasLabel ? `url(#${maskId})` : undefined}>
        <BaseEdge
          id={id}
          path={path}
          style={{ ...style, stroke: `url(#${gradientId})`, strokeDasharray: data?.dashed ? '7 6' : undefined }}
        />
      </g>

      {hasLabel && (
        // L'etichetta è dentro il disegno del collegamento, così la linea le gira attorno senza coprirla
        <foreignObject x={labelX - 120} y={labelY - 60} width={240} height={120} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <div className="nodrag nopan" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <EdgeLabel
              value={data.label}
              onChange={(v) => updateEdgeData(id, { label: v })}
              onEmpty={() => updateEdgeData(id, { label: undefined })}
              onSize={handleSize}
            />
          </div>
        </foreignObject>
      )}
      <SourceTick x={sx} y={sy} position={sourcePosition} color={selected ? SELECTED : from} />
      <TargetArrow x={tx} y={ty} position={targetPosition} color={selected ? SELECTED : to} />
    </>
  );
}