import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useViewStore } from './SpatialMapView';
import { pickImage } from './imageUtils';
import { buildTextsHtml, buildMapHtml, buildCardsHtml, CARD_LAYOUTS } from './exportPdf';

// ==========================================
// ESPORTA IN PDF: finestra con le tre voci (Testi, Mappa, Flashcard), ognuna con la sua selezione,
// le sue opzioni e un'anteprima. Stesso stile del pannello di personalizzazione.
// Il PDF si ottiene dalla finestra di stampa del browser ("Salva come PDF"): una per ogni voce scelta.
// ==========================================

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Stampa una pagina HTML (nascosta in un iframe) e restituisce quando la finestra di stampa è stata aperta.
async function printHtml(html, title) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  await new Promise((resolve) => { iframe.onload = resolve; });
  const doc = iframe.contentDocument;
  await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  try { if (doc.fonts?.ready) await doc.fonts.ready; } catch (e) { /* niente */ }
  const prevTitle = document.title;
  document.title = title; // il nome proposto per il file arriva dal titolo
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  await delay(600);
  document.title = prevTitle;
  setTimeout(() => iframe.remove(), 60000);
}

const Check = ({ checked, onChange, disabled, children, className = '' }) => (
  <label className={`flex items-center gap-2 text-xs font-semibold text-gray-900 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 accent-gray-900 shrink-0" />
    <span className="min-w-0">{children}</span>
  </label>
);

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-xs font-semibold text-gray-900">
    <span className="shrink-0">{label}</span>
    <span className="flex items-center gap-1 min-w-0">{children}</span>
  </div>
);

// Scelta tra poche voci (pulsanti squadrati, quello attivo è nero)
const Seg = ({ value, options, onChange }) => (
  <span className="flex border-2 border-gray-900">
    {options.map((o, i) => (
      <button
        key={String(o.value)}
        type="button"
        onClick={() => onChange(o.value)}
        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${i ? 'border-l-2 border-gray-900' : ''} ${value === o.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`}
      >
        {o.label}
      </button>
    ))}
  </span>
);

const SectionTitle = ({ children }) => (
  <div className="mt-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-gray-500">{children}</div>
);

// Elenco dei testi da includere
function DocPicker({ documents, value, onChange, countOf }) {
  const toggle = (id, on) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <div className="flex flex-col gap-1.5 py-1">
      {documents.map((d) => {
        const n = countOf ? countOf(d.id) : null;
        return (
          <Check key={d.id} checked={value.includes(d.id)} onChange={(on) => toggle(d.id, on)} disabled={countOf && n === 0}>
            {d.name}{countOf ? <span className="text-gray-400 font-normal"> · {n}</span> : null}
          </Check>
        );
      })}
    </div>
  );
}

const ITEMS = [
  { key: 'texts', label: 'Testi', sub: 'A4 verticale' },
  { key: 'map', label: 'Mappa', sub: 'A4 orizzontale' },
  { key: 'cards', label: 'Flashcard', sub: 'Aperte o da ritagliare' },
];

