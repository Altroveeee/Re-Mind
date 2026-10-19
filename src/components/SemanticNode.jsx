import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, useStore as useReactFlowStore } from 'reactflow';
import { useStore } from '../store/useStore';
import { useViewStore } from './SpatialMapView';
import { X } from 'lucide-react';
import { readableTextColor } from './nodeColors';
import { processImageFile } from './imageUtils';
import { useSearchStore, findAll, splitByHits } from './searchStore';

//selezione nodi
const SelectionBrackets = ({ selected }) => (
  <div className={`absolute -inset-[15px] pointer-events-none transition-opacity duration-150 z-0 ${selected ? 'opacity-100' : 'opacity-0'}`}>
    <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-gray-900" />
    <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-gray-900" />
    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-gray-900" />
    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-gray-900" />
  </div>
);

// ==========================================
// RIDIMENSIONAMENTO: gli angoli del nodo
// ==========================================
// Passando sopra un angolo compare lo stesso simbolo della selezione (uno solo alla volta);
// trascinandolo si cambia la dimensione del nodo. sx/sy dicono in che verso cresce il nodo
// (-1 = verso sinistra/alto: in quel caso si sposta anche la posizione del nodo).
// Le classi sono scritte per intero perché Tailwind le trovi.
const CORNERS = [
  { k: 'nw', sx: -1, sy: -1, cursor: 'nwse-resize', zone: '-top-[19px] -left-[19px]', mark: 'top-1 left-1 border-t-[2px] border-l-[2px]' },
  { k: 'ne', sx: 1, sy: -1, cursor: 'nesw-resize', zone: '-top-[19px] -right-[19px]', mark: 'top-1 right-1 border-t-[2px] border-r-[2px]' },
  { k: 'sw', sx: -1, sy: 1, cursor: 'nesw-resize', zone: '-bottom-[19px] -left-[19px]', mark: 'bottom-1 left-1 border-b-[2px] border-l-[2px]' },
  { k: 'se', sx: 1, sy: 1, cursor: 'nwse-resize', zone: '-bottom-[19px] -right-[19px]', mark: 'bottom-1 right-1 border-b-[2px] border-r-[2px]' },
];

const MIN_NODE_WIDTH = 180;
const DEFAULT_NODE_WIDTH = 288; // come il vecchio w-72

const ResizeCorner = ({ corner, visible, onHover, onStart, onReset }) => (
  <div
    className={`absolute w-6 h-6 z-40 nodrag nopan ${corner.zone}`}
    style={{ cursor: corner.cursor }}
    onMouseEnter={() => onHover(corner.k)}
    onMouseLeave={() => onHover(null)}
    onMouseDown={(e) => onStart(e, corner)}
    onDoubleClick={onReset}
    title="Trascina per ridimensionare (doppio clic: dimensione automatica)"
  >
    <div className={`absolute w-3 h-3 border-gray-900 pointer-events-none transition-opacity duration-150 ${corner.mark} ${visible ? 'opacity-100' : 'opacity-0'}`} />
  </div>
);

