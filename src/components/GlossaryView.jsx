import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, Shuffle, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useViewStore } from './SpatialMapView';
import { processImageFile, pickImage } from './imageUtils';
import { useSearchStore, findAll, splitByHits, currentIndex } from './searchStore';

const OFFSET = 6; // di quanto la scheda si solleva al passaggio, come i nodi

// RICERCA: la parola cercata si evidenzia nel titolo della scheda (stesso stile dei nodi)
const Highlight = ({ text, query }) => splitByHits(text, query).map((part, k) => (
  part.hit
    ? <mark key={k} style={{ background: 'var(--ink)', color: 'var(--paper)', padding: 0 }}>{part.text}</mark>
    : <React.Fragment key={k}>{part.text}</React.Fragment>
));

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const lift = (hover) => (hover ? `translate(-${OFFSET}px, -${OFFSET}px)` : 'translate(0, 0)');

// Angoli di selezione, identici a quelli dei nodi
const SelectionBrackets = ({ selected }) => (
  <div className={`absolute -inset-[15px] pointer-events-none transition-opacity duration-150 z-0 ${selected ? 'opacity-100' : 'opacity-0'}`}>
    <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-gray-900" />
    <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-gray-900" />
    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-gray-900" />
    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-gray-900" />
  </div>
);

