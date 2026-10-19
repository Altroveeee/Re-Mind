import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, ConnectionMode } from 'reactflow';
import 'reactflow/dist/style.css';
import SemanticNode from './SemanticNode';
import GradientEdge from './GradientEdge';
import { useStore } from '../store/useStore';
import { useResolvedTheme } from './useThemeColors';
import { mixHex } from './nodeColors';
import { useSearchStore, findAll, currentIndex } from './searchStore';
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

// Porta un nodo al centro della vista (ricerca)
export function focusNodeInView(id) {
  const inst = viewRefs.instance;
  if (!inst) return;
  const n = inst.getNode(id);
  if (!n) return;
  const w = n.width || NODE_W, h = n.height || NODE_H;
  inst.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: Math.max(inst.getZoom(), 0.8), duration: 450 });
}

// Posizione (angolo alto-sinistra) per un nuovo nodo, in modo che risulti al centro di ciò che si vede.
export function getNewNodePosition() {
  const c = readCenter() || viewRefs.lastCenter;
  return { x: c.x - NODE_W / 2, y: c.y - NODE_H / 2 };
}

// Cornice di un capitolo: circonda i nodi nati sotto un titolo (H1) del testo, con il titolo in una linguetta.
// Non è interattiva: i clic passano ai nodi e alla mappa.
const ChapterFrame = ({ data }) => (
  <div className="w-full h-full relative pointer-events-none" style={{ border: '2px solid var(--ink)' }}>
    {data.title && (
      <div
        className="absolute whitespace-nowrap text-sm font-medium leading-none px-1.5 py-1"
        style={{ left: -2, bottom: 'calc(100% + 2px)', background: 'var(--ink)', color: 'var(--paper)' }}
      >
        {data.title}
      </div>
    )}
  </div>
);

const nodeTypes = {
  semantic: SemanticNode,
  chapter: ChapterFrame,
};