// ==========================================
// TERMINALI STATICI: Perno Centrale e Anti-Sovrascrittura
// ==========================================
const StaticHandle = ({ position, id, nodeId, isReceiving, color, hidden }) => {
  const connectionNodeId = useReactFlowStore((state) => state.connectionNodeId);
  const connectionHandleId = useReactFlowStore((state) => state.connectionHandleId);
  const isConnectingFromHere = connectionNodeId === nodeId && connectionHandleId === id;
  const [handleHovered, setHandleHovered] = useState(false);

  // Tacche e frecce dei collegamenti già fatti sono disegnate dal collegamento stesso (GradientEdge):
  // il terminale compare solo al passaggio del mouse, mentre si collega, o come bersaglio di un collegamento in corso.
  const isTriangle = isReceiving;
  const isVisibleForce = isReceiving || isConnectingFromHere;
  const isVertical = position === Position.Top || position === Position.Bottom;

  // IL TERMINALE VERO (quello che React Flow misura) ha SEMPRE la stessa forma, dimensione e posizione:
  // una tacca ferma, senza scala né transizioni. Così il punto di attacco dei collegamenti non cambia
  // mai mentre il mouse entra/esce o mentre si collega, e la freccia è centrata fin dal primo istante.
  // Tutto ciò che si anima (tacca, triangolo, scala, opacità) sta nel disegno interno, che React Flow non misura.
  const hitStyle = {
    top: position === Position.Top ? -18 : (isVertical ? 'auto' : '50%'),
    bottom: position === Position.Bottom ? -18 : 'auto',
    left: position === Position.Left ? -18 : (isVertical ? '50%' : 'auto'),
    right: position === Position.Right ? -18 : 'auto',
    width: isVertical ? 14 : 2,
    height: isVertical ? 2 : 14,
    transform: isVertical ? 'translateX(-50%)' : 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    minWidth: 0,
    minHeight: 0,
  };

  let clipPath;
  if (isTriangle) {
    if (position === Position.Top) clipPath = 'polygon(0% 0%, 100% 0%, 50% 100%)';
    if (position === Position.Bottom) clipPath = 'polygon(0% 100%, 100% 100%, 50% 0%)';
    if (position === Position.Left) clipPath = 'polygon(0% 0%, 0% 100%, 100% 50%)';
    if (position === Position.Right) clipPath = 'polygon(100% 0%, 0% 50%, 100% 100%)';
  }
  const shapeW = isTriangle ? 12 : (isVertical ? 14 : 2);
  const shapeH = isTriangle ? 12 : (isVertical ? 2 : 14);
  const shown = !hidden && (isVisibleForce || handleHovered);

  return (
    <Handle
      type="source"
      position={position}
      id={id}
      onMouseEnter={() => setHandleHovered(true)}
      onMouseLeave={() => setHandleHovered(false)}
      className="z-50 cursor-crosshair absolute !outline-none focus:!outline-none !ring-0 !shadow-none after:content-[''] after:absolute after:-inset-4"
      style={hitStyle}
    >
      <span
        className={`absolute pointer-events-none ${shown ? '' : (hidden ? '' : 'opacity-0 group-hover:opacity-100')}`}
        style={{
          left: '50%',
          top: '50%',
          width: shapeW,
          height: shapeH,
          clipPath,
          backgroundColor: color || 'var(--ink)',
          opacity: hidden ? 0 : (shown ? 1 : undefined),
          transform: `translate(-50%, -50%) scale(${handleHovered ? 1.25 : 1})`,
          transition: 'transform 200ms, opacity 200ms',
        }}
      />
    </Handle>
  );
};

