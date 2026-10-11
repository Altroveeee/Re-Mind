import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, ConnectionMode } from 'reactflow';
import 'reactflow/dist/style.css';
import SemanticNode from './SemanticNode';
import GradientEdge from './GradientEdge';
import { useStore } from '../store/useStore';
import { useResolvedTheme } from './useThemeColors';
import { mixHex } from './nodeColors';
import { create } from 'zustand';
import { Layout, Minus } from 'lucide-react';

export const useViewStore = create((set) => ({
  viewMode: 'completa',
  setViewMode: (mode) => set({ viewMode: mode }),
  // Aspetto delle immagini nei nodi: 'attuale' (dithering) | 'bn' (bianco e nero) | 'colore'
  imageMode: 'attuale',
  setImageMode: (mode) => set({ imageMode: mode }),
}));


// ==========================================
// CENTRO DELLA VISTA: usato per piazzare i nuovi nodi in mezzo alla finestra
// e per mantenere la vista centrata quando il pannello cambia dimensione.
// ==========================================
const NODE_W = 288; // w-72
const NODE_H = 130; // altezza media di un nodo appena creato
const viewRefs = { instance: null, wrapper: null, lastCenter: { x: 150, y: 100 } };

const readCenter = () => {
  const { instance, wrapper } = viewRefs;
  if (!instance || !wrapper || !wrapper.isConnected) return null;
  const w = wrapper.clientWidth, h = wrapper.clientHeight;
  if (!w || !h) return null;
  const vp = instance.getViewport();
  return { x: (w / 2 - vp.x) / vp.zoom, y: (h / 2 - vp.y) / vp.zoom };
};

// Posizione (angolo alto-sinistra) per un nuovo nodo, in modo che risulti al centro di ciò che si vede.
export function getNewNodePosition() {
  const c = readCenter() || viewRefs.lastCenter;
  return { x: c.x - NODE_W / 2, y: c.y - NODE_H / 2 };
}

const nodeTypes = {
  semantic: SemanticNode,
};

const edgeTypes = {
  gradient: GradientEdge,
};