const FRAME_PAD = 56; // spazio tra i nodi e la cornice (dentro ci stanno anche i terminali e gli angoli di selezione)

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

  // CAPITOLI: un titolo (H1) apre un capitolo che comprende tutti i riquadri (nodi) fino al titolo successivo.
  const chapterOfNode = useMemo(() => {
    const map = {};
    documents.forEach((doc) => {
      const body = new DOMParser().parseFromString(doc.content || '', 'text/html').body;
      let chapter = null;
      let idx = 0;
      Array.from(body.children).forEach((block) => {
        if (block.tagName === 'H1') chapter = { key: `${doc.id}:${idx++}`, title: block.textContent.trim() };
        if (!chapter) return;
        // Il riquadro di un nodo porta l'id del nodo in un attributo (data-semantic-id, data-id o id):
        // si registrano tutti i valori degli attributi, poi si cerca per id del nodo.
        block.querySelectorAll('[data-semantic-id], [data-id], .semantic-mark-node, [id^="nodo-"]').forEach((el) => {
          Array.from(el.attributes).forEach((a) => { if (a.value) map[a.value] = chapter; });
        });
      });
    });
    return map;
  }, [documents]);

  // Una cornice per capitolo, sul rettangolo che racchiude i suoi nodi
  const frameNodes = useMemo(() => {
    const groups = new Map();
    nodes.forEach((n) => {
      const ch = chapterOfNode[n.id];
      if (!ch) return;
      const w = n.width || NODE_W;
      const h = n.height || NODE_H;
      const g = groups.get(ch.key) || { title: ch.title, x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
      g.x1 = Math.min(g.x1, n.position.x);
      g.y1 = Math.min(g.y1, n.position.y);
      g.x2 = Math.max(g.x2, n.position.x + w);
      g.y2 = Math.max(g.y2, n.position.y + h);
      groups.set(ch.key, g);
    });
    return [...groups.entries()].map(([key, g]) => {
      const width = g.x2 - g.x1 + FRAME_PAD * 2;
      const height = g.y2 - g.y1 + FRAME_PAD * 2;
      return {
      id: `chapter-${key}`,
      type: 'chapter',
      position: { x: g.x1 - FRAME_PAD, y: g.y1 - FRAME_PAD },
      data: { title: g.title },
      // width/height anche sul nodo: React Flow non lo mostra finché non ne conosce le dimensioni
      width,
      height,
      style: { width, height },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      deletable: false,
      };
    });
  }, [nodes, chapterOfNode]);
  const allNodes = useMemo(() => [...frameNodes, ...nodes], [frameNodes, nodes]);

  // RICERCA: a ogni azione si cercano i nodi che contengono la parola (testo o titolo) e si centra quello corrente
  const searchVersion = useSearchStore((state) => state.version);
  useEffect(() => {
    const { query, step, setCurrentNode } = useSearchStore.getState();
    if (!query.trim()) { setCurrentNode(null); return; }
    const hits = useStore.getState().nodes.filter((n) => findAll(`${n.data?.title || ''}\n${n.data?.label || ''}`, query).length > 0);
    if (!hits.length) { setCurrentNode(null); return; }
    const target = hits[currentIndex(step, hits.length)];
    setCurrentNode(target.id);
    focusNodeInView(target.id);
  }, [searchVersion]);

  const wrapperRef = useRef(null);
  const prevSize = useRef(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });

  // Quando il pannello cambia dimensione (metà pagina <-> tutta pagina) il punto al centro resta al centro.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    viewRefs.wrapper = el;
    prevSize.current = { w: el.clientWidth, h: el.clientHeight };
    setMapSize({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(() => {
      const inst = viewRefs.instance;
      const w = el.clientWidth, h = el.clientHeight;
      setMapSize({ w, h });
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

  // Zoom minimo dinamico: più i nodi sono sparsi (o numerosi), più si può allontanare la vista,
  // così si riesce sempre a vedere tutti i nodi sullo schermo. Mai sopra il minimo normale (0.5).
  const minZoom = useMemo(() => {
    if (!nodes.length || !mapSize.w || !mapSize.h) return 0.5;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    nodes.forEach((n) => {
      x1 = Math.min(x1, n.position.x);
      y1 = Math.min(y1, n.position.y);
      x2 = Math.max(x2, n.position.x + (n.width || NODE_W));
      y2 = Math.max(y2, n.position.y + (n.height || NODE_H));
    });
    const MARGIN = 100; // spazio attorno ai nodi (terminali, cornici dei capitoli, comandi)
    const zx = mapSize.w / (x2 - x1 + MARGIN * 2);
    const zy = mapSize.h / (y2 - y1 + MARGIN * 2);
    return Math.max(0.02, Math.min(0.5, zx, zy));
  }, [nodes, mapSize]);

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  const edges = useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const sizeOf = (n) => ({ w: n.width || NODE_W, h: n.height || NODE_H });

    // 1) lato di attacco di ogni collegamento
    const prepared = rawEdges.map((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      let sHandle = edge.sourceHandle;
      let tHandle = edge.targetHandle;
      if (sourceNode && targetNode) {
        // Si guardano le dimensioni reali dei nodi (non solo l'angolo in alto a sinistra):
        // se i due riquadri sono affiancati (nessuna sovrapposizione in orizzontale) il collegamento esce dai lati,
        // se sono uno sopra l'altro esce da sopra/sotto; se sono in diagonale vince la distanza maggiore.
        const s = sizeOf(sourceNode);
        const t = sizeOf(targetNode);
        const sx1 = sourceNode.position.x, sx2 = sx1 + s.w;
        const sy1 = sourceNode.position.y, sy2 = sy1 + s.h;
        const tx1 = targetNode.position.x, tx2 = tx1 + t.w;
        const ty1 = targetNode.position.y, ty2 = ty1 + t.h;
        const gapX = Math.max(tx1 - sx2, sx1 - tx2); // > 0: separati in orizzontale
        const gapY = Math.max(ty1 - sy2, sy1 - ty2); // > 0: separati in verticale
        const scx = sx1 + s.w / 2, scy = sy1 + s.h / 2;
        const tcx = tx1 + t.w / 2, tcy = ty1 + t.h / 2;
        let horizontal;
        if (gapX > 0 && gapY <= 0) horizontal = true;
        else if (gapY > 0 && gapX <= 0) horizontal = false;
        else if (gapX > 0 && gapY > 0) horizontal = gapX >= gapY;
        else horizontal = Math.abs(tcx - scx) > Math.abs(tcy - scy); // sovrapposti: contano i centri
        if (horizontal) {
          const right = tcx > scx;
          sHandle = right ? 'right' : 'left';
          tHandle = right ? 'left' : 'right';
        } else {
          const down = tcy > scy;
          sHandle = down ? 'bottom' : 'top';
          tHandle = down ? 'top' : 'bottom';
        }
      }
      return { edge, sourceNode, targetNode, sHandle, tHandle, sourceOffset: 0, targetOffset: 0 };
    });

    // 2) più collegamenti sullo stesso lato di un nodo: si distanziano lungo il lato.
    //    Prima quelli che entrano, poi (con un po' di spazio in più) quelli che escono.
    const slots = new Map();
    const addToSlot = (nodeId, side, item) => {
      const key = `${nodeId}:${side}`;
      if (!slots.has(key)) slots.set(key, { nodeId, side, items: [] });
      slots.get(key).items.push(item);
    };
    prepared.forEach((p) => {
      if (!p.sourceNode || !p.targetNode) return;
      addToSlot(p.edge.source, p.sHandle, { p, role: 'out', other: p.targetNode });
      addToSlot(p.edge.target, p.tHandle, { p, role: 'in', other: p.sourceNode });
    });
    slots.forEach(({ nodeId, side, items }) => {
      if (items.length < 2) return;
      const vertical = side === 'left' || side === 'right'; // lato verticale: i collegamenti si dispongono in altezza
      const node = nodeById.get(nodeId);
      const { w, h } = sizeOf(node);
      const sideLength = vertical ? h : w;
      const centerOf = (n) => {
        const s = sizeOf(n);
        return vertical ? n.position.y + s.h / 2 : n.position.x + s.w / 2;
      };
      // Tutti quelli che escono condividono lo stesso punto; tutti quelli che entrano condividono lo stesso punto.
      // Solo se su questo lato ci sono sia entrate sia uscite, i due punti vengono distanziati.
      const ins = items.filter((i) => i.role === 'in');
      const outs = items.filter((i) => i.role === 'out');
      if (!ins.length || !outs.length) return; // un solo gruppo: resta al centro del lato (offset 0)
      const sep = Math.min(18, Math.max(sideLength - 16, 0));
      ins.forEach((it) => { it.p.targetOffset = -sep / 2; });
      outs.forEach((it) => { it.p.sourceOffset = sep / 2; });
    });

    // 3) collegamenti pronti per il disegno
    return prepared.map(({ edge, sourceNode, targetNode, sHandle, tHandle, sourceOffset, targetOffset }) => {
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
          // Colori per l'etichetta: solo quelli dei nodi davvero colorati (altrimenti l'etichetta resta bianca)
          labelFrom: sourceNode?.data?.color || null,
          labelTo: targetNode?.data?.color || null,
          sourceOffset,
          targetOffset,
        },
        style: {
          ...edge.style,
          stroke: isSelected ? '#9ca3af' : ink,
          strokeWidth: 1.5,
        },
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
        nodes={allNodes}
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
        minZoom={minZoom}
        fitView
        attributionPosition="bottom-right"
      >
        <Background color={dotColor} gap={16} size={1} />
        <Controls className="bg-white border-2 border-gray-900 rounded-none !shadow-none" style={{ boxShadow: 'none' }} />
      </ReactFlow>
    </div>
  );
}