// Scheda "da nodo": intestazione con la parola, corpo con la definizione (modificabile).
// Si seleziona con un clic (compaiono gli angoli); si elimina con la X della barra strumenti o con Canc.
function TermCard({ term, selected, current, query, onSelect, onChange, onImage }) {
  const [hover, setHover] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const imageMode = useViewStore((state) => state.imageMode);
  const hasImage = !!(term.image || term.imageOriginal);
  const { src, filter } = pickImage(term, imageMode);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { onImage(await processImageFile(file)); } catch (err) { /* immagine non valida */ }
    setInputKey((k) => k + 1);
  };
  const handleRemove = (e) => {
    e.stopPropagation();
    onImage({ image: null, imageOriginal: null });
  };

  return (
    <div
      className="relative group"
      data-term-id={term.id}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <SelectionBrackets selected={selected || current} />
      <div
        className="relative bg-white border-2 border-gray-900 rounded-md flex flex-col"
        style={{
          transform: lift(hover),
          boxShadow: hover ? `${OFFSET}px ${OFFSET}px 0 0 var(--ink)` : '0 0 0 0 var(--ink)',
          transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b-2 border-gray-900 px-3 py-2 rounded-t-[4px]">
          <h3 className="m-0 min-w-0 text-xs font-bold uppercase tracking-wider text-gray-900 break-words"><Highlight text={term.word} query={query} /></h3>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
          {hasImage && (
            <div className="relative border-2 border-gray-900 bg-white">
              <img src={src} alt="" draggable={false} className="block w-full h-auto" style={{ filter }} />
              <button
                onClick={handleRemove}
                onMouseDown={(e) => e.stopPropagation()}
                title="Rimuovi immagine"
                className="absolute top-1 right-1 p-0.5 bg-white border-2 border-gray-900 text-gray-900 hover:text-red-600 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          )}
          <textarea
            value={term.definition}
            rows={1}
            /* autolivellamento istantaneo */
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Redigi la definizione qui..."
            className="w-full outline-none resize-none font-serif text-sm text-gray-700 leading-relaxed bg-transparent break-words overflow-hidden"
          />
          <label
            onMouseDown={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 mt-1"
          >
            <span>{hasImage ? '+ Sostituisci Immagine' : '+ Allega Immagine'}</span>
            <input key={`add-${inputKey}`} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </div>
    </div>
  );
}

const HOVER_LIFT = 6;     // al passaggio del mouse tutto il gruppo si solleva di 6px (come i nodi)
const PERSPECTIVE = 850;
const FLIP_MS = 625;      // durata dell'intera animazione (15 intervalli a 24fps, ricavati dal video)
const SHADOW_Z = -23;     // l'ombra sta un po' dietro la scheda
const SHADOW_OFFSET = 6;  // distanza visibile dell'ombra a riposo: identica a quella dei nodi / modalità non studio
// La prospettiva rimpicciolisce ciò che sta a z negativo: compensiamo (scala e spostamento)
// così l'ombra appare esattamente di SHADOW_OFFSET px, della stessa dimensione della scheda.
const PERSP_SCALE = PERSPECTIVE / (PERSPECTIVE - SHADOW_Z);
const SHADOW_COMP = `scale(${1 / PERSP_SCALE})`;
const SHADOW_PX = SHADOW_OFFSET / PERSP_SCALE;

// Keyframe ricavati dal video, un valore ogni 1/24 s.
// [ avvicinamento scheda (px), rotazione ombra (°), spostamento ombra x (px), y (px), inclinazione ombra (°) ]
// (la rotazione della scheda non è qui: viene dalle keyframe ROT_KEYS qui sotto)
// L'ombra è un piano nero a sé: ruota con un angolo suo (parte in ritardo, poi è quasi lineare),
// si allontana dalla scheda mentre gira (fino a ~58px), si inclina a metà giro e rientra quando la scheda si posa.
const FLIP_RAW = [
  [0,   0,    SHADOW_PX, SHADOW_PX, 0],
  [6,   11.5, 14,   12,   0],
  [32,  29,   25.5, 16.5, -1.5],
  [56,  52,   27,   23,   -2.5],
  [76,  70,   34.5, 27,   -5.5],
  [92,  120,  57.8, 36.6, -2.5],
  [100, 134,  55.5, 33.5, -1.5],
  [98,  171,  33.9, 30.5, 0],
  [96,  181,  36,   30,   0],
  [66,  180,  30,   25,   0],
  [30,  180,  19,   15.8, 0],
  [0,   180,  SHADOW_PX, SHADOW_PX, 0],
];

// Rotazione della scheda: le 4 keyframe della scena Blender, [frame, gradi].
//  1 = riposo · 6 = inizia a ruotare · 12 = punto più alto, rotazione finita · 18 = torna a terra
// Per cambiare la rotazione basta ritoccare questi valori (es. il 90 del frame 6).
const ROT_KEYS = [[1, 0], [6, 90], [12, 180], [18, 180]];

// Interpolazione "Bezier" come in Blender: curva liscia che passa per le keyframe,
// con ease-in all'inizio, ease-out alla fine e senza sforare (nessun overshoot oltre 180°).
const rotationAt = (f) => {
  const n = ROT_KEYS.length;
  const x = ROT_KEYS.map((k) => k[0]);
  const y = ROT_KEYS.map((k) => k[1]);
  const d = Array.from({ length: n - 1 }, (_, i) => (y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  const m = Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let i = 0;
  while (i < n - 2 && f > x[i + 1]) i++;
  const h = x[i + 1] - x[i];
  const t = (f - x[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
};

// Un frame per riga (24fps): rotazione scheda dalle keyframe, il resto dalla tabella estratta dal video.
// Formato finale: [rotazione scheda, avvicinamento, rotazione ombra, x ombra, y ombra, inclinazione ombra]
// I frame 6 e 7 del video (scheda di taglio, ombra anomala) sono stati tolti: la rotazione
// si valuta quindi sui numeri di frame originali, saltando 6 e 7, e l'animazione dura due frame in meno.
const FLIP_FRAME_NUMBERS = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const FLIP_FRAMES = FLIP_RAW.map((row, i) => [rotationAt(FLIP_FRAME_NUMBERS[i]), ...row]);

const hiddenBack = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
const SHADOW_REST = `translate3d(${SHADOW_PX}px, ${SHADOW_PX}px, ${SHADOW_Z}px) rotateY(0deg) skewY(0deg) ${SHADOW_COMP}`;
// Ombra "nascosta": stessa posizione della scheda, quindi completamente coperta da essa.
// Al passaggio scivola da qui a SHADOW_REST, così compare in modo graduale come sui nodi.
const SHADOW_HIDDEN = `translate3d(0px, 0px, ${SHADOW_Z}px) rotateY(0deg) skewY(0deg) ${SHADOW_COMP}`;

// Flashcard: davanti la parola, dietro la definizione.
// Al clic la scheda si avvicina, gira sul proprio asse e si posa; l'ombra è un piano separato
// che segue una traiettoria sua (vedi FLIP_FRAMES), come nel video di riferimento.
function FlipCard({ term, flipped, onFlip, current, query }) {
  const imageMode = useViewStore((state) => state.imageMode);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef(null);
  const shadowRef = useRef(null);
  const anims = useRef([]);
  useEffect(() => () => anims.current.forEach((a) => a.cancel()), []);

  const base = flipped ? 180 : 0;

  const turn = () => {
    const card = cardRef.current;
    const shadow = shadowRef.current;
    if (busy || !card || !shadow || !card.animate) { if (!busy) onFlip(); return; }
    setBusy(true);
    const last = FLIP_FRAMES.length - 1;
    const cardKf = FLIP_FRAMES.map(([tc, z], i) => ({
      offset: i / last,
      transform: `translate3d(0, 0, ${z}px) rotateY(${base + tc}deg)`,
    }));
    const shadowKf = FLIP_FRAMES.map(([, , ts, tx, ty, sk], i) => ({
      offset: i / last,
      transform: `translate3d(${tx}px, ${ty}px, ${SHADOW_Z}px) rotateY(${ts}deg) skewY(${sk}deg) ${SHADOW_COMP}`,
    }));
    const opts = { duration: FLIP_MS, easing: 'linear', fill: 'forwards' };
    const a1 = card.animate(cardKf, opts);
    const a2 = shadow.animate(shadowKf, opts);
    anims.current = [a1, a2];
    a1.onfinish = () => {
      onFlip(); // la faccia a riposo coincide con l'ultimo keyframe (ruotata di 180° rispetto a prima)
      requestAnimationFrame(() => { a1.cancel(); a2.cancel(); setBusy(false); });
    };
  };

  // Il retro (intestazione + definizione) ha la stessa struttura di TermCard e decide l'altezza
  // (tra un minimo e un massimo). Il fronte è sovrapposto (absolute) e si adatta senza influenzarla.
  const renderFace = (back, content) => (
    <div
      className={back ? 'col-start-1 row-start-1 relative flex flex-col' : 'col-start-1 row-start-1 absolute inset-0 flex flex-col'}
      style={{ ...hiddenBack, ...(back ? { transform: 'rotateY(180deg)' } : null) }}
    >
      {/* altezza minima e massima: se la definizione è più lunga, scorre dentro la scheda */}
      <div className="relative flex-1 min-h-[150px] max-h-[260px] flex flex-col bg-white border-2 border-gray-900 rounded-md">{content}</div>
    </div>
  );

  const showShadow = hover || busy;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={turn}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); turn(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative min-w-0 cursor-pointer select-none outline-none"
      data-term-id={term.id}
      style={{ zIndex: busy ? 20 : hover ? 10 : 0 }}
      title="Clicca per girare"
    >
      {/* risultato corrente della ricerca: stessi angoli di selezione dei nodi */}
      <SelectionBrackets selected={current} />
      {/* gruppo: si solleva al passaggio del mouse (scheda e ombra insieme) */}
      <div
        className="relative"
        style={{
          transform: hover || busy ? `translate(-${HOVER_LIFT}px, -${HOVER_LIFT}px)` : 'translate(0, 0)',
          transition: 'transform 0.2s ease-out',
        }}
      >
        {/* livello dell'ombra: prospettiva propria, sempre sotto la scheda (nessuna intersezione 3D) */}
        <div className="absolute inset-0 pointer-events-none" style={{ perspective: PERSPECTIVE }}>
          {/* piano nero separato, visibile da entrambi i lati */}
          <div
            ref={shadowRef}
            className="absolute inset-0 rounded-md bg-gray-900"
            style={{
              transform: showShadow ? SHADOW_REST : SHADOW_HIDDEN,
              transition: 'transform 0.2s ease-out',
            }}
          />
        </div>
        {/* livello della scheda */}
        <div className="relative" style={{ perspective: PERSPECTIVE }}>
          <div
            ref={cardRef}
            className="grid grid-cols-[minmax(0,1fr)]"
            style={{ transformStyle: 'preserve-3d', transform: `translate3d(0, 0, 0px) rotateY(${base}deg)` }}
          >
            {/* Fronte: la parola */}
            {renderFace(false, (
              <div className="flex-1 flex items-center justify-center px-4 py-2 text-center overflow-hidden">
                <h3 className="m-0 font-bold text-xl text-gray-900 min-w-0" style={{ overflowWrap: 'anywhere' }}><Highlight text={term.word} query={query} /></h3>
              </div>
            ))}

            {/* Retro: la definizione */}
            {renderFace(true, (
              <>
                {/* stessa altezza dell'intestazione di TermCard (42px) */}
                <div className="shrink-0 min-h-[42px] flex items-center justify-between gap-2 border-b-2 border-gray-900 px-3 py-2 rounded-t-[4px]">
                  <h3 className="m-0 min-w-0 text-xs font-bold uppercase tracking-wider text-gray-900" style={{ overflowWrap: 'anywhere' }}><Highlight text={term.word} query={query} /></h3>
                </div>
                <div
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 font-serif text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {(term.image || term.imageOriginal) && (
                    <img
                      src={pickImage(term, imageMode).src}
                      alt=""
                      draggable={false}
                      className="block w-full h-auto border-2 border-gray-900 mb-3"
                      style={{ filter: pickImage(term, imageMode).filter }}
                    />
                  )}
                  {term.definition || (!(term.image || term.imageOriginal) && <span className="italic text-gray-400">Nessuna definizione</span>)}
                </div>
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlossaryView() {
  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];
  const updateGlossaryDefinition = useStore((state) => state.updateGlossaryDefinition);
  const updateGlossaryTerm = useStore((state) => state.updateGlossaryTerm);
  const selectedTermId = useStore((state) => state.selectedTermId);
  const setSelectedTermId = useStore((state) => state.setSelectedTermId);
  const [toolbarContainer, setToolbarContainer] = useState(null);
  useEffect(() => { setToolbarContainer(document.getElementById('global-toolbar-container')); }, []);

  const [study, setStudy] = useState(false);
  const [order, setOrder] = useState(null); // null = ordine alfabetico, altrimenti elenco di id mescolato
  const [flipped, setFlipped] = useState({}); // id -> scheda girata

  const alpha = useMemo(() => [...glossaryTerms].sort((a, b) => a.word.localeCompare(b.word)), [glossaryTerms]);
  const terms = useMemo(() => {
    if (!order) return alpha;
    const byId = new Map(alpha.map((t) => [t.id, t]));
    const known = new Set(order);
    return [...order.filter((id) => byId.has(id)).map((id) => byId.get(id)), ...alpha.filter((t) => !known.has(t.id))];
  }, [alpha, order]);

  const toggleStudy = () => { setStudy((s) => !s); setOrder(null); setFlipped({}); setSelectedTermId(null); };

  // RICERCA: a ogni azione (nuova parola, Invio, chiusura) si cercano le voci il cui titolo contiene la parola;
  // la voce corrente prende gli angoli di selezione e il glossario scorre fino a lei (vale anche in modalità studio)
  const searchQuery = useSearchStore((state) => state.query);
  const searchVersion = useSearchStore((state) => state.version);
  const [currentTermId, setCurrentTermId] = useState(null);
  const scrollRef = useRef(null);
  const termsRef = useRef(terms);
  termsRef.current = terms;
  useEffect(() => {
    const { query, step } = useSearchStore.getState();
    if (!query.trim()) { setCurrentTermId(null); return; }
    const hits = termsRef.current.filter((t) => findAll(t.word, query).length > 0);
    if (!hits.length) { setCurrentTermId(null); return; }
    const target = hits[currentIndex(step, hits.length)];
    setCurrentTermId(target.id);
    requestAnimationFrame(() => {
      const box = scrollRef.current;
      const el = box?.querySelector(`[data-term-id="${target.id}"]`);
      if (!box || !el) return;
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      box.scrollTo({ top: box.scrollTop + r.top - b.top - (b.height - r.height) / 2, behavior: 'smooth' });
    });
  }, [searchVersion]);

  // Canc / Backspace elimina la scheda selezionata (come per i nodi), tranne mentre si scrive in un campo
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      useStore.getState().removeSelectedTerm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const shuffle = () => { setOrder(shuffled(alpha.map((t) => t.id))); setFlipped({}); };

  const canShuffle = study && terms.length > 1;
  const toolBtn = 'flex items-center justify-center px-2 py-1 border-2 text-[9px] font-bold uppercase tracking-widest transition-all';

  // Pulsanti nella barra degli strumenti (compaiono finché il glossario è aperto)
  const toolbar = (
    <div className="flex items-center gap-0.5 ml-auto shrink-0 pl-2">
      <div className="w-px h-5 bg-gray-400 mx-1.5 shrink-0" />
      <button
        onClick={toggleStudy}
        className={`${toolBtn} ${study ? 'bg-gray-900 text-white border-gray-900' : 'border-transparent text-gray-900 hover:border-gray-900'}`}
        title={study ? 'Esci dalla modalità studio' : 'Modalità studio: le voci diventano flashcard da girare'}
      >
        <GraduationCap size={16} />
      </button>
      <button
        onClick={shuffle}
        disabled={!canShuffle}
        className={`${toolBtn} border-transparent text-gray-900 ${canShuffle ? 'hover:border-gray-900 active:bg-gray-900 active:text-white' : 'opacity-30 cursor-not-allowed'}`}
        title={study ? 'Mescola le schede' : 'Attiva la modalità studio per mescolare'}
      >
        <Shuffle size={16} />
      </button>
    </div>
  );

  return (
    <div
      ref={scrollRef}
      className="w-full h-full bg-white flex flex-col overflow-y-auto px-6 pt-10 pb-8"
      onMouseDown={() => setSelectedTermId(null)}
    >
      {toolbarContainer && createPortal(toolbar, toolbarContainer)}

      {terms.length === 0 ? (
        <p className="font-mono text-gray-500">Nessun termine presente. Estrapola dal testo.</p>
      ) : (
        <div className="grid gap-6 w-full items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))' }}>
          {terms.map((term) => (study ? (
            <FlipCard
              key={term.id}
              term={term}
              flipped={!!flipped[term.id]}
              onFlip={() => setFlipped((f) => ({ ...f, [term.id]: !f[term.id] }))}
              current={currentTermId === term.id}
              query={searchQuery}
            />
          ) : (
            <TermCard
              key={term.id}
              term={term}
              selected={selectedTermId === term.id}
              current={currentTermId === term.id}
              query={searchQuery}
              onSelect={() => setSelectedTermId(term.id)}
              onChange={(v) => updateGlossaryDefinition(term.id, v)}
              onImage={(patch) => updateGlossaryTerm(term.id, patch)}
            />
          )))}
        </div>
      )}
    </div>
  );
}