export default function SpatialMapView() {
  const nodes = useStore((state) => state.nodes);
  const rawEdges = useStore((state) => state.edges);

  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);

  const resolved = useResolvedTheme();
  const ink = resolved.ink;
  const dotColor = resolved.dots || mixHex(ink, resolved.mapBg, 0.5);
  const viewMode = useViewStore((state) => state.viewMode);
  const setViewMode = useViewStore((state) => state.setViewMode);

  const documents = useStore((state) => state.documents);
  const sources = useStore((state) => state.sources);
  const [noticeFor, setNoticeFor] = useState(null);

  // Da quali file arrivano i nodi: se il file non è nella libreria, la voce diventa rossa e barrata.
  const sourceList = useMemo(() => {
    const ids = [...new Set(nodes.map((n) => n.data?.docId).filter(Boolean))];
    return ids.map((id) => ({
      id,
      name: sources[id] || 'file sconosciuto',
      missing: !documents.some((d) => d.id === id),
    }));
  }, [nodes, documents, sources]);
  const notice = sourceList.find((x) => x.id === noticeFor && x.missing);

  const wrapperRef = useRef(null);
  const prevSize = useRef(null);

  // Quando il pannello cambia dimensione (metà pagina <-> tutta pagina) il punto al centro resta al centro.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    viewRefs.wrapper = el;
    prevSize.current = { w: el.clientWidth, h: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const inst = viewRefs.instance;
      const w = el.clientWidth, h = el.clientHeight;
      const prev = prevSize.current;
      if (!inst || !w || !h || !prev || !prev.w || !prev.h) { prevSize.current = { w, h }; return; }
      const vp = inst.getViewport();
      const cx = (prev.w / 2 - vp.x) / vp.zoom;
      const cy = (prev.h / 2 - vp.y) / vp.zoom;
      viewRefs.lastCenter = { x: cx, y: cy };
      inst.setViewport({ x: w / 2 - cx * vp.zoom, y: h / 2 - cy * vp.zoom, zoom: vp.zoom });
      prevSize.current = { w, h };
    });
    observer.observe(el);
    return () => {
      const c = readCenter();
      if (c) viewRefs.lastCenter = c;
      observer.disconnect();
      viewRefs.instance = null;
      viewRefs.wrapper = null;
    };
  }, []);

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  const edges = useMemo(() => {
    return rawEdges.map((edge) => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      let sHandle = edge.sourceHandle;
      let tHandle = edge.targetHandle;

      if (sourceNode && targetNode) {
        const dx = targetNode.position.x - sourceNode.position.x;
        const dy = targetNode.position.y - sourceNode.position.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          sHandle = dx > 0 ? 'right' : 'left';
          tHandle = dx > 0 ? 'left' : 'right';
        } else {
          sHandle = dy > 0 ? 'bottom' : 'top';
          tHandle = dy > 0 ? 'top' : 'bottom';
        }
      }

      const isSelected = edge.selected;

      return {
        ...edge,
        type: 'gradient',
        sourceHandle: sHandle,
        targetHandle: tHandle,
        // Gradiente: colore del nodo di partenza -> colore del nodo di arrivo
        data: {
          ...edge.data,
          fromColor: sourceNode?.data?.color || ink,
          toColor: targetNode?.data?.color || ink,
        },
        style: {
          ...edge.style,
          stroke: isSelected ? '#9ca3af' : ink,
          strokeWidth: 1.5,
        }
        // NESSUN MARKER. LA FRECCIA È STATA DISTRUTTA.
      };
    });
  }, [rawEdges, nodes, ink]);

  const toggleBtn = (active) => `p-2 transition-colors ${active ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`;

  return (
    <div ref={wrapperRef} className="w-full h-full relative bg-[#f4f4f4]">
      <style>{`
        .react-flow__edge.selected .react-flow__edge-path,
        .react-flow__edge:focus .react-flow__edge-path,
        .react-flow__edge:focus-visible .react-flow__edge-path {
          stroke: #9ca3af !important;
        }
        .react-flow__attribution {
          background: var(--paper);
          border: 2px solid var(--ink);
          padding: 2px 6px;
          margin: 0 8px 8px 0;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .react-flow__attribution a { color: var(--ink); }
      `}</style>

      <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-3">
        {/* Modalità di visualizzazione dei nodi */}
        <div className="flex border-2 border-gray-900 bg-white">
          <button onClick={() => setViewMode('completa')} className={toggleBtn(viewMode === 'completa')} title="Vista completa">
            <Layout size={16} strokeWidth={3} />
          </button>
          <div className="w-[2px] bg-gray-900 shrink-0"></div>
          <button onClick={() => setViewMode('sintetica')} className={toggleBtn(viewMode === 'sintetica')} title="Vista sintetica">
            <Minus size={16} strokeWidth={3} />
          </button>
        </div>

      </div>

      {sourceList.some((s) => s.missing) && (
        <div className="absolute bottom-2 left-14 right-24 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-widest pointer-events-none">
          {sourceList.filter((s) => s.missing).map((src) => (
            <button
              key={src.id}
              onClick={() => src.missing && setNoticeFor((cur) => (cur === src.id ? null : src.id))}
              className={`pointer-events-auto bg-transparent ${src.missing ? 'text-red-600 line-through cursor-pointer' : 'text-gray-500 cursor-default'}`}
              title={src.missing ? 'File mancante: clicca per i dettagli' : src.name}
            >
              {src.name}
            </button>
          ))}
        </div>
      )}

      {notice && (
        <div className="absolute bottom-10 left-14 z-[60] w-72 bg-white border-2 border-gray-900 p-3 text-xs text-gray-900">
          <div className="font-black uppercase tracking-wider mb-2">Manca il file «{notice.name}»</div>
          <p className="leading-snug mb-2">
            Alcuni nodi di questo quaderno vengono da questo testo, ma il testo non è tra quelli del quaderno.
          </p>
          <p className="leading-snug mb-3">
            Per sistemare: importa il file «{notice.name}» (PDF o TXT) dal pulsante Importa nella barra Quaderni (con questo quaderno aperto), mantenendo lo stesso nome, oppure apri il pacchetto .remind completo da File. I nodi si ricollegheranno da soli.
          </p>
          <button onClick={() => setNoticeFor(null)} className="px-3 py-1 border-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest hover:bg-gray-900 hover:text-white">Chiudi</button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        connectionRadius={150}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionMode={ConnectionMode.Loose}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        onInit={(instance) => { viewRefs.instance = instance; }}
        fitView
        attributionPosition="bottom-right"
      >
        <Background color={dotColor} gap={16} size={1} />
        <Controls className="bg-white border-2 border-gray-900 rounded-none !shadow-none" style={{ boxShadow: 'none' }} />
      </ReactFlow>
    </div>
  );
}
