import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mark, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { SemanticMark } from './SemanticMark';
import { useStore } from '../store/useStore';
import { getNewNodePosition } from './SpatialMapView';
import { readableTextColor } from './nodeColors';
import { useNodeColors } from './useThemeColors';
import FontPicker, { SizePicker } from './FontPicker';
import { useSearchStore, findAll, currentIndex } from './searchStore';
import RecordingControl, { recordingBus } from './RecordingControl';
import { Type, PenTool, Square, X, Book, Undo, Redo, PaintBucket, List, Quote, Search } from 'lucide-react';

const NoteMark = Mark.create({
  name: 'noteMark',
  parseHTML() { return [{ tag: 'span[data-note]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-note': '', class: 'text-gray-400' }), 0]; },
});

const GlossaryMark = Mark.create({
  name: 'glossaryMark',
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => { if (!attributes.id) return {}; return { 'data-id': attributes.id }; },
      },
    }
  },
  parseHTML() { return [{ tag: 'span[data-glossary]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-glossary': '', class: 'font-bold' }), 0]; },
});

// Il frammento di testo legato a un nodo porta con sé il colore del nodo.
// Il colore è un attributo della mark (data-color + variabili CSS): il CSS lo applica allo sfondo.
// Il colore "sorgente" resta in node.data.color; un effetto qui sotto tiene allineate le due cose.
const ColoredSemanticMark = SemanticMark.extend({
  // Il riquadro avvolge grassetto, corsivo, evidenziatore ecc. (che hanno priorità 100): così resta un unico span
  // e il contorno non si spezza. textStyle (priorità 10000) resta comunque più esterno.
  priority: 1000,
  // Più riquadri possono sovrapporsi sullo stesso testo (un nodo dentro un altro): creare un nodo su una parola
  // già dentro un riquadro non spezza quel riquadro e la parola resta anche nel suo nodo.
  excludes: '',
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      color: {
        default: null,
        parseHTML: element => element.getAttribute('data-color'),
        renderHTML: attributes => {
          if (!attributes.color) return {};
          return {
            'data-color': attributes.color,
            style: `--sem-color:${attributes.color};--sem-text:${readableTextColor(attributes.color)};`,
          };
        },
      },
    };
  },
  // Il riquadro è fatto di due strati: lo span esterno disegna il contorno (inchiostro), quello interno (.sem-fill)
  // il riempimento. Tutti i contorni vengono dipinti prima di tutti i riempimenti, così quando le righe
  // di un riquadro si sovrappongono i bordi si fondono in un'unica sagoma (niente "pezzettini" di bordo in mezzo).
  renderHTML(props) {
    const base = this.parent ? this.parent(props) : ['span', props.HTMLAttributes, 0];
    const tag = Array.isArray(base) && typeof base[0] === 'string' ? base[0] : 'span';
    const raw = Array.isArray(base) && base[1] && typeof base[1] === 'object' && !Array.isArray(base[1]) ? base[1] : props.HTMLAttributes;
    const attrs = String(raw.class || '').includes('semantic-mark-node')
      ? raw
      : { ...raw, class: `${raw.class ? `${raw.class} ` : ''}semantic-mark-node` };
    return [tag, attrs, ['span', { class: 'sem-fill' }, 0]];
  },
});

// Font e dimensione del testo (stile TextEdit)
const TextStyleMark = Mark.create({
  name: 'textStyle',
  // Priorità alta = questa mark sta all'esterno delle altre: lo span con font e dimensione avvolge il riquadro,
  // così il riquadro (misurato in em) prende la dimensione del testo che contiene e resta proporzionato a qualsiasi corpo.
  priority: 10000,
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: element => (element.style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim() || null,
        renderHTML: attributes => (attributes.fontFamily ? { style: `font-family:"${attributes.fontFamily}";` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize || null,
        renderHTML: attributes => (attributes.fontSize ? { style: `font-size:${attributes.fontSize};` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span', consuming: false, getAttrs: element => ((element.style.fontFamily || element.style.fontSize) ? {} : false) }];
  },
  renderHTML({ HTMLAttributes }) { return ['span', HTMLAttributes, 0]; },
});

// Evidenziatore con colore a scelta
const HighlightMark = Mark.create({
  name: 'highlightMark',
  addAttributes() {
    return {
      color: {
        default: '#ffd43b',
        parseHTML: element => element.getAttribute('data-hl'),
        renderHTML: attributes => ({ 'data-hl': attributes.color, style: `background-color:${attributes.color};` }),
      },
    };
  },
  parseHTML() { return [{ tag: 'mark[data-hl]' }]; },
  renderHTML({ HTMLAttributes }) { return ['mark', HTMLAttributes, 0]; },
});


// Un riquadro (nodo) può essere fatto di più parti separate del testo. Per ogni nodo si raccolgono i suoi frammenti:
// pezzi di testo contigui dentro lo stesso paragrafo ({ from, to, text }). Pezzi che il testo ha solo spezzato
// per via di altri stili (evidenziatore, grassetto...) restano un unico frammento.
// Il testo a questa posizione sta dentro una citazione (blockquote)?
function isInQuote(doc, pos) {
  const $p = doc.resolve(pos);
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'blockquote') return true;
  return false;
}

function collectSegments(doc) {
  const segs = new Map(); // id del nodo -> [frammenti]
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    // Un pezzo di testo può stare in più riquadri insieme (uno dentro l'altro)
    node.marks.forEach((sm) => {
      if (sm.type.name !== 'semanticMark') return;
      if (!segs.has(sm.attrs.id)) segs.set(sm.attrs.id, []);
      const list = segs.get(sm.attrs.id);
      const last = list[list.length - 1];
      if (last && last.to === pos) { last.to = pos + node.nodeSize; last.text += node.text; }
      else list.push({ from: pos, to: pos + node.nodeSize, text: node.text, quote: isInQuote(doc, pos) });
    });
  });
  return segs;
}

// Il testo di un nodo nella mappa: un frammento per riga.
const SEGMENT_SEPARATOR = '\n';

// Legge dal documento i riquadri (nodi) e i termini di glossario presenti, con il testo di ogni riquadro.
function scanMarks(editor) {
  const sem = new Set(); const gl = new Set(); const texts = {}; const quotes = {};
  const segs = collectSegments(editor.state.doc);
  // quotes: per ogni nodo, i frammenti che stanno dentro una citazione (il nodo li disegna con lo stile della citazione)
  segs.forEach((list, id) => { sem.add(id); texts[id] = list.map((s) => s.text).join(SEGMENT_SEPARATOR); quotes[id] = list.filter((s) => s.quote).map((s) => s.text); });
  editor.state.doc.descendants((node) => {
    if (!node.marks) return;
    const gm = node.marks.find((m) => m.type.name === 'glossaryMark');
    if (gm) gl.add(gm.attrs.id);
  });
  return { sem, gl, texts, quotes };
}

// Scrive nei dati dei nodi quali loro frammenti sono citazioni (solo se è cambiato qualcosa)
function syncNodeQuotes(quotes) {
  const st = useStore.getState();
  st.nodes.forEach((n) => {
    if (!(n.id in quotes)) return;
    const next = quotes[n.id];
    const cur = n.data?.quotes || [];
    if (JSON.stringify(cur) !== JSON.stringify(next)) st.updateNodeData(n.id, { quotes: next });
  });
}

// RICERCA NEL TESTO: tutte le occorrenze della parola cercata (searchStore) vengono evidenziate; quella corrente ha anche un contorno.
function findDocMatches(doc, query) {
  const out = [];
  if (!query) return out;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, '\n', '\n'); // un carattere per ogni posizione
    findAll(text, query).forEach(({ start, end }) => out.push({ from: pos + 1 + start, to: pos + 1 + end }));
    return false;
  });
  return out;
}

const SearchHighlight = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('searchHighlight'),
      props: {
        decorations(state) {
          const { query, step } = useSearchStore.getState();
          const matches = findDocMatches(state.doc, query);
          if (!matches.length) return null;
          const cur = currentIndex(step, matches.length);
          return DecorationSet.create(state.doc, matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === cur ? 'search-hit search-hit-current' : 'search-hit' })));
        },
      },
    })];
  },
});

// REPLAY DELLA REGISTRAZIONE: il testo non ancora scritto a quell'istante appare in grigio
// (gli intervalli li calcola RecordingControl e li passa tramite recordingBus.grey).
const ReplayGrey = Extension.create({
  name: 'replayGrey',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('replayGrey'),
      props: {
        decorations(state) {
          const g = recordingBus.grey;
          if (!g || !g.length) return null;
          const size = state.doc.content.size;
          const decos = g.filter((r) => r.to > r.from && r.to <= size).map((r) => Decoration.inline(r.from, r.to, { class: 'replay-unwritten' }));
          return decos.length ? DecorationSet.create(state.doc, decos) : null;
        },
      },
    })];
  },
});

// AGGIUNGI PARTI: se tra la nuova parte e un frammento già appartenente al nodo c'è solo spazio bianco
// (nello stesso paragrafo), lo spazio entra nella nuova parte. Così le due parti diventano un unico riquadro.
function bridgeToNodeSegments(doc, from, to, id) {
  const list = collectSegments(doc).get(id) || [];
  const onlySpace = (x, y) => x < y && doc.resolve(x).parent === doc.resolve(y).parent && /^\s*$/.test(doc.textBetween(x, y, ' '));
  let bestBefore = -1;
  let bestAfter = Infinity;
  list.forEach((s) => {
    if (s.to <= from && s.to > bestBefore && onlySpace(s.to, from)) bestBefore = s.to;
    if (s.from >= to && s.from < bestAfter && onlySpace(to, s.from)) bestAfter = s.from;
  });
  return { from: bestBefore >= 0 ? bestBefore : from, to: bestAfter !== Infinity ? bestAfter : to };
}

// CURSORE DENTRO I RIQUADRI: quello del browser è dipinto dal paragrafo, ma i riquadri (posizionati e con sfondo)
// vengono dipinti sopra e lo coprono. Con il cursore dentro un riquadro se ne disegna uno proprio, dentro il riquadro stesso,
// e quello del browser si nasconde (vedi gli stili .fake-caret / .has-fake-caret).
const fakeCaretActive = (state) => {
  const { selection } = state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return false;
  return selection.$from.marks().some((m) => m.type.name === 'semanticMark');
};

const FakeCaret = Extension.create({
  name: 'fakeCaret',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('fakeCaret'),
      props: {
        decorations(state) {
          if (!fakeCaretActive(state)) return null;
          const { $from } = state.selection;
          const widget = () => {
            const el = document.createElement('span');
            el.className = 'fake-caret';
            el.setAttribute('aria-hidden', 'true');
            return el;
          };
          return DecorationSet.create(state.doc, [Decoration.widget($from.pos, widget, { marks: $from.marks(), side: 0, ignoreSelection: true })]);
        },
      },
      view(view) {
        const sync = (v) => v.dom.classList.toggle('has-fake-caret', fakeCaretActive(v.state));
        sync(view);
        return { update: sync, destroy: () => view.dom.classList.remove('has-fake-caret') };
      },
    })];
  },
});

const Divider = () => <div className="w-px h-5 bg-gray-400 mx-1.5 shrink-0"></div>;

// Niente scorciatoie Markdown: "- ", "* ", "1. ", "> " restano testo normale
const NoMarkdownShortcuts = Extension.create({
  name: 'noMarkdownShortcuts',
  priority: 1000, // passa prima delle input rule di StarterKit
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== ' ') return false;
          const $from = view.state.doc.resolve(from);
          const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
          if (!/^\s*([-+*>]|\d+[.)])$/.test(before)) return false;
          view.dispatch(view.state.tr.insertText(' ', from, to));
          return true;
        },
      },
    })];
  },
});

// L'altezza della riga dipende anche dal corpo del paragrafo, non solo da quello degli span.
// Se tutto il testo di un paragrafo ha la stessa dimensione, il paragrafo prende quella dimensione:
// così l'interlinea (e i margini, in em) si adattano al corpo scelto.
const BlockFontSize = Extension.create({
  name: 'blockFontSize',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const decos = [];
          state.doc.descendants((node, pos) => {
            if (!node.isTextblock) return true;
            let size;
            let uniform = true;
            node.forEach((child) => {
              if (!child.isText) return;
              const s = child.marks.find((m) => m.type.name === 'textStyle')?.attrs.fontSize || null;
              if (size === undefined) size = s;
              else if (size !== s) uniform = false;
            });
            if (uniform && size) decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `font-size:${size};` }));
            return false;
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    })];
  },
});