export default function SemanticNode({ id, data, dragging, selected, xPos, yPos }) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const viewMode = useViewStore((state) => state.viewMode);
  const imageMode = useViewStore((state) => state.imageMode);

  const updateNodeInternals = useUpdateNodeInternals();
  const textareaRef = useRef(null);
  const cardRef = useRef(null);
  const headerRef = useRef(null);
  const bodyRef = useRef(null);

  const [hoverCorner, setHoverCorner] = useState(null);
  const [resizingCorner, setResizingCorner] = useState(null);
  // Lo zoom della mappa serve a convertire i pixel del mouse in pixel del nodo
  const zoom = useReactFlowStore((state) => state.transform[2]);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const connectionNodeId = useReactFlowStore((state) => state.connectionNodeId);
  const isReceiving = connectionNodeId && connectionNodeId !== id;

  const [inputKey, setInputKey] = useState(Date.now());
  const [tilt, setTilt] = useState({ x: 0, z: 0 });
  const lastPos = useRef({ x: xPos, y: yPos });

  const [isHovered, setIsHovered] = useState(false);
  // Se il nodo contiene citazioni, il testo si legge con lo stile della citazione; cliccandolo si passa alla modifica
  const [editing, setEditing] = useState(false);
  const quoteSet = new Set(data.quotes || []);
  const labelLines = String(data.label || '').split('\n');
  const hasQuote = quoteSet.size > 0 && labelLines.some((l) => quoteSet.has(l));
  // Ricerca: le parole trovate nel testo del nodo si evidenziano (il testo si legge in sola visualizzazione finché non si clicca)
  const searchQuery = useSearchStore((state) => state.query);
  const isCurrentHit = useSearchStore((state) => state.currentNodeId === id);
  const labelHasHit = !!searchQuery && findAll(data.label || '', searchQuery).length > 0;
  const showQuoteView = (hasQuote || labelHasHit) && !editing;

  const nodeColor = data.color || null;
  const headerTextColor = nodeColor ? readableTextColor(nodeColor) : undefined;

  useEffect(() => {
    let start = Date.now();
    const timer = setInterval(() => {
       updateNodeInternals(id);
       if (Date.now() - start > 320) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [isHovered, dragging, isReceiving, id, updateNodeInternals]);

  useEffect(() => {
    if (!dragging) {
      setTilt({ x: 0, z: 0 });
      lastPos.current = { x: xPos, y: yPos };
      return;
    }
    const deltaX = xPos - (lastPos.current.x || xPos);
    const deltaY = yPos - (lastPos.current.y || yPos);

    const tiltZ = Math.max(-6, Math.min(6, deltaX * 1.2));
    const tiltX = Math.max(-6, Math.min(6, deltaY * -1.2));

    setTilt({ x: tiltX, z: tiltZ });
    lastPos.current = { x: xPos, y: yPos };

    const timeout = setTimeout(() => setTilt({ x: 0, z: 0 }), 120);
    return () => clearTimeout(timeout);
  }, [xPos, yPos, dragging]);

  // Altezza del testo: va ricalcolata anche quando si cambia vista (la textarea viene rimontata
  // da zero con rows=1) e dopo il layout, quando la larghezza del nodo è definitiva.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    updateNodeInternals(id);
    const raf = requestAnimationFrame(() => { fit(); updateNodeInternals(id); });
    return () => cancelAnimationFrame(raf);
  }, [data.label, data.width, editing, viewMode, showQuoteView, id, updateNodeInternals]);

  // Entrando in modifica il cursore va in fondo al testo
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  // Cambia l'aspetto del testo (citazioni): React Flow rimisura il nodo
  useEffect(() => {
    const t = setTimeout(() => updateNodeInternals(id), 50);
    return () => clearTimeout(t);
  }, [data.quotes, showQuoteView, id, updateNodeInternals]);

  // Cambiando la dimensione, React Flow deve rimisurare il nodo (terminali e collegamenti seguono)
  useEffect(() => { updateNodeInternals(id); }, [data.width, data.height, id, updateNodeInternals]);

  // Trascinando un angolo il nodo cambia larghezza e altezza. Dagli angoli di sinistra/alto
  // si sposta anche la posizione, così l'angolo opposto resta fermo.
  // L'altezza non scende sotto quella del contenuto.
  const startResize = (e, corner) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const card = cardRef.current;
    if (!card) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = card.offsetWidth;
    const startH = card.offsetHeight;
    const origin = { x: xPos, y: yPos };
    setResizingCorner(corner.k);

    const onMove = (ev) => {
      const z = zoomRef.current || 1;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      const minH = (headerRef.current?.offsetHeight || 0) + (bodyRef.current?.offsetHeight || 0) + 4;
      const w = Math.max(MIN_NODE_WIDTH, Math.round(startW + corner.sx * dx));
      const h = Math.max(minH, Math.round(startH + corner.sy * dy));
      updateNodeData(id, { width: w, height: h });
      if (corner.sx < 0 || corner.sy < 0) {
        const position = {
          x: corner.sx < 0 ? origin.x + (startW - w) : origin.x,
          y: corner.sy < 0 ? origin.y + (startH - h) : origin.y,
        };
        useStore.getState().onNodesChange?.([{ id, type: 'position', position, dragging: false }]);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizingCorner(null);
      setTimeout(() => updateNodeInternals(id), 50);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const resetSize = (e) => {
    e.stopPropagation();
    updateNodeData(id, { width: null, height: null });
  };

  // Ricalcola le dimensioni del nodo quando cambia l'immagine o la modalità di visualizzazione
  useEffect(() => {
    const t = setTimeout(() => updateNodeInternals(id), 50);
    return () => clearTimeout(t);
  }, [imageMode, data.image, data.imageOriginal, id, updateNodeInternals]);

  const applyImageFile = async (file) => {
    if (!file) return;
    try {
      const result = await processImageFile(file);
      updateNodeData(id, result);
    } catch (err) { /* immagine non valida: si ignora */ }
    setInputKey(Date.now());
    setTimeout(() => updateNodeInternals(id), 50);
  };

  const handleImageUpload = (e) => applyImageFile(e.target.files[0]);

  // TRASCINARE UN'IMMAGINE NEL NODO (dal computer o dal browser, se arriva come file)
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const hasImageFile = (dt) => !!dt && Array.from(dt.items || []).some((it) => it.kind === 'file' && (!it.type || it.type.startsWith('image/')));
  const onDragEnter = (e) => {
    if (!hasImageFile(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDropActive(true);
  };
  const onDragOver = (e) => {
    if (!hasImageFile(e.dataTransfer)) return;
    e.preventDefault(); // necessario perché il rilascio sia permesso
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e) => {
    if (!dropActive) return;
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropActive(false);
  };
  const onDrop = (e) => {
    const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
    dragDepth.current = 0;
    setDropActive(false);
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    applyImageFile(file);
  };

  const handleRemoveImage = (e) => {
    e.stopPropagation();
    updateNodeData(id, { image: null, imageOriginal: null });
    setInputKey(Date.now());
    setTimeout(() => updateNodeInternals(id), 50);
  };

  const kineticStyle = {
    transform: `perspective(800px) rotateX(${dragging ? tilt.x : 0}deg) rotateZ(${dragging ? tilt.z : 0}deg)`,
    transformOrigin: 'center center',
    boxShadow: dragging
      ? `${6 + (tilt.z * -1.2)}px ${6 + (tilt.x * 1.2)}px 0px 0px var(--ink)`
      : (isHovered ? '6px 6px 0px 0px var(--ink)' : '0px 0px 0px 0px var(--ink)'),
    transition: dragging
      ? 'transform 0.08s ease-out, box-shadow 0.08s ease-out'
      : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease-out'
  };

  const outerWrapperClasses = `relative group ${dragging ? 'cursor-grabbing z-50' : 'cursor-grab z-10 hover:z-20'}`;
  const elevationWrapperClasses = `w-full h-full relative transition-all duration-200 ${dragging ? '-top-[6px] -left-[6px]' : 'top-0 left-0 group-hover:-top-[6px] group-hover:-left-[6px]'}`;
  const innerCardClasses = "bg-white border-2 border-gray-900 w-full h-full relative flex flex-col"; //per la sezione del nodo

  if (viewMode === 'sintetica') {
    return (
    <div className={outerWrapperClasses} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className={elevationWrapperClasses}>

        <SelectionBrackets selected={selected || isCurrentHit} />

        <StaticHandle position={Position.Top} id="top" nodeId={id} isReceiving={isReceiving} color={nodeColor} />
        <StaticHandle position={Position.Left} id="left" nodeId={id} isReceiving={isReceiving} color={nodeColor} />
        <StaticHandle position={Position.Right} id="right" nodeId={id} isReceiving={isReceiving} color={nodeColor} />
        <StaticHandle position={Position.Bottom} id="bottom" nodeId={id} isReceiving={isReceiving} color={nodeColor} />

        <div
          className={`px-2 py-1.5 !flex-row items-center justify-between gap-2 ${innerCardClasses}`}
          style={{ ...kineticStyle, backgroundColor: nodeColor || undefined }}
        >
          <input
              type="text"
              placeholder="SENZA TITOLO"
              value={data.title || ''}
              onChange={(e) => updateNodeData(id, { title: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[10px] font-bold uppercase tracking-widest text-gray-900 bg-transparent outline-none w-full placeholder-gray-400 nodrag cursor-text relative z-30 min-w-0 text-left"
              style={{ color: headerTextColor }}
          />
        </div>
      </div>
    </div>
    );
  }

  const hasImage = !!(data.image || data.imageOriginal);
  const showImage = viewMode === 'completa' && hasImage;
  // "attuale" = dithering a 1 bit; "bn" e "colore" partono dall'originale (se assente, ripiegano sul dithering)
  const imageSrc = imageMode === 'attuale'
    ? (data.image || data.imageOriginal)
    : (data.imageOriginal || data.image);
  const imageFilter = imageMode === 'bn' ? 'grayscale(1) contrast(1.05)' : 'none';

  return (
    <div className={`rounded-md ${outerWrapperClasses}`} style={{ width: data.width || DEFAULT_NODE_WIDTH }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className={elevationWrapperClasses}>

        <SelectionBrackets selected={selected || isCurrentHit} />

        <StaticHandle position={Position.Top} id="top" nodeId={id} isReceiving={isReceiving} color={nodeColor} />
        <StaticHandle position={Position.Left} id="left" nodeId={id} isReceiving={isReceiving} color={nodeColor} />
        <StaticHandle position={Position.Right} id="right" nodeId={id} isReceiving={isReceiving} color={nodeColor} />
        <StaticHandle position={Position.Bottom} id="bottom" nodeId={id} isReceiving={isReceiving} color={nodeColor} />

        {/* Angoli di ridimensionamento: ne compare uno solo, quello sotto il mouse (o quello che si sta trascinando) */}
        {CORNERS.map((c) => (
          <ResizeCorner
            key={c.k}
            corner={c}
            visible={resizingCorner ? resizingCorner === c.k : hoverCorner === c.k}
            onHover={setHoverCorner}
            onStart={startResize}
            onReset={resetSize}
          />
        ))}

        <div
          ref={cardRef}
          className={`rounded-md ${innerCardClasses}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            ...kineticStyle,
            minHeight: data.height || undefined,
            outline: dropActive ? '3px dashed var(--ink)' : undefined,
            outlineOffset: dropActive ? 6 : undefined,
          }}
        >
          {dropActive && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none text-[10px] font-bold uppercase tracking-widest" style={{ background: 'var(--paper)', opacity: 0.88, color: 'var(--ink)' }}>
              {hasImage ? 'Rilascia per sostituire l\u2019immagine' : 'Rilascia per aggiungere l\u2019immagine'}
            </div>
          )}

          {/* L'Intestazione (Header): prende il colore del nodo */}
          <div
            ref={headerRef}
            className="flex items-center justify-between border-b-2 border-gray-900 px-3 py-2 bg-transparent relative z-30 rounded-t-[4px]"
            style={{ backgroundColor: nodeColor || undefined }}
          >
            <input
              type="text"
              placeholder="SENZA TITOLO"
              value={data.title || ''}
              onChange={(e) => updateNodeData(id, { title: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-xs font-bold uppercase tracking-wider text-gray-900 bg-transparent w-full focus:outline-none placeholder-gray-300 nodrag cursor-text min-w-0"
              style={{ color: headerTextColor }}
            />
          </div>

          {/* Il corpo del nodo */}
          <div ref={bodyRef} className="flex flex-col gap-3 px-4 pb-4 pt-3 relative z-30">

            {showImage && (
              <div className="relative border-2 border-gray-900 bg-white nodrag">
                <img
                  src={imageSrc}
                  alt=""
                  draggable={false}
                  className="block w-full h-auto"
                  style={{ filter: imageFilter }}
                  onLoad={() => updateNodeInternals(id)}
                />
                <button
                  onClick={handleRemoveImage}
                  title="Rimuovi immagine"
                  className="absolute top-1 right-1 p-0.5 bg-white border-2 border-gray-900 text-gray-900 hover:text-red-600 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            )}

            {showQuoteView && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setEditing(true)}
                title="Clicca per modificare"
                className="nodrag cursor-text p-1 -mx-1 rounded-sm w-full"
              >
                {labelLines.map((line, i) => {
                  const content = splitByHits(line, searchQuery).map((part, k) => (
                    part.hit
                      ? <mark key={k} style={{ background: 'var(--ink)', color: 'var(--paper)', padding: 0 }}>{part.text}</mark>
                      : <React.Fragment key={k}>{part.text}</React.Fragment>
                  ));
                  return (
                  quoteSet.has(line)
                    ? (
                      <div
                        key={i}
                        className="text-gray-800 font-medium leading-snug break-words whitespace-pre-wrap my-1.5"
                        style={{ borderLeft: '3px solid var(--ink)', paddingLeft: '0.6em', fontSize: '1.1em' }}
                      >
                        {line ? content : '\u00a0'}
                      </div>
                    )
                    : (
                      <div key={i} className="text-sm text-gray-800 font-medium leading-snug break-words whitespace-pre-wrap">
                        {line ? content : '\u00a0'}
                      </div>
                    )
                  );
                })}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={data.label || ''}
              onChange={(e) => updateNodeData(id, { label: e.target.value })}
              onBlur={() => setEditing(false)}
              onMouseDown={(e) => e.stopPropagation()}
              style={showQuoteView ? { display: 'none' } : undefined}
              className="text-sm text-gray-800 font-medium leading-snug break-words bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 p-1 -mx-1 rounded-sm w-full overflow-hidden transition-shadow nodrag cursor-text"
              rows={1}
            />

            {viewMode === 'completa' && (
              <label className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 mt-1 nodrag">
                <span>{hasImage ? '+ Sostituisci Immagine' : '+ Allega Immagine'}</span>
                <input key={`add-${inputKey}`} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
