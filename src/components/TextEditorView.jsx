import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mark, mergeAttributes } from '@tiptap/core';
import { SemanticMark } from './SemanticMark';
import { useStore } from '../store/useStore';
import { Type, PenTool, Square, Eraser, Book, Undo, Redo } from 'lucide-react';

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

export default function TextEditorView() {
  const activePanels = useStore((state) => state.activePanels) || [];
  const isEditorActive = activePanels.includes('editor'); 

  const addNode = useStore((state) => state.addNode);
  const removeNode = useStore((state) => state.removeNode);
  const syncNodeTexts = useStore((state) => state.syncNodeTexts);
  const nodes = useStore((state) => state.nodes);
  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];
  
  const editorContent = useStore((state) => state.editorContent);
  const setEditorContent = useStore((state) => state.setEditorContent);
  const showHighlights = useStore((state) => state.showHighlights);

  const [toolbarContainer, setToolbarContainer] = useState(null);

  // --- MOTORE DI OSSERVAZIONE SPAZIALE ---
  const containerRef = useRef(null);
  const isFirstMeasure = useRef(true);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (isFirstMeasure.current) {
        // Inizializza i margini utente (a cui si sommerà la SAFE_ZONE)
        setMarginsData({ left: 40, right: 40, containerAtSet: width });
        isFirstMeasure.current = false;
      }
      setContainerWidth(width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // --- GLI AMMORTIZZATORI ELASTICI CON ZONA DI SICUREZZA ---
  const SAFE_ZONE = 32; // I pixel intoccabili sui bordi
  const MIN_TEXT = 150; // Larghezza minima vitale per il testo

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

  // Aggiungiamo il cemento armato ai margini
  const finalLeft = effectiveLeft + SAFE_ZONE;
  const finalRight = effectiveRight + SAFE_ZONE;

  const metricsRef = useRef({ effectiveLeft, effectiveRight, currentWidth });
  metricsRef.current = { effectiveLeft, effectiveRight, currentWidth };

  const startLeftDrag = (e) => {
    e.preventDefault();
    const onMouseMove = (moveEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Sottraggo la SAFE_ZONE perché il mouse muove solo il margine extra
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
    extensions: [StarterKit, SemanticMark, NoteMark, GlossaryMark],
    content: editorContent,
    editorProps: {
      attributes: { class: 'prose prose-sm sm:prose-base focus:outline-none max-w-none min-h-[500px] w-full' }
    },
    onUpdate: ({ editor }) => {
      setEditorContent(editor.getHTML());
      const updates = {};
      const foundIdsInEditor = new Set();
      editor.state.doc.descendants((node) => {
        if (node.marks) {
          const mark = node.marks.find(m => m.type.name === 'semanticMark');
          if (mark) {
            const id = mark.attrs.id;
            updates[id] = (updates[id] || '') + (node.text || '');
            foundIdsInEditor.add(id);
          }
        }
      });
      const currentNodesIds = new Set(useStore.getState().nodes.map(n => n.id));
      foundIdsInEditor.forEach(id => {
        if (!currentNodesIds.has(id)) {
          useStore.getState().addNode({ id: id, type: 'semantic', position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 }, data: { label: updates[id] } });
        }
      });
      currentNodesIds.forEach(id => { if (!foundIdsInEditor.has(id)) useStore.getState().removeNode(id); });
      syncNodeTexts(updates);
    },
  });

  useEffect(() => {
    if (!editor) return;
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
          editor.chain().setTextSelection({ from: start, to: end }).insertContent(node.data.label).setMark('semanticMark', { id: node.id }).run();
        }
      }
    });
  }, [nodes, glossaryTerms, editor]);

  if (!editor) return null;

  const handleCreateSection = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;
    const nodeId = 'nodo-' + Date.now();
    addNode({ id: nodeId, type: 'semantic', position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 }, data: { label: selectedText } });
    editor.chain().focus().setMark('semanticMark', { id: nodeId }).run();
  };

  const handleRemoveSection = () => {
    const { $from } = editor.state.selection;
    const marks = $from.marks();
    const semanticMark = marks.find(m => m.type.name === 'semanticMark');
    if (semanticMark) {
      editor.chain().focus().unsetMark('semanticMark').run();
      removeNode(semanticMark.attrs.id);
    } else {
      editor.chain().focus().unsetMark('semanticMark').run();
    }
  };

  const handleCreateGlossaryTerm = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) return;
    useStore.getState().addGlossaryTerm(selectedText);
    const term = useStore.getState().glossaryTerms.find(t => t.word === selectedText);
    if (term) editor.chain().focus().setMark('glossaryMark', { id: term.id }).run();
  };

  const globalToolbar = (
    <div className="flex items-center justify-start gap-1 w-full min-w-max">
      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={`p-2 border-2 border-transparent text-gray-900 transition-opacity ${!editor.can().undo() ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-900'}`} title="Annulla">
        <Undo size={18} />
      </button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={`p-2 border-2 border-transparent text-gray-900 transition-opacity ${!editor.can().redo() ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-900'}`} title="Ripeti">
        <Redo size={18} />
      </button>
      <div className="w-px h-6 bg-gray-400 mx-2 shrink-0"></div>
      <button onClick={() => isEditorActive && editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 border-2 border-transparent transition-all ${!isEditorActive ? 'opacity-30 grayscale cursor-not-allowed' : (editor.isActive('heading', { level: 1 }) ? 'bg-gray-900 text-white' : 'text-gray-900 hover:border-gray-900')}`} title="Titolo Capitolo">
        <Type size={18} strokeWidth={editor.isActive('heading', { level: 1 }) ? 3 : 2} />
      </button>
      <button onClick={() => isEditorActive && editor.chain().focus().toggleMark('noteMark').run()} className={`p-2 border-2 border-transparent transition-all ${!isEditorActive ? 'opacity-30 grayscale cursor-not-allowed' : (editor.isActive('noteMark') ? 'bg-gray-200 text-gray-900' : 'text-gray-400 hover:border-gray-900')}`} title="Note (Testo Grigio)">
        <PenTool size={18} />
      </button>
      <div className="w-px h-6 bg-gray-400 mx-2 shrink-0"></div>
      <button onClick={() => isEditorActive && handleCreateSection()} className={`p-2 border-2 border-transparent transition-all ${!isEditorActive ? 'opacity-30 grayscale cursor-not-allowed text-gray-900' : 'text-gray-900 hover:border-gray-900'}`} title="Crea Sezione">
        <Square size={18} />
      </button>
      <button onClick={() => isEditorActive && handleRemoveSection()} className={`p-2 border-2 border-transparent transition-all ${!isEditorActive ? 'opacity-30 grayscale cursor-not-allowed text-gray-900' : 'text-gray-900 hover:border-gray-900 hover:text-red-500'}`} title="Cancella Sezione">
        <Eraser size={18} />
      </button>
      <div className="w-px h-6 bg-gray-400 mx-2 shrink-0"></div>
      <button onClick={() => isEditorActive && handleCreateGlossaryTerm()} className={`p-2 border-2 border-transparent transition-all ${!isEditorActive ? 'opacity-30 grayscale cursor-not-allowed text-gray-900' : 'text-gray-900 hover:border-gray-900'}`} title="Aggiungi al Glossario">
        <Book size={18} />
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="w-full bg-white flex flex-col h-full relative">
      <style>{`
        .ProseMirror h1 { background-color: #111827 !important; color: #ffffff !important; display: inline; -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 2px 4px !important; font-size: inherit !important; font-weight: inherit !important; text-transform: none !important; letter-spacing: normal !important; margin: 0 !important; }
        .semantic-mark-node { background-color: white; color: #111827; -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 4px 4px; margin: 0 2px; line-height: 1; cursor: pointer; position: relative; z-index: 10; display: inline; transition: transform 0.1s ease; filter: drop-shadow(2px 0 0 #111827) drop-shadow(-2px 0 0 #111827) drop-shadow(0 2px 0 #111827) drop-shadow(0 -2px 0 #111827); will-change: filter, transform; transform: translateZ(0); }
        .semantic-mark-node:hover { transform: translateY(-1px) translateZ(0); }
        .hide-highlights .semantic-mark-node, .hide-highlights .semantic-mark-node:hover, .hide-highlights .semantic-mark-node:focus, .hide-highlights .semantic-mark-node:active { background: transparent !important; color: inherit !important; -webkit-box-decoration-break: slice !important; box-decoration-break: slice !important; padding: 0 !important; margin: 0 !important; font-weight: inherit !important; filter: none !important; box-shadow: none !important; border: none !important; transform: none !important; cursor: text !important; }
      `}</style>

      {toolbarContainer && createPortal(globalToolbar, toolbarContainer)}

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