export default function ExportDialog({ onClose }) {
  const documents = useStore((s) => s.documents);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const glossaryTerms = useStore((s) => s.glossaryTerms) || [];
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const viewMode = useViewStore((s) => s.viewMode);
  const imageMode = useViewStore((s) => s.imageMode);

  const project = projects.find((p) => p.id === activeProjectId);
  const allIds = useMemo(() => documents.map((d) => d.id), [documents]);
  const nodeCount = (id) => nodes.filter((n) => n.data?.docId === id).length;
  const termCount = (id) => glossaryTerms.filter((t) => t.docId === id).length;
  const hasNodes = nodes.length > 0;
  const hasTerms = glossaryTerms.length > 0;

  const [on, setOn] = useState({ texts: true, map: hasNodes, cards: hasTerms });
  const [focus, setFocus] = useState('texts');
  const [opts, setOpts] = useState({
    texts: { docIds: allIds, boxes: true, fontPt: 11, marginMm: 20, docNames: true, projectTitle: true },
    map: { docIds: allIds, scope: 'all', vista: viewMode, images: true, frames: true, dots: false, caption: true },
    cards: { docIds: allIds, layout: 'cutout', perPage: 12, cols: 2, images: true, mirror: true, backPt: 9 },
  });
  const set = (key, patch) => setOpts((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
  const [busy, setBusy] = useState(false);

  const imageOf = (obj) => pickImage(obj, imageMode);

  const build = (key) => {
    if (key === 'texts') return buildTextsHtml({ project, documents, opts: opts.texts });
    if (key === 'map') return buildMapHtml({ project, documents, nodes, edges, opts: opts.map, currentViewMode: viewMode, imageOf });
    return buildCardsHtml({ project, terms: glossaryTerms, opts: opts.cards, imageOf });
  };

  // Anteprima della voce in primo piano
  const built = useMemo(() => build(focus), [focus, opts, documents, nodes, edges, glossaryTerms, project, viewMode, imageMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const scale = box.w ? Math.min(1, box.w / built.previewW) : 1;

  // Finestra spostabile: si trascina dalla barra del titolo e resta sempre almeno in parte visibile.
  const dialogRef = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const startMove = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button')) return; // il pulsante di chiusura resta un normale pulsante
    const el = dialogRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const sx = e.clientX; const sy = e.clientY;
    const ox = pos.x; const oy = pos.y;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const minDx = 80 - r.width - r.left; const maxDx = window.innerWidth - 80 - r.left;
    const minDy = -r.top; const maxDy = window.innerHeight - 40 - r.top;
    setMoving(true);
    const move = (ev) => setPos({ x: ox + clamp(ev.clientX - sx, minDx, maxDx), y: oy + clamp(ev.clientY - sy, minDy, maxDy) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setMoving(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const chosen = ITEMS.filter((it) => on[it.key]);
  const doExport = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      for (const it of chosen) {
        const b = build(it.key);
        await printHtml(b.html, b.title);
      }
    } finally { setBusy(false); }
  };

  const disabledItem = { texts: false, map: !hasNodes, cards: !hasTerms };
  const subOf = (it) => (disabledItem[it.key] ? (it.key === 'map' ? 'Nessun nodo' : 'Nessun termine') : it.sub);

  const t = opts.texts; const m = opts.map; const c = opts.cards;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      {/* Nessun velo, come nel pannello di personalizzazione */}
      <div className="absolute inset-0" onMouseDown={() => { if (!busy) onClose(); }} />
      <div
        ref={dialogRef}
        className="relative w-[980px] h-[620px] max-w-[96vw] max-h-[92vh] bg-white border-2 border-gray-900 flex flex-col"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      >
        <div
          onPointerDown={startMove}
          className={`flex items-center gap-2 px-3 py-2 border-b-2 border-gray-900 shrink-0 select-none ${moving ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ touchAction: 'none' }}
          title="Trascina per spostare la finestra"
        >
          <div className="flex-1 min-w-0 text-xs font-black uppercase tracking-wider text-gray-900">Esporta in PDF</div>
          <button onClick={onClose} className="p-1 text-gray-900 hover:bg-gray-900 hover:text-white" title="Chiudi"><X size={14} strokeWidth={3} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Le tre voci, ognuna con la sua selezione */}
          <div className="w-[210px] shrink-0 border-r-2 border-gray-900 flex flex-col">
            {ITEMS.map((it) => (
              <div
                key={it.key}
                onClick={() => setFocus(it.key)}
                className={`flex items-start gap-2 px-3 py-3 border-b-2 border-gray-900 cursor-pointer ${focus === it.key ? 'bg-gray-900 text-white' : 'text-gray-900 hover:bg-gray-100'}`}
              >
                <input
                  type="checkbox"
                  checked={on[it.key] && !disabledItem[it.key]}
                  disabled={disabledItem[it.key]}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setOn((o) => ({ ...o, [it.key]: e.target.checked }))}
                  className="w-4 h-4 mt-0.5 accent-gray-900 shrink-0"
                  title="Includi nell'esportazione"
                />
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wider">{it.label}</div>
                  <div className={`text-[10px] font-semibold ${focus === it.key ? 'text-gray-300' : 'text-gray-500'}`}>{subOf(it)}</div>
                </div>
              </div>
            ))}
            <div className="flex-1" />
          </div>

          {/* Opzioni della voce selezionata */}
          <div className="w-[270px] shrink-0 border-r-2 border-gray-900 overflow-y-auto px-4 pb-3">
            {focus === 'texts' && (
              <>
                <SectionTitle>Testi da includere</SectionTitle>
                <DocPicker documents={documents} value={t.docIds} onChange={(v) => set('texts', { docIds: v })} />
                <SectionTitle>Aspetto</SectionTitle>
                <Check checked={t.boxes} onChange={(v) => set('texts', { boxes: v })} className="py-1">Mostra i riquadri dei nodi</Check>
                <Check checked={t.docNames} onChange={(v) => set('texts', { docNames: v })} className="py-1">Nome del testo in cima</Check>
                <Check checked={t.projectTitle} onChange={(v) => set('texts', { projectTitle: v })} className="py-1">Nome del quaderno all'inizio</Check>
                <Row label="Corpo">
                  <Seg value={t.fontPt} onChange={(v) => set('texts', { fontPt: v })} options={[{ value: 10, label: '10' }, { value: 11, label: '11' }, { value: 12, label: '12' }, { value: 14, label: '14' }]} />
                </Row>
                <Row label="Margini">
                  <Seg value={t.marginMm} onChange={(v) => set('texts', { marginMm: v })} options={[{ value: 12, label: 'Stretti' }, { value: 20, label: 'Medi' }, { value: 28, label: 'Larghi' }]} />
                </Row>
              </>
            )}

            {focus === 'map' && (
              <>
                <SectionTitle>Testi da includere (nodi)</SectionTitle>
                <DocPicker documents={documents} value={m.docIds} onChange={(v) => set('map', { docIds: v })} countOf={nodeCount} />
                <SectionTitle>Pagine</SectionTitle>
                <Row label="Mappa">
                  <Seg value={m.scope} onChange={(v) => set('map', { scope: v })} options={[{ value: 'all', label: 'Unica' }, { value: 'perDoc', label: 'Una per testo' }]} />
                </Row>
                <SectionTitle>Aspetto</SectionTitle>
                <Row label="Nodi">
                  <Seg value={m.vista} onChange={(v) => set('map', { vista: v })} options={[{ value: 'completa', label: 'Completa' }, { value: 'sintetica', label: 'Sintetica' }]} />
                </Row>
                <Check checked={m.frames} onChange={(v) => set('map', { frames: v })} className="py-1">Cornici dei capitoli</Check>
                <Check checked={m.dots} onChange={(v) => set('map', { dots: v })} className="py-1">Sfondo a puntini</Check>
                <Check checked={m.caption} onChange={(v) => set('map', { caption: v })} className="py-1">Titolo in alto</Check>
                <div className="mt-2 text-[10px] leading-snug font-semibold text-gray-500">La mappa viene adattata alla pagina: tutti i nodi stanno su un solo foglio A4 orizzontale.</div>
              </>
            )}

            {focus === 'cards' && (
              <>
                <SectionTitle>Testi da includere (termini)</SectionTitle>
                <DocPicker documents={documents} value={c.docIds} onChange={(v) => set('cards', { docIds: v })} countOf={termCount} />
                <SectionTitle>Formato</SectionTitle>
                <Row label="Schede">
                  <Seg value={c.layout} onChange={(v) => set('cards', { layout: v })} options={[{ value: 'open', label: 'Aperte' }, { value: 'cutout', label: 'Fronte/retro' }]} />
                </Row>
                {c.layout === 'open' ? (
                  <Row label="Colonne">
                    <Seg value={c.cols} onChange={(v) => set('cards', { cols: v })} options={[{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]} />
                  </Row>
                ) : (
                  <>
                    <Check checked={c.mirror} onChange={(v) => set('cards', { mirror: v })} className="py-1">Retro specchiato (stampa fronte/retro)</Check>
                    <Row label="Testo retro">
                      <Seg value={c.backPt} onChange={(v) => set('cards', { backPt: v })} options={[{ value: 8, label: '8' }, { value: 9, label: '9' }, { value: 10, label: '10' }, { value: 11, label: '11' }]} />
                    </Row>
                    <div className="py-1.5 text-xs font-semibold text-gray-900">
                      <div className="mb-1">Schede per foglio</div>
                      <Seg value={c.perPage} onChange={(v) => set('cards', { perPage: v })} options={Object.keys(CARD_LAYOUTS).map((k) => ({ value: Number(k), label: k }))} />
                    </div>
                    <div className="mt-1 text-[10px] leading-snug font-semibold text-gray-500">{c.perPage} schede per foglio ({CARD_LAYOUTS[c.perPage].cols} × {CARD_LAYOUTS[c.perPage].rows}), con linee tratteggiate da ritagliare. Prima il foglio dei fronti, poi quello dei retro: stampa fronte/retro con rilegatura sul lato lungo.</div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Anteprima */}
          <div className="flex-1 min-w-0 flex flex-col bg-gray-200">
            <div className="px-3 py-1.5 border-b-2 border-gray-900 bg-white text-[9px] font-bold uppercase tracking-widest text-gray-500 shrink-0">
              Anteprima · {ITEMS.find((i) => i.key === focus).label}
            </div>
            <div ref={boxRef} className="flex-1 min-h-0 overflow-hidden relative">
              <iframe
                key={focus}
                title="Anteprima"
                srcDoc={built.html}
                style={{
                  position: 'absolute', left: 0, top: 0, border: 0,
                  width: built.previewW, height: scale ? box.h / scale : box.h,
                  transform: `scale(${scale})`, transformOrigin: '0 0',
                  pointerEvents: moving ? 'none' : 'auto', // altrimenti l'anteprima "ruba" il mouse durante lo spostamento
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t-2 border-gray-900 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1 border-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest text-gray-900 hover:bg-gray-900 hover:text-white">Annulla</button>
            <button
              onClick={doExport}
              disabled={!chosen.length || busy}
              className={`px-3 py-1 border-2 border-gray-900 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest ${!chosen.length || busy ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {busy ? 'Apro la stampa…' : 'Esporta PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