export default function TextEditorView() {
  // Stessa palette dei nodi (del tema in uso): il riquadro nel testo e il nodo condividono il colore.
  const HIGHLIGHT_COLORS = useNodeColors();
  const activePanels = useStore((state) => state.activePanels) || [];
  const isEditorActive = activePanels.includes('editor');
  const isMapActive = activePanels.includes('map');
  // Evidenziatore: serve sia nel testo sia sui nodi della mappa
  const canHighlight = isEditorActive || isMapActive;

  const addNode = useStore((state) => state.addNode);
  const removeNode = useStore((state) => state.removeNode);
  const syncNodeTexts = useStore((state) => state.syncNodeTexts);
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const updateEdgeData = useStore((state) => state.updateEdgeData);
  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];

  const documents = useStore((state) => state.documents);
  const activeDocId = useStore((state) => state.activeDocId);
  const epoch = useStore((state) => state.epoch);
  const addDocument = useStore((state) => state.addDocument);
  const setActiveDoc = useStore((state) => state.setActiveDoc);
  const activeDoc = documents.find((d) => d.id === activeDocId);
  // Cosa c'era nel documento all'ultimo aggiornamento: serve a eliminare solo i nodi i cui riquadri sono davvero spariti.
  const markedRef = useRef({ sem: new Set(), gl: new Set() });
  // I contorni dei nodi nel testo si vedono solo quando testo e mappa sono aperti insieme
  const showHighlights = isEditorActive && isMapActive;

  const [toolbarContainer, setToolbarContainer] = useState(null);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [highlightPaletteOpen, setHighlightPaletteOpen] = useState(false);

  // Strumento "acceso": resta nero finché non lo si spegne (secondo clic o Esc).
  // Con uno strumento acceso, ogni selezione di testo viene trattata subito.
  const [armedTool, setArmedTool] = useState(null); // null | 'heading' | 'note' | 'section' | 'append' | 'glossary' | 'highlight' (uno solo alla volta)
  // Strumento "aggiungi parti": il nodo a cui si stanno aggiungendo frammenti di testo (si sceglie cliccando dentro il suo riquadro)
  const [appendTargetId, setAppendTargetId] = useState(null);
  const armedApplyRef = useRef(null);
  const selectedTermId = useStore((state) => state.selectedTermId);

  const isGlossaryActive = activePanels.includes('glossary');

  // --- MOTORE DI OSSERVAZIONE SPAZIALE ---
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const searchOpen = useSearchStore((state) => state.open);
  const searchQuery = useSearchStore((state) => state.query);
  const searchVersion = useSearchStore((state) => state.version);
  const isFirstMeasure = useRef(true);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (isFirstMeasure.current) {
        setMarginsData({ left: 40, right: 40, containerAtSet: width });
        isFirstMeasure.current = false;
      }
      setContainerWidth(width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // --- GLI AMMORTIZZATORI ELASTICI CON ZONA DI SICUREZZA ---
  const SAFE_ZONE = 32;
  const MIN_TEXT = 150;

  const [marginsData, setMarginsData] = useState({ left: 40, right: 40, containerAtSet: 800 });

  const currentWidth = containerWidth || marginsData.containerAtSet;
  const idealTextWidth = Math.max(MIN_TEXT, marginsData.containerAtSet - marginsData.left - marginsData.right - (SAFE_ZONE * 2));

  const availableForExtraMargins = Math.max(0, currentWidth - idealTextWidth - (SAFE_ZONE * 2));
  const totalBaseMargins = marginsData.left + marginsData.right;

  let effectiveLeft = 0;
  let effectiveRight = 0;
  if (totalBaseMargins > 0) {
    effectiveLeft = (marginsData.left / totalBaseMargins) * availableForExtraMargins;
    effectiveRight = (marginsData.right / totalBaseMargins) * availableForExtraMargins;
  }

  const finalLeft = effectiveLeft + SAFE_ZONE;
  const finalRight = effectiveRight + SAFE_ZONE;

  const metricsRef = useRef({ effectiveLeft, effectiveRight, currentWidth });
  metricsRef.current = { effectiveLeft, effectiveRight, currentWidth };

  const startLeftDrag = (e) => {
    e.preventDefault();
    const onMouseMove = (moveEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newLeft = (moveEvent.clientX - rect.left) - SAFE_ZONE;
      const maxLeft = metricsRef.current.currentWidth - metricsRef.current.effectiveRight - (SAFE_ZONE * 2) - MIN_TEXT;
      // Con Shift premuto i due margini si muovono insieme (simmetrici)
      if (moveEvent.shiftKey) {
        const maxBoth = (metricsRef.current.currentWidth - (SAFE_ZONE * 2) - MIN_TEXT) / 2;
        const both = Math.max(0, Math.min(newLeft, maxBoth));
        setMarginsData({ left: both, right: both, containerAtSet: metricsRef.current.currentWidth });
        return;
      }
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));

      setMarginsData({
        left: newLeft,
        right: metricsRef.current.effectiveRight,
        containerAtSet: metricsRef.current.currentWidth
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startRightDrag = (e) => {
    e.preventDefault();
    const onMouseMove = (moveEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRight = (rect.right - moveEvent.clientX) - SAFE_ZONE;
      const maxRight = metricsRef.current.currentWidth - metricsRef.current.effectiveLeft - (SAFE_ZONE * 2) - MIN_TEXT;
      // Con Shift premuto i due margini si muovono insieme (simmetrici)
      if (moveEvent.shiftKey) {
        const maxBoth = (metricsRef.current.currentWidth - (SAFE_ZONE * 2) - MIN_TEXT) / 2;
        const both = Math.max(0, Math.min(newRight, maxBoth));
        setMarginsData({ left: both, right: both, containerAtSet: metricsRef.current.currentWidth });
        return;
      }
      newRight = Math.max(0, Math.min(newRight, maxRight));

      setMarginsData({
        left: metricsRef.current.effectiveLeft,
        right: newRight,
        containerAtSet: metricsRef.current.currentWidth
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    setToolbarContainer(document.getElementById('global-toolbar-container'));
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit, NoMarkdownShortcuts, BlockFontSize, SearchHighlight, ReplayGrey, FakeCaret, ColoredSemanticMark, NoteMark, GlossaryMark, TextStyleMark, HighlightMark,
      // Ricorda a quale testo (e a quale "epoca") appartiene questo editor, per ignorare editor ormai superati
      Extension.create({ name: 'docMeta', addStorage() { return { docId: activeDocId, epoch }; } }),
    ],
    content: activeDoc?.content ?? '',
    editorProps: {
      attributes: { class: 'prose prose-sm sm:prose-base focus:outline-none max-w-none min-h-[500px] w-full' }
    },
    onFocus: () => {
      const st = useStore.getState();
      if (st.selectedTermId) st.setSelectedTermId(null);
      const sel = (st.nodes || []).filter((n) => n.selected);
      if (sel.length && st.onNodesChange) st.onNodesChange(sel.map((n) => ({ id: n.id, type: 'select', selected: false })));
    },
    onUpdate: ({ editor }) => {
      const meta = editor.storage.docMeta;
      const live = useStore.getState();
      if (!meta || meta.docId !== live.activeDocId || meta.epoch !== live.epoch) return; // editor di un testo/quaderno già lasciato
      const docId = meta.docId;
      recordingBus.onContent?.(editor.getHTML()); // se si sta registrando, il testo viene memorizzato con il suo istante
      useStore.getState().updateDocumentContent(docId, editor.getHTML());

      const { sem, gl, texts, quotes } = scanMarks(editor);

      // SINCRONIZZAZIONE NODI (solo quelli di questo documento)
      const currentNodes = useStore.getState().nodes;
      const currentNodeIds = new Set(currentNodes.map((n) => n.id));
      sem.forEach((id) => {
        if (!currentNodeIds.has(id)) {
          useStore.getState().addNode({ id, type: 'semantic', position: getNewNodePosition(), data: { label: texts[id], docId } });
        }
      });
      markedRef.current.sem.forEach((id) => {
        if (sem.has(id)) return;
        const node = useStore.getState().nodes.find((n) => n.id === id);
        if (node && node.data?.docId === docId) useStore.getState().removeNode(id);
      });
      syncNodeTexts(texts);
      syncNodeQuotes(quotes);

      // SINCRONIZZAZIONE GLOSSARIO (solo i termini di questo documento)
      markedRef.current.gl.forEach((id) => {
        if (gl.has(id)) return;
        const term = (useStore.getState().glossaryTerms || []).find((x) => x.id === id);
        if (term && term.docId === docId) useStore.getState().removeGlossaryTerm(id);
      });

      markedRef.current = { sem, gl };
    },
  }, [activeDocId, epoch]);

  // Con uno strumento acceso: al rilascio del mouse nel testo lo applica alla selezione
  useEffect(() => {
    if (!editor || !armedTool) return;
    let dom;
    try { dom = editor.view.dom; } catch (e) { return; }
    const onUp = () => setTimeout(() => armedApplyRef.current?.(), 0);
    dom.addEventListener('mouseup', onUp);
    return () => dom.removeEventListener('mouseup', onUp);
  }, [editor, armedTool]);

  // Finito di aggiungere parti, il nodo scelto viene dimenticato
  useEffect(() => { if (armedTool !== 'append') setAppendTargetId(null); }, [armedTool]);

  // Con la X accesa, selezionare un nodo nella mappa o una scheda del glossario lo elimina e la X si spegne
  useEffect(() => {
    if (armedTool !== 'remove') return;
    const st = useStore.getState();
    const selectedIds = st.nodes.filter((n) => n.selected).map((n) => n.id);
    if (!selectedIds.length && !st.selectedTermId) return;
    selectedIds.forEach((nid) => st.removeNode(nid));
    st.removeSelectedTerm();
    setArmedTool(null);
  }, [armedTool, nodes, selectedTermId]);

  // Esc spegne lo strumento acceso
  useEffect(() => {
    if (!armedTool) return;
    const onKey = (e) => { if (e.key === 'Escape') setArmedTool(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [armedTool]);

  // Cliccando fuori dal pannello del testo (mappa, glossario...) la selezione del testo si toglie.
  // Restano esclusi la barra degli strumenti e il pannello stesso, così gli strumenti agiscono ancora sulla selezione,
  // e i menù che vivono fuori dall'app (es. elenco dei font).
  useEffect(() => {
    if (!editor) return;
    const onDown = (e) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      let view;
      try { view = editor.view; } catch (err) { return; }
      if (view.dom.contains(t)) return;
      if (toolbarContainer && toolbarContainer.contains(t)) return;
      if (containerRef.current && containerRef.current.contains(t)) return;
      const appRoot = containerRef.current?.closest('body > *');
      const top = t.closest ? t.closest('body > *') : null;
      if (appRoot && top && top !== appRoot) return;
      const { empty, head } = editor.state.selection;
      if (!empty) editor.commands.setTextSelection(head);
      const sel = window.getSelection();
      if (sel && sel.rangeCount && view.dom.contains(sel.anchorNode)) sel.removeAllRanges();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [editor, toolbarContainer]);

  // Questo editor è quello del testo attualmente aperto?
  const editorIsCurrent = !!editor && editor.storage?.docMeta?.docId === activeDocId && editor.storage?.docMeta?.epoch === epoch;

  // Ogni volta che si apre un documento (editor nuovo) si memorizza cosa contiene
  useEffect(() => {
    if (!editor) return;
    const { sem, gl, quotes } = scanMarks(editor);
    markedRef.current = { sem, gl };
    syncNodeQuotes(quotes);
  }, [editor]);

  // Questo useEffect agisce in direzione opposta: se elimini il nodo o il glossario dal loro pannello, rimuove l'evidenziazione dal testo
  useEffect(() => {
    if (!editor || !editorIsCurrent) return;
    const currentNodesIds = new Set(nodes.map(n => n.id));
    const currentGlossaryIds = new Set(glossaryTerms.map(t => t.id));
    let tr = editor.state.tr;
    let hasOrphans = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.marks) {
        node.marks.forEach(mark => {
          // Si toglie proprio questo riquadro (non tutti quelli dello stesso tipo): gli altri, anche sovrapposti, restano
          if (mark.type.name === 'semanticMark' && !currentNodesIds.has(mark.attrs.id)) { tr = tr.removeMark(pos, pos + node.nodeSize, mark); hasOrphans = true; }
          if (mark.type.name === 'glossaryMark' && !currentGlossaryIds.has(mark.attrs.id)) { tr = tr.removeMark(pos, pos + node.nodeSize, mark); hasOrphans = true; }
        });
      }
    });
    if (hasOrphans) editor.view.dispatch(tr);
    if (editor.isFocused) return;

    // Se il testo di un nodo è stato cambiato nella mappa, il riquadro nel testo lo segue.
    // Si sostituiscono solo le lettere: il paragrafo non si tocca e il testo nuovo eredita lo stile
    // (font, dimensione, grassetto...) di quello che c'era. Vale per i nodi fatti di una sola parte:
    // se ne hanno più, la mappa mostra un frammento per riga e il testo resta com'è.
    const segs = collectSegments(editor.state.doc);
    // Se dentro il riquadro ce n'è un altro (nodi sovrapposti) il testo non si riscrive, altrimenti si perderebbe quello interno
    const hasOtherNodeInside = (from, to, id) => {
      let other = false;
      editor.state.doc.nodesBetween(from, to, (n) => {
        if (n.isText && n.marks.some((m) => m.type.name === 'semanticMark' && m.attrs.id !== id)) other = true;
      });
      return other;
    };
    const edits = [];
    nodes.forEach((node) => {
      const list = segs.get(node.id);
      const label = node.data?.label ?? '';
      if (!list || list.length !== 1 || !label || label.includes('\n') || label === list[0].text) return;
      if (hasOtherNodeInside(list[0].from, list[0].to, node.id)) return;
      edits.push({ from: list[0].from, to: list[0].to, label });
    });
    if (!edits.length) return;
    const doc = editor.state.doc;
    let trEdit = editor.state.tr;
    edits.sort((a, b) => b.from - a.from).forEach(({ from, to, label }) => {
      const marks = doc.nodeAt(from)?.marks || [];
      trEdit = trEdit.replaceWith(from, to, editor.state.schema.text(label, marks));
    });
    editor.view.dispatch(trEdit);
  }, [nodes, glossaryTerms, editor, editorIsCurrent]);

  // COLORE: allinea il colore delle mark nel testo a quello del nodo (node.data.color).
  // La modifica non entra nella cronologia, così Annulla/Ripeti non "sporca" i colori.
  useEffect(() => {
    if (!editor || !editorIsCurrent) return;
    const colorById = new Map(nodes.map(n => [n.id, n.data?.color || null]));
    let tr = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, pos) => {
      if (!node.marks) return;
      node.marks.forEach(mark => {
        if (mark.type.name !== 'semanticMark') return;
        if (!colorById.has(mark.attrs.id)) return;
        const wanted = colorById.get(mark.attrs.id);
        if ((mark.attrs.color || null) !== wanted) {
          const from = pos;
          const to = pos + node.nodeSize;
          tr = tr.removeMark(from, to, mark).addMark(from, to, mark.type.create({ ...mark.attrs, color: wanted }));
          changed = true;
        }
      });
    });
    if (changed) {
      tr.setMeta('addToHistory', false);
      editor.view.dispatch(tr);
    }
  }, [nodes, editor, editorIsCurrent]);

  // RICERCA: a ogni azione (nuova parola, Invio, chiusura) si ridisegnano le evidenziazioni e si va al risultato corrente
  useEffect(() => {
    if (!editor || !editorIsCurrent) return;
    try {
      editor.view.dispatch(editor.state.tr.setMeta('searchRefresh', true));
      if (!isEditorActive) return;
      const { query, step } = useSearchStore.getState();
      if (!query) return;
      const matches = findDocMatches(editor.state.doc, query);
      if (!matches.length) return;
      const coords = editor.view.coordsAtPos(matches[currentIndex(step, matches.length)].from);
      const el = scrollRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      el.scrollTo({ top: el.scrollTop + coords.top - box.top - box.height / 3, behavior: 'smooth' });
    } catch (e) { /* editor non pronto */ }
  }, [editor, editorIsCurrent, searchVersion, isEditorActive]);

  if (!editor) return null;

  const handleCreateSection = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    // Un paragrafo per riga, come nel testo del nodo che verrà riletto dal documento
    const selectedText = editor.state.doc.textBetween(from, to, SEGMENT_SEPARATOR);
    if (!selectedText.trim()) return;
    const nodeId = 'nodo-' + Date.now();
    addNode({ id: nodeId, type: 'semantic', position: getNewNodePosition(), data: { label: selectedText, docId: useStore.getState().activeDocId } });
    editor.chain().focus().setMark('semanticMark', { id: nodeId }).run();
  };

  // La X è uno strumento come gli altri: se c'è già qualcosa da eliminare (nodo selezionato, scheda, riquadro sotto il cursore)
  // lo elimina subito; altrimenti resta accesa finché si seleziona qualcosa, poi si spegne. L'occhio si apre e poi torna com'era.
  const hasRemoveTarget = () => {
    const st = useStore.getState();
    return !!st.selectedTermId || st.nodes.some((n) => n.selected) || (isEditorActive && getSectionIdsAtSelection().length > 0);
  };
  const handleRemoveClick = () => {
    if (armedTool === 'remove') { setArmedTool(null); return; }
    if (hasRemoveTarget()) { removeSectionNow(); return; }
    setArmedTool('remove');
  };

  const removeSectionNow = () => {
    // Scheda del glossario selezionata e/o nodi selezionati nella mappa: li elimina
    // (il riquadro o il termine nel testo sparisce di conseguenza)
    const removedTerm = useStore.getState().removeSelectedTerm();
    const selectedNodeIds = useStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
    if (selectedNodeIds.length) { selectedNodeIds.forEach((nid) => removeNode(nid)); return; }
    if (removedTerm) return;
    if (!isEditorActive) return;
    const { $from, empty } = editor.state.selection;
    if (!empty) {
      // Testo selezionato: si toglie dal riquadro solo quella parte. Il resto del riquadro e il nodo restano
      // (il nodo sparisce da solo, con onUpdate, solo se non gli rimane più nessun frammento).
      editor.chain().focus().unsetMark('semanticMark').run();
      return;
    }
    // Solo il cursore dentro un riquadro: si elimina tutto il riquadro
    const marks = $from.marks();
    const semanticMark = marks.find(m => m.type.name === 'semanticMark');
    if (semanticMark) {
      editor.chain().focus().unsetMark('semanticMark').run();
      // Non è più strettamente necessario chiamare removeNode qui, onUpdate lo farà per noi, ma manteniamo la ridondanza per sicurezza
      removeNode(semanticMark.attrs.id);
    } else {
      editor.chain().focus().unsetMark('semanticMark').run();
    }
  };

  // Ora è un Toggle: Se la parola è già evidenziata, la spegne.
  const handleToggleGlossaryTerm = () => {
    if (editor.isActive('glossaryMark')) {
      editor.chain().focus().unsetMark('glossaryMark').run();
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) return;

    const docId = useStore.getState().activeDocId;
    useStore.getState().addGlossaryTerm(selectedText, docId);
    const term = useStore.getState().glossaryTerms.find(t => t.word === selectedText && t.docId === docId);
    if (term) editor.chain().focus().setMark('glossaryMark', { id: term.id }).run();
  };

  // --- Font e dimensione ---
  const currentTextStyle = editor.getAttributes('textStyle');
  const currentFont = currentTextStyle.fontFamily || '';
  const currentSize = currentTextStyle.fontSize ? parseInt(currentTextStyle.fontSize, 10) : 16;

  const applyTextStyle = (attrs) => {
    const next = { ...currentTextStyle, ...attrs };
    if (!next.fontFamily && !next.fontSize) editor.chain().focus().unsetMark('textStyle').run();
    else editor.chain().focus().setMark('textStyle', next).run();
  };

  // --- Evidenziatore ---
  // Colora i riquadri (le sezioni legate ai nodi): basta avere il cursore dentro un riquadro,
  // o una selezione che lo tocca. Il colore va sul nodo e da lì ritorna sul riquadro nel testo.
  const getSectionIdsAtSelection = () => {
    const { empty, from, to, $from } = editor.state.selection;
    const ids = new Set();
    const collect = (marks) => (marks || []).forEach((m) => { if (m.type.name === 'semanticMark') ids.add(m.attrs.id); });
    if (empty) { collect($from.marks()); collect($from.nodeAfter?.marks); }
    else editor.state.doc.nodesBetween(from, to, (n) => { collect(n.marks); });
    return [...ids];
  };

  const applyColorToSections = (ids, color, toggle) => {
    const { nodes: currentNodes, updateNodeData } = useStore.getState();
    const alreadyThisColor = toggle && color && ids.every((id) => currentNodes.find((n) => n.id === id)?.data?.color === color);
    ids.forEach((id) => updateNodeData(id, { color: alreadyThisColor ? null : color }));
  };

  // Bersaglio dell'evidenziatore: prima i nodi selezionati nella mappa, poi il riquadro sotto il cursore nel testo.
  const getTargetIds = () => {
    const selectedNodeIds = useStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
    return selectedNodeIds.length ? selectedNodeIds : (isEditorActive ? getSectionIdsAtSelection() : []);
  };

  const handleHighlight = () => {
    const ids = getTargetIds();
    if (ids.length) { applyColorToSections(ids, highlightColor, true); return; }
    if (!isEditorActive) return;
    // Fuori da un riquadro: evidenziazione semplice del testo selezionato
    if (editor.isActive('highlightMark')) editor.chain().focus().unsetMark('highlightMark').run();
    else editor.chain().focus().setMark('highlightMark', { color: highlightColor }).run();
  };

  const handlePickHighlightColor = (color) => {
    setHighlightPaletteOpen(false);
    if (color) setHighlightColor(color);
    const ids = getTargetIds();
    if (ids.length) { applyColorToSections(ids, color, false); return; }
    if (!isEditorActive) return;
    if (!color) { editor.chain().focus().unsetMark('highlightMark').run(); return; }
    if (!editor.state.selection.empty) editor.chain().focus().setMark('highlightMark', { color }).run();
  };

  // Applica lo strumento acceso alla selezione corrente del testo
  armedApplyRef.current = () => {
    if (!armedTool || !isEditorActive) return;
    const { to, empty } = editor.state.selection;
    if (armedTool === 'remove') {
      if (getSectionIdsAtSelection().length) { removeSectionNow(); setArmedTool(null); }
      return;
    }
    if (armedTool === 'append') {
      const ids = getSectionIdsAtSelection();
      const targetExists = appendTargetId && nodes.some((n) => n.id === appendTargetId);
      // Un clic dentro un riquadro lo sceglie come nodo a cui aggiungere le parti
      if (empty || !targetExists) { if (ids.length === 1) setAppendTargetId(ids[0]); return; }
      // Testo selezionato: diventa un'altra parte dello stesso nodo (lo strumento resta acceso per aggiungerne altre)
      const color = nodes.find((n) => n.id === appendTargetId)?.data?.color || null;
      // Se la nuova parte è attaccata (o separata da soli spazi) a una parte già del nodo, si fondono in un unico riquadro
      const range = bridgeToNodeSegments(editor.state.doc, editor.state.selection.from, to, appendTargetId);
      editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).setMark('semanticMark', { id: appendTargetId, color }).setTextSelection(range.to).run();
      return;
    }
    if (armedTool === 'highlight') {
      const ids = getSectionIdsAtSelection();
      if (ids.length) { applyColorToSections(ids, highlightColor, false); return; }
      if (empty) return;
      editor.chain().focus().setMark('highlightMark', { color: highlightColor }).setTextSelection(to).run();
      return;
    }
    if (empty) return;
    if (armedTool === 'heading') editor.chain().focus().toggleHeading({ level: 1 }).run();
    else if (armedTool === 'note') editor.chain().focus().toggleMark('noteMark').run();
    else if (armedTool === 'section') handleCreateSection();
    else handleToggleGlossaryTerm();
    editor.commands.setTextSelection(to);
    setArmedTool(null); // dopo l'uso lo strumento si spegne da solo (solo il secchiello resta acceso)
  };

  // Clic su uno strumento: lo accende (e lo applica subito se c'è già una selezione) oppure lo spegne
  const toggleTool = (tool, applyNow) => {
    if (armedTool === tool) { setArmedTool(null); return; }
    // Tranne il secchiello e "aggiungi parti", gli strumenti si usano una volta sola: con testo già selezionato (o per il titolo,
    // che agisce sulla riga) si applicano subito e non restano accesi; senza selezione restano accesi finché non si seleziona qualcosa.
    if (tool !== 'highlight' && tool !== 'append' && (tool === 'heading' || !editor.state.selection.empty)) { applyNow(); return; }
    setArmedTool(tool);
    applyNow();
  };

  // Label e Dashed agiscono sui collegamenti selezionati nella mappa
  const selectedEdges = edges.filter((e) => e.selected);
  const hasSelectedEdges = selectedEdges.length > 0;
  const allDashed = hasSelectedEdges && selectedEdges.every((e) => e.data?.dashed);
  const allLabeled = hasSelectedEdges && selectedEdges.every((e) => e.data?.label !== undefined && e.data?.label !== null);
  const toggleDashed = () => selectedEdges.forEach((e) => updateEdgeData(e.id, { dashed: !allDashed }));
  const toggleLabel = () => selectedEdges.forEach((e) => updateEdgeData(e.id, { label: allLabeled ? undefined : (e.data?.label ?? '') }));

  const ON = 'bg-gray-900 text-white';
  const iconBtn = (extra = '') => `p-1.5 border-2 border-transparent transition-all active:bg-gray-900 active:text-white ${extra}`;

  const globalToolbar = (
    <div className="flex items-center justify-start gap-0.5 flex-1 min-w-0">
      <button onClick={() => (isEditorActive ? editor.chain().focus().undo().run() : editor.commands.undo())} disabled={!editor.can().undo()} className={`p-1.5 border-2 border-transparent text-gray-900 transition-opacity ${!editor.can().undo() ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-900 active:bg-gray-900 active:text-white'}`} title="Annulla">
        <Undo size={16} />
      </button>
      <button onClick={() => (isEditorActive ? editor.chain().focus().redo().run() : editor.commands.redo())} disabled={!editor.can().redo()} className={`p-1.5 border-2 border-transparent text-gray-900 transition-opacity ${!editor.can().redo() ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-900 active:bg-gray-900 active:text-white'}`} title="Ripeti">
        <Redo size={16} />
      </button>
      {isEditorActive && (
        <>
      <Divider />
      <button onClick={() => isEditorActive && toggleTool('heading', () => editor.chain().focus().toggleHeading({ level: 1 }).run())} className={iconBtn(armedTool === 'heading' ? ON : 'text-gray-900 hover:border-gray-900')} title="Titolo Capitolo (si applica al testo selezionato; senza selezione resta acceso fino alla prossima selezione, Esc per annullare)">
        <Type size={16} strokeWidth={armedTool === 'heading' ? 3 : 2} />
      </button>
      <button onClick={() => isEditorActive && toggleTool('note', () => editor.chain().focus().toggleMark('noteMark').run())} className={iconBtn(armedTool === 'note' ? ON : 'text-gray-400 hover:border-gray-900')} title="Note (Testo Grigio) (si applica al testo selezionato; senza selezione resta acceso fino alla prossima selezione, Esc per annullare)">
        <PenTool size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={iconBtn(editor.isActive('bulletList') ? ON : 'text-gray-900 hover:border-gray-900')} title="Elenco puntato">
        <List size={16} strokeWidth={editor.isActive('bulletList') ? 3 : 2} />
      </button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={iconBtn(editor.isActive('blockquote') ? ON : 'text-gray-900 hover:border-gray-900')} title="Citazione evidenziata">
        <Quote size={16} strokeWidth={editor.isActive('blockquote') ? 3 : 2} />
      </button>
      <Divider />
      <button onClick={() => isEditorActive && toggleTool('section', handleCreateSection)} className={iconBtn(armedTool === 'section' ? ON : 'text-gray-900 hover:border-gray-900')} title="Crea Sezione (si applica al testo selezionato; senza selezione resta acceso fino alla prossima selezione, Esc per annullare)">
        <Square size={16} />
      </button>
      {/* Aggiungi parti: più frammenti separati del testo per lo stesso nodo */}
      <button
        onClick={() => isEditorActive && toggleTool('append', () => {
          const ids = getSectionIdsAtSelection();
          if (ids.length === 1) setAppendTargetId(ids[0]);
        })}
        className={iconBtn(armedTool === 'append' ? ON : 'text-gray-900 hover:border-gray-900')}
        title="Aggiungi parti a un nodo: clicca dentro un riquadro, poi seleziona altre parti del testo (entrano nello stesso nodo). Resta acceso: secondo clic o Esc per finire"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={armedTool === 'append' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M12 8v8M8 12h8" /></svg>
      </button>
      {armedTool === 'append' && (
        <span className="ml-1 max-w-[160px] truncate text-[10px] font-bold uppercase tracking-widest text-gray-900">
          {appendTargetId && nodes.some((n) => n.id === appendTargetId)
            ? `→ ${String(nodes.find((n) => n.id === appendTargetId)?.data?.label || '').split('\n')[0]}`
            : 'clicca un riquadro'}
        </span>
      )}
        </>
      )}

      {!isEditorActive && <Divider />}
      {(canHighlight || isGlossaryActive) && (
        <button onClick={handleRemoveClick} className={iconBtn(armedTool === 'remove' ? ON : 'text-gray-900 hover:border-gray-900')} title="Elimina (con testo selezionato toglie solo quella parte dal riquadro; col cursore dentro un riquadro lo elimina tutto; vale anche per i nodi selezionati. Se non c'è nulla di selezionato resta acceso fino alla prossima selezione, Esc per annullare)">
          <X size={16} />
        </button>
      )}

      {isEditorActive && (
        <>
      <Divider />
      {/* Il bottone reagisce visivamente se sei sopra un termine del glossario e permette di spegnerlo */}
      <button onClick={() => isEditorActive && toggleTool('glossary', () => { if (!editor.state.selection.empty) handleToggleGlossaryTerm(); })} className={iconBtn(armedTool === 'glossary' ? ON : 'text-gray-900 hover:border-gray-900')} title="Aggiungi/Rimuovi dal Glossario (si applica al testo selezionato; senza selezione resta acceso fino alla prossima selezione, Esc per annullare)">
        <Book size={16} />
      </button>
      <Divider />

      {/* Font e dimensione, come nella barra di TextEdit */}
      <FontPicker
        value={currentFont}
        onChange={(f) => applyTextStyle({ fontFamily: f || null })}
        className="w-[150px] h-7"
        title="Font (scegli dall'elenco o scrivi il nome di un font installato)"
      />
      <SizePicker
        value={currentSize}
        onChange={(s) => applyTextStyle({ fontSize: `${s}px` })}
        className="h-7 ml-1"
      />
      <Divider />

        </>
      )}

      {canHighlight && (
        <>
      {!isEditorActive && <Divider />}
      {/* Evidenziatore + colore */}
      <button onClick={() => toggleTool('highlight', () => { if (getTargetIds().length || (isEditorActive && !editor.state.selection.empty)) handleHighlight(); })} className={iconBtn(armedTool === 'highlight' ? ON : 'text-gray-900 hover:border-gray-900')} title="Colora il riquadro o il testo selezionato (resta attivo: clicca di nuovo o premi Esc per disattivare)">
        <PaintBucket size={16} />
      </button>
      <div className="flex items-center gap-[7px] ml-1">
        <button
          onClick={() => setHighlightPaletteOpen((o) => !o)}
          className="block w-4 h-4 rounded-full border-2 border-gray-900 cursor-pointer hover:scale-110 transition-transform"
          style={{ backgroundColor: highlightColor }}
          title="Colore evidenziatore"
        />
        {/* I colori si aprono in linea nella barra, come i pallini del nodo */}
        {highlightPaletteOpen && canHighlight && (
          <>
            <div className="fixed inset-0 z-40" onMouseDown={() => setHighlightPaletteOpen(false)} />
            <div className="relative z-50 flex items-center gap-[7px] pl-1">
              <button
                onClick={() => handlePickHighlightColor(null)}
                title="Rimuovi colore"
                className="w-4 h-4 rounded-full border-2 border-gray-900 bg-white cursor-pointer hover:scale-110 transition-transform"
              />
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handlePickHighlightColor(c.value)}
                  title={c.name}
                  className={`w-4 h-4 rounded-full cursor-pointer hover:scale-110 transition-transform ${highlightColor === c.value ? 'ring-2 ring-gray-900 ring-offset-2' : ''}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </>
        )}
      </div>
        </>
      )}

      {isMapActive && (
        <>
      <Divider />
      {/* Collegamenti: etichetta e tratteggio (si applicano ai collegamenti selezionati) */}
      <button
        onClick={toggleLabel}
        disabled={!hasSelectedEdges}
        className={iconBtn(`${allLabeled ? ON : 'text-gray-900'} ${hasSelectedEdges ? 'hover:border-gray-900' : 'opacity-30 cursor-not-allowed'}`)}
        title="Label: aggiungi o togli l'etichetta al collegamento selezionato"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="3" /><rect x="8" y="10.5" width="8" height="3" rx="1.5" /></svg>
      </button>
      <button
        onClick={toggleDashed}
        disabled={!hasSelectedEdges}
        className={iconBtn(`${allDashed ? ON : 'text-gray-900'} ${hasSelectedEdges ? 'hover:border-gray-900' : 'opacity-30 cursor-not-allowed'}`)}
        title="Dashed: collegamento tratteggiato"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19l2-2M10 14l2-2M15 9l2-2M19 5l.5-.5" /></svg>
      </button>
        </>
      )}

      {/* Ricerca: lente a destra. Cerca la parola nel testo, nei nodi e nel glossario (quelli aperti) insieme */}
      <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
        {searchOpen && (
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => useSearchStore.getState().setQuery(e.target.value)}
            onKeyDown={(e) => {
              const st = useSearchStore.getState();
              if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) st.prev(); else st.next(); }
              else if (e.key === 'Escape') st.closeSearch();
            }}
            placeholder="Cerca"
            className="h-7 w-40 border-2 border-gray-900 bg-white px-2 text-xs font-bold text-gray-900 outline-none placeholder-gray-400"
          />
        )}
        <button
          onClick={() => { const st = useSearchStore.getState(); if (st.open) st.closeSearch(); else st.openSearch(); }}
          className={iconBtn(searchOpen ? ON : 'text-gray-900 hover:border-gray-900')}
          title="Cerca una parola (Invio: risultato successivo, Maiusc+Invio: precedente, Esc: chiudi)"
        >
          <Search size={16} strokeWidth={searchOpen ? 3 : 2} />
        </button>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="w-full bg-white flex flex-col h-full relative">
      <style>{`
        .ProseMirror h1 { background-color: var(--ink) !important; color: var(--paper) !important; display: inline; -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 2px 4px !important; font-size: inherit !important; font-weight: inherit !important; text-transform: none !important; letter-spacing: normal !important; margin: 0 !important; }
        /* Font e dimensione dentro un titolo: la barra scura segue il testo (altrimenti restava della misura del titolo base) */
        .ProseMirror h1 span[style] { background-color: var(--ink); color: var(--paper); padding: 2px 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
        .semantic-mark-node { --fill: var(--paper); display: inline; position: relative; z-index: 10; margin: 0; line-height: inherit; cursor: pointer; padding: 1lh 2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; background: linear-gradient(var(--ink), var(--ink)) no-repeat center / 100% calc(1lh + 6px); transition: transform 0.1s ease; }
        /* Il riempimento è più alto di 2px della riga (1px per lato): i riempimenti di righe vicine si sovrappongono invece di toccarsi.
           Se si toccavano soltanto, con l'altezza di riga frazionaria (es. corpo 13) il pixel di giunzione lasciava scoperto
           il contorno sotto e compariva una linea sottile tra una riga e l'altra. Il contorno è 1px più alto per lato: resta spesso 2px. */
        .semantic-mark-node .sem-fill { position: relative; z-index: 1; display: inline; line-height: inherit; color: var(--tx, var(--ink)); padding: 1lh 0.25em; -webkit-box-decoration-break: clone; box-decoration-break: clone; background: linear-gradient(var(--fl, var(--fill)), var(--fl, var(--fill))) no-repeat center / 100% calc(1lh + 2px); }
        /* Grassetto, corsivo ecc. dentro un riquadro sono solo testo: niente bordo, sfondo o riempimento propri */
        .semantic-mark-node strong, .semantic-mark-node b, .semantic-mark-node em, .semantic-mark-node i, .semantic-mark-node s, .semantic-mark-node u, .semantic-mark-node code { background: none !important; border: 0 !important; box-shadow: none !important; outline: 0 !important; padding: 0 !important; margin: 0 !important; position: static; z-index: auto; display: inline; }
        /* Box colorati: stessa altezza e larghezza dei box vuoti, senza bordo continuo: il riempimento arriva fino al bordo
           e solo i quattro angoli hanno una piccola parentesi nera */
        .semantic-mark-node[data-color] { --fill: var(--sem-color); padding: 1lh 0; background: none !important; }
        .semantic-mark-node[data-color] .sem-fill {
          --bar: linear-gradient(var(--ink), var(--ink));
          color: var(--tx, var(--sem-text));
          padding: 1lh calc(0.25em + 2px);
          background:
            var(--bar) left calc(50% - 0.5lh - 2px) / 6px 2px no-repeat,
            var(--bar) left calc(50% - 0.5lh) / 2px 6px no-repeat,
            var(--bar) right calc(50% - 0.5lh - 2px) / 6px 2px no-repeat,
            var(--bar) right calc(50% - 0.5lh) / 2px 6px no-repeat,
            var(--bar) left calc(50% + 0.5lh + 2px) / 6px 2px no-repeat,
            var(--bar) left calc(50% + 0.5lh) / 2px 6px no-repeat,
            var(--bar) right calc(50% + 0.5lh + 2px) / 6px 2px no-repeat,
            var(--bar) right calc(50% + 0.5lh) / 2px 6px no-repeat,
            linear-gradient(var(--fl, var(--fill)), var(--fl, var(--fill))) center / 100% calc(1lh + 6px) no-repeat;
        }
        /* Comparsa dei contorni stile e-ink: il riquadro lampeggia in negativo (nero con testo chiaro),
           poi si svuota (carta bianca, testo ancora spento) e infine si assesta com'è. Tre fotogrammi netti, nessuna dissolvenza. */
        @keyframes sem-refresh {
          0%   { --fl: var(--ink);   --tx: var(--paper); }
          50%  { --fl: var(--paper); --tx: transparent; }
        }
        /* Niente "fill-mode: forwards": a fine animazione il riquadro torna agli stili normali, così segue il cambio di tema */
        .show-highlights .semantic-mark-node { animation: sem-refresh 290ms step-end; }
        @media (prefers-reduced-motion: reduce) { .show-highlights .semantic-mark-node { animation: none; } }
        .semantic-mark-node:hover { transform: translateY(-1px); }
        /* Ricerca: risultati in negativo, quello corrente anche con un contorno */
        .ProseMirror .search-hit { background: var(--ink); color: var(--paper); }
        .ProseMirror h1 .search-hit { background: var(--paper); color: var(--ink); }
        .ProseMirror .search-hit-current { outline: 2px solid var(--ink); outline-offset: 2px; }
        /* Replay audio: il testo non ancora scritto è grigio (anche dentro riquadri, titoli e evidenziazioni) */
        .ProseMirror .replay-unwritten, .ProseMirror .replay-unwritten * { color: #9ca3af !important; }
        /* Cursore dentro i riquadri: ne disegniamo uno nostro (quello del browser resta coperto dal riquadro) */
        .show-highlights .ProseMirror.has-fake-caret { caret-color: transparent; }
        .hide-highlights .fake-caret, .ProseMirror:not(.ProseMirror-focused) .fake-caret { display: none; }
        .fake-caret { display: inline-block; position: relative; width: 0; height: 0; pointer-events: none; }
        .fake-caret::after { content: ''; position: absolute; left: -1px; bottom: -0.25em; width: 2px; height: 1.2em; background: currentColor; animation: fake-caret-blink 1.06s step-end infinite; }
        @keyframes fake-caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .fake-caret::after { animation: none; } }
        .ProseMirror p, .ProseMirror h1 { line-height: 1.4 !important; }
        .ProseMirror p { margin-top: 0.6em; margin-bottom: 0.6em; }
        .ProseMirror > :first-child { margin-top: 0 !important; }
        /* Elenco puntato */
        .ProseMirror ul { margin: 0.6em 0; padding-left: 1.4em; }
        .ProseMirror li p { margin: 0.2em 0; }
        /* Citazione in stile Notion: barra a sinistra, testo un po' più grande, niente virgolette */
        .ProseMirror blockquote { border-left: 3px solid var(--ink); margin: 0.8em 0; padding: 0.1em 0 0.1em 1em; font-style: normal; font-weight: inherit; font-size: 1.15em; quotes: none; }
        .ProseMirror blockquote p { margin: 0.3em 0; }
        .ProseMirror blockquote p::before, .ProseMirror blockquote p::after { content: none !important; }
        .ProseMirror mark[data-hl] { color: #111827; padding: 0; }
        .hide-highlights .sem-fill { box-shadow: none !important; background: transparent !important; color: inherit !important; padding: 0 !important; -webkit-box-decoration-break: slice !important; box-decoration-break: slice !important; }
        .hide-highlights .semantic-mark-node, .hide-highlights .semantic-mark-node:hover, .hide-highlights .semantic-mark-node:focus, .hide-highlights .semantic-mark-node:active { background: transparent !important; color: inherit !important; -webkit-box-decoration-break: slice !important; box-decoration-break: slice !important; padding: 0 !important; margin: 0 !important; font-weight: inherit !important; filter: none !important; box-shadow: none !important; border: none !important; transform: none !important; cursor: text !important; }
      `}</style>

      {toolbarContainer && createPortal(globalToolbar, toolbarContainer)}

      {/* LINGUETTE: i testi del quaderno aperto */}
      <div className="flex shrink-0 items-stretch overflow-x-auto bg-white border-b-2 border-gray-900 pr-20">
        {documents.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveDoc(d.id)}
            className={`px-4 py-1.5 text-[11px] font-bold whitespace-nowrap border-r-2 border-gray-900 transition-colors ${d.id === activeDocId ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`}
          >
            {d.name}
          </button>
        ))}
        <button
          onClick={() => addDocument({ name: `Testo ${documents.length + 1}`, content: '<p></p>' })}
          className="px-3 py-1.5 text-[13px] font-bold text-gray-900 hover:bg-gray-900 hover:text-white transition-colors"
          title="Nuovo testo"
        >
          +
        </button>
      </div>

      <div className="w-full h-0 relative shrink-0 z-10">
        <div
          className="absolute top-0 h-6 w-8 cursor-ew-resize flex justify-center group -ml-4"
          style={{ left: `${finalLeft}px` }}
          onMouseDown={startLeftDrag}
        >
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-gray-900 group-hover:scale-125 transition-transform origin-top" />
        </div>

        <div
          className="absolute top-0 h-6 w-8 cursor-ew-resize flex justify-center group -mr-4"
          style={{ right: `${finalRight}px` }}
          onMouseDown={startRightDrag}
        >
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-gray-900 group-hover:scale-125 transition-transform origin-top" />
        </div>
      </div>

      <div ref={scrollRef} className={`flex-grow overflow-y-auto w-full h-full ${showHighlights ? 'show-highlights' : 'hide-highlights'}`}>
        <div style={{ paddingLeft: `${finalLeft}px`, paddingRight: `${finalRight}px` }} className="min-h-full pt-4 pb-32">
           <EditorContent editor={editor} className="w-full h-full min-h-full outline-none" />
        </div>
      </div>

      {/* Registratore audio (stile Notability): microfono, play con traccia, replay del testo */}
      {editorIsCurrent && <RecordingControl key={`${activeDocId}-${epoch}`} editor={editor} docId={activeDocId} />}

    </div>
  );
}
