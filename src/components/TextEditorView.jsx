import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mark, Extension, mergeAttributes } from '@tiptap/core';
import { SemanticMark } from './SemanticMark';
import { useStore } from '../store/useStore';
import { getNewNodePosition } from './SpatialMapView';
import { readableTextColor } from './nodeColors';
import { useNodeColors } from './useThemeColors';
import FontPicker, { SizePicker } from './FontPicker';
import { Type, PenTool, Square, X, Book, Undo, Redo, Highlighter, Eye, EyeOff } from 'lucide-react';

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
});

// Font e dimensione del testo (stile TextEdit)
const TextStyleMark = Mark.create({
  name: 'textStyle',
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


// Legge dal documento i riquadri (nodi) e i termini di glossario presenti, con il testo di ogni riquadro.
function scanMarks(editor) {
  const sem = new Set(); const gl = new Set(); const texts = {};
  editor.state.doc.descendants((node) => {
    if (!node.marks) return;
    const sm = node.marks.find((m) => m.type.name === 'semanticMark');
    if (sm) { sem.add(sm.attrs.id); texts[sm.attrs.id] = (texts[sm.attrs.id] || '') + (node.text || ''); }
    const gm = node.marks.find((m) => m.type.name === 'glossaryMark');
    if (gm) gl.add(gm.attrs.id);
  });
  return { sem, gl, texts };
}

const Divider = () => <div className="w-px h-5 bg-gray-400 mx-1.5 shrink-0"></div>;

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
  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];

  const documents = useStore((state) => state.documents);
  const activeDocId = useStore((state) => state.activeDocId);
  const epoch = useStore((state) => state.epoch);
  const addDocument = useStore((state) => state.addDocument);
  const setActiveDoc = useStore((state) => state.setActiveDoc);
  const activeDoc = documents.find((d) => d.id === activeDocId);
  // Cosa c'era nel documento all'ultimo aggiornamento: serve a eliminare solo i nodi i cui riquadri sono davvero spariti.
  const markedRef = useRef({ sem: new Set(), gl: new Set() });
  const showHighlights = useStore((state) => state.showHighlights);
  const toggleHighlights = useStore((state) => state.toggleHighlights);

  const [toolbarContainer, setToolbarContainer] = useState(null);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [highlightPaletteOpen, setHighlightPaletteOpen] = useState(false);

  // --- MOTORE DI OSSERVAZIONE SPAZIALE ---
  const containerRef = useRef(null);
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
      StarterKit, ColoredSemanticMark, NoteMark, GlossaryMark, TextStyleMark, HighlightMark,
      // Ricorda a quale testo (e a quale "epoca") appartiene questo editor, per ignorare editor ormai superati
      Extension.create({ name: 'docMeta', addStorage() { return { docId: activeDocId, epoch }; } }),
    ],
    content: activeDoc?.content ?? '',
    editorProps: {
      attributes: { class: 'prose prose-sm sm:prose-base focus:outline-none max-w-none min-h-[500px] w-full' }
    },
    onFocus: () => {
      const st = useStore.getState();
      const sel = (st.nodes || []).filter((n) => n.selected);
      if (sel.length && st.onNodesChange) st.onNodesChange(sel.map((n) => ({ id: n.id, type: 'select', selected: false })));
    },
    onUpdate: ({ editor }) => {
      const meta = editor.storage.docMeta;
      const live = useStore.getState();
      if (!meta || meta.docId !== live.activeDocId || meta.epoch !== live.epoch) return; // editor di un testo/quaderno già lasciato
      const docId = meta.docId;
      useStore.getState().updateDocumentContent(docId, editor.getHTML());

      const { sem, gl, texts } = scanMarks(editor);

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

      // SINCRONIZZAZIONE GLOSSARIO (solo i termini di questo documento)
      markedRef.current.gl.forEach((id) => {
        if (gl.has(id)) return;
        const term = (useStore.getState().glossaryTerms || []).find((x) => x.id === id);
        if (term && term.docId === docId) useStore.getState().removeGlossaryTerm(id);
      });

      markedRef.current = { sem, gl };
    },
  }, [activeDocId, epoch]);

  // Questo editor è quello del testo attualmente aperto?
  const editorIsCurrent = !!editor && editor.storage?.docMeta?.docId === activeDocId && editor.storage?.docMeta?.epoch === epoch;

  // Ogni volta che si apre un documento (editor nuovo) si memorizza cosa contiene
  useEffect(() => {
    if (!editor) return;
    const { sem, gl } = scanMarks(editor);
    markedRef.current = { sem, gl };
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
          if (mark.type.name === 'semanticMark' && !currentNodesIds.has(mark.attrs.id)) { tr = tr.removeMark(pos, pos + node.nodeSize, mark.type); hasOrphans = true; }
          if (mark.type.name === 'glossaryMark' && !currentGlossaryIds.has(mark.attrs.id)) { tr = tr.removeMark(pos, pos + node.nodeSize, mark.type); hasOrphans = true; }
        });
      }
    });
    if (hasOrphans) editor.view.dispatch(tr);
    if (editor.isFocused) return;
    nodes.forEach(node => {
      let start = null; let end = null;
      editor.state.doc.descendants((n, pos) => {
        if (n.marks && n.marks.some(m => m.attrs.id === node.id)) {
          if (start === null) start = pos;
          end = pos + n.nodeSize;
        }
      });
      if (start !== null && end !== null) {
        const currentEditorText = editor.state.doc.textBetween(start, end, ' ');
        if (currentEditorText !== node.data.label) {
          editor.chain().setTextSelection({ from: start, to: end }).insertContent(node.data.label).setMark('semanticMark', { id: node.id, color: node.data.color || null }).run();
        }
      }
    });
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

  if (!editor) return null;

  const handleCreateSection = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;
    const nodeId = 'nodo-' + Date.now();
    addNode({ id: nodeId, type: 'semantic', position: getNewNodePosition(), data: { label: selectedText, docId: useStore.getState().activeDocId } });
    editor.chain().focus().setMark('semanticMark', { id: nodeId }).run();
  };

  const handleRemoveSection = () => {
    // Nodi selezionati nella mappa: li elimina (il riquadro nel testo sparisce di conseguenza)
    const selectedNodeIds = useStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
    if (selectedNodeIds.length) { selectedNodeIds.forEach((nid) => removeNode(nid)); return; }
    if (!isEditorActive) return;
    const { $from } = editor.state.selection;
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

  const iconBtn = (extra = '') => `p-1.5 border-2 border-transparent transition-all active:bg-gray-900 active:text-white ${extra}`;

  const globalToolbar = (
    <div className="flex items-center justify-start gap-0.5 w-full">
      {isEditorActive && (
        <>
      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={`p-1.5 border-2 border-transparent text-gray-900 transition-opacity ${!editor.can().undo() ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-900 active:bg-gray-900 active:text-white'}`} title="Annulla">
        <Undo size={16} />
      </button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={`p-1.5 border-2 border-transparent text-gray-900 transition-opacity ${!editor.can().redo() ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-900 active:bg-gray-900 active:text-white'}`} title="Ripeti">
        <Redo size={16} />
      </button>
      <Divider />
      <button onClick={() => isEditorActive && editor.chain().focus().toggleHeading({ level: 1 }).run()} className={iconBtn(editor.isActive('heading', { level: 1 }) ? 'bg-gray-900 text-white' : 'text-gray-900 hover:border-gray-900')} title="Titolo Capitolo">
        <Type size={16} strokeWidth={editor.isActive('heading', { level: 1 }) ? 3 : 2} />
      </button>
      <button onClick={() => isEditorActive && editor.chain().focus().toggleMark('noteMark').run()} className={iconBtn(editor.isActive('noteMark') ? 'bg-gray-900 text-white' : 'text-gray-400 hover:border-gray-900')} title="Note (Testo Grigio)">
        <PenTool size={16} />
      </button>
      <Divider />
      <button onClick={() => isEditorActive && handleCreateSection()} className={iconBtn('text-gray-900 hover:border-gray-900')} title="Crea Sezione">
        <Square size={16} />
      </button>
        </>
      )}

      {canHighlight && (
        <button onClick={() => handleRemoveSection()} className={iconBtn('text-gray-900 hover:border-gray-900')} title="Elimina (sezione sotto il cursore o nodi selezionati)">
          <X size={16} />
        </button>
      )}

      {isEditorActive && (
        <>
      <Divider />
      {/* Il bottone reagisce visivamente se sei sopra un termine del glossario e permette di spegnerlo */}
      <button onClick={() => isEditorActive && handleToggleGlossaryTerm()} className={iconBtn(editor.isActive('glossaryMark') ? 'bg-gray-900 text-white' : 'text-gray-900 hover:border-gray-900')} title="Aggiungi/Rimuovi dal Glossario">
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
      <button onClick={() => handleHighlight()} className={iconBtn(editor.isActive('highlightMark') ? 'bg-gray-900 text-white' : 'text-gray-900 hover:border-gray-900')} title="Evidenzia il riquadro (clicca dentro un riquadro) o il testo selezionato">
        <Highlighter size={16} />
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

      {isEditorActive && (
        <>
      <Divider />
      {/* Occhio: aperto mostra evidenziazioni e riquadri dei nodi nel testo, chiuso li toglie */}
      <button
        onClick={() => toggleHighlights()}
        className={iconBtn('text-gray-900 hover:border-gray-900')}
        title={showHighlights ? 'Nascondi evidenziazioni e riquadri' : 'Mostra evidenziazioni e riquadri'}
      >
        {showHighlights ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="w-full bg-white flex flex-col h-full relative">
      <style>{`
        .ProseMirror h1 { background-color: var(--ink) !important; color: var(--paper) !important; display: inline; -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 2px 4px !important; font-size: inherit !important; font-weight: inherit !important; text-transform: none !important; letter-spacing: normal !important; margin: 0 !important; }
        .semantic-mark-node { background-color: var(--paper); color: var(--ink); -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 4px 4px; margin: 0 2px; line-height: 1; cursor: pointer; position: relative; z-index: 10; display: inline; transition: transform 0.1s ease; filter: drop-shadow(2px 0 0 var(--ink)) drop-shadow(-2px 0 0 var(--ink)) drop-shadow(0 2px 0 var(--ink)) drop-shadow(0 -2px 0 var(--ink)); will-change: filter, transform; transform: translateZ(0); }
        .semantic-mark-node[data-color] { background-color: var(--sem-color); color: var(--sem-text); }
        .semantic-mark-node:hover { transform: translateY(-1px) translateZ(0); }
        .ProseMirror mark[data-hl] { color: #111827; padding: 0; }
        .hide-highlights mark[data-hl] { background-color: transparent !important; }
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

      <div className={`flex-grow overflow-y-auto w-full h-full ${showHighlights ? '' : 'hide-highlights'}`}>
        <div style={{ paddingLeft: `${finalLeft}px`, paddingRight: `${finalRight}px` }} className="min-h-full pt-8 pb-32">
           <EditorContent editor={editor} className="w-full h-full min-h-full outline-none" />
        </div>
      </div>

    </div>
  );
}
