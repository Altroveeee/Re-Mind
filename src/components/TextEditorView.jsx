import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mark, mergeAttributes } from '@tiptap/core'; // <-- Necessari per la nuova estensione Note
import { SemanticMark } from './SemanticMark';
import { useStore } from '../store/useStore';
// Icone che approssimano la tua interfaccia
import { Type, PenTool, Square, Eraser } from 'lucide-react';


// --- LA NUOVA ESTENSIONE: NOTE ---
const NoteMark = Mark.create({
  name: 'noteMark',
  parseHTML() {
    return [{ tag: 'span[data-note]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 
      'data-note': '', 
      class: 'text-gray-400' 
    }), 0];
  },
});

export default function TextEditorView() {
  const addNode = useStore((state) => state.addNode);
  const removeNode = useStore((state) => state.removeNode);
  const syncNodeTexts = useStore((state) => state.syncNodeTexts);
  const nodes = useStore((state) => state.nodes);
  const editorContent = useStore((state) => state.editorContent);
  const setEditorContent = useStore((state) => state.setEditorContent);
  const showHighlights = useStore((state) => state.showHighlights);

  // --- IL MOTORE DI RIDIMENSIONAMENTO SIMMETRICO ---
      const [editorWidth, setEditorWidth] = useState(800); // Larghezza di default
      const isResizing = useRef(false);

      const startResize = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Previene la selezione accidentale del testo
      }, []);

      const stopResize = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }, []);

      const handleMouseMove = useCallback((e) => {
        if (isResizing.current) {
          const center = window.innerWidth / 2;
          const distance = Math.abs(e.clientX - center);
          // Moltiplica per 2 per la larghezza totale. Impone limiti: min 400px, max 95% dello schermo.
          const newWidth = Math.max(400, Math.min(distance * 2, window.innerWidth * 0.95));
          setEditorWidth(newWidth);
        }
      }, []);

      useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', stopResize);
        return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', stopResize);
        };
      }, [handleMouseMove, stopResize]);
      
  const editor = useEditor({
   extensions: [StarterKit, SemanticMark, NoteMark],
    content: editorContent,
    editorProps: {
      attributes: { 
        // Inserito 'max-w-none' per distruggere i limiti orizzontali
        class: 'prose prose-sm sm:prose-base focus:outline-none max-w-none min-h-[500px] w-full px-8 py-4' 
      },
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

      const currentNodes = useStore.getState().nodes;
      const currentNodesIds = new Set(currentNodes.map(n => n.id));
      
      // Resurrezione
      foundIdsInEditor.forEach(id => {
        if (!currentNodesIds.has(id)) {
          useStore.getState().addNode({
            id: id,
            type: 'semantic',
            position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
            data: { label: updates[id] }
          });
        }
      });

      // Annientamento automatico
      currentNodesIds.forEach(id => {
        if (!foundIdsInEditor.has(id)) {
          useStore.getState().removeNode(id);
        }
      });

      syncNodeTexts(updates);
    },
  });

  // Il Mietitore e la Sincronizzazione inversa
  useEffect(() => {
    if (!editor) return;
    const currentNodesIds = new Set(nodes.map(n => n.id));
    let tr = editor.state.tr;
    let hasOrphans = false;

    editor.state.doc.descendants((node, pos) => {
      if (node.marks) {
        node.marks.forEach(mark => {
          if (mark.type.name === 'semanticMark' && !currentNodesIds.has(mark.attrs.id)) {
            tr = tr.removeMark(pos, pos + node.nodeSize, mark.type);
            hasOrphans = true;
          }
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
  }, [nodes, editor]);

  if (!editor) return null;

  // --- LE TUE NUOVE FUNZIONI DELLA BARRA DEGLI STRUMENTI ---

  const handleCreateSection = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return; // Niente selezionato, non fa nulla
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;
    
    const nodeId = 'nodo-' + Date.now();
    addNode({
      id: nodeId,
      type: 'semantic',
      position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
      data: { label: selectedText }
    });
    editor.chain().focus().setMark('semanticMark', { id: nodeId }).run();
  };

  const handleRemoveSection = () => {
    // Cerca se il cursore è attualmente dentro un nodo
    const { $from } = editor.state.selection;
    const marks = $from.marks();
    const semanticMark = marks.find(m => m.type.name === 'semanticMark');
    
    if (semanticMark) {
      const nodeId = semanticMark.attrs.id;
      // 1. Rimuove l'estetica
      editor.chain().focus().unsetMark('semanticMark').run();
      // 2. Annienta il nodo dalla mappa
      removeNode(nodeId);
    } else {
      // Fallback: se ha evidenziato un testo e clicca cancella, pulisce la selezione
      editor.chain().focus().unsetMark('semanticMark').run();
    }
  };

return (
    <div className="w-full bg-white flex flex-col h-full min-h-screen">
      {/* IL CONTENITORE RADICE: Questo div tiene in piedi l'intero componente */}
      
      <style>{`
        .ProseMirror h1 {
          background-color: #111827 !important;
          color: #ffffff !important;
          display: inline;
          -webkit-box-decoration-break: clone;
          box-decoration-break: clone;
          padding: 2px 4px !important;
          font-size: inherit !important;
          font-weight: inherit !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          margin: 0 !important;
        }
        .semantic-mark-node {
          background-color: white; color: #111827;
          -webkit-box-decoration-break: clone; box-decoration-break: clone;
          padding: 4px 4px; margin: 0 2px; line-height: 1; cursor: pointer;
          position: relative; z-index: 10; display: inline; transition: transform 0.1s ease;
          filter: drop-shadow(2px 0 0 #111827) drop-shadow(-2px 0 0 #111827) drop-shadow(0 2px 0 #111827) drop-shadow(0 -2px 0 #111827);
          will-change: filter, transform; transform: translateZ(0);
        }
        .semantic-mark-node:hover { transform: translateY(-1px) translateZ(0); }
        .hide-highlights .semantic-mark-node, .hide-highlights .semantic-mark-node:hover,
        .hide-highlights .semantic-mark-node:focus, .hide-highlights .semantic-mark-node:active {
          background: transparent !important; color: inherit !important;
          -webkit-box-decoration-break: slice !important; box-decoration-break: slice !important;
          padding: 0 !important; margin: 0 !important; font-weight: inherit !important; filter: none !important;
          box-shadow: none !important; border: none !important; transform: none !important; cursor: text !important;
        }
      `}</style>

      {/* 1. BARRA DEGLI STRUMENTI */}
      <div className="flex items-center gap-1 border-b-2 border-gray-900 p-2 bg-gray-100 shrink-0">
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 border-2 border-transparent hover:border-gray-900 ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-900 text-white' : 'text-gray-900'}`} title="Titolo Capitolo">
          <Type size={18} strokeWidth={editor.isActive('heading', { level: 1 }) ? 3 : 2} />
        </button>
        <button onClick={() => editor.chain().focus().toggleMark('noteMark').run()} className={`p-2 border-2 border-transparent hover:border-gray-900 ${editor.isActive('noteMark') ? 'bg-gray-200' : 'text-gray-400'}`} title="Note (Testo Grigio)">
          <PenTool size={18} />
        </button>
        <div className="w-px h-6 bg-gray-400 mx-2"></div>
        <button onClick={handleCreateSection} className="p-2 border-2 border-transparent text-gray-900 hover:border-gray-900" title="Crea Sezione">
          <Square size={18} />
        </button>
        <button onClick={handleRemoveSection} className="p-2 border-2 border-transparent text-gray-900 hover:border-gray-900 hover:text-red-500" title="Cancella Sezione">
          <Eraser size={18} />
        </button>
      </div>

      {/* 3. L'AREA DI TESTO A GEOMETRIA VARIABILE */}
      <div className={`flex-grow overflow-y-auto relative flex justify-center bg-gray-200 py-8 ${showHighlights ? '' : 'hide-highlights'}`}>
        
        {/* Il Foglio Centrale - Ora con bordi massicci e ombra brutalista */}
        <div 
          className="flex bg-white border-2 border-gray-900 shadow-[8px_8px_0px_0px_rgba(17,24,39,1)] transition-none"
          style={{ width: `${editorWidth}px`, minHeight: '80vh' }}
        >
          
          {/* MANICO SINISTRO (Invasivo e Brutalista) */}
          <div 
            className="w-8 flex-shrink-0 bg-gray-100 border-r-2 border-gray-900 cursor-col-resize flex items-center justify-center hover:bg-gray-300 transition-colors active:bg-gray-400"
            onMouseDown={startResize}
            title="Trascina per ridimensionare"
          >
            {/* La zigrinatura di presa */}
            <div className="flex flex-col gap-1.5">
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
            </div>
          </div>

          {/* L'Editor Tipografico */}
          <div className="flex-grow py-10 px-8 sm:px-12 overflow-x-hidden">
            <EditorContent editor={editor} className="w-full h-full" />
          </div>

          {/* MANICO DESTRO (Invasivo e Brutalista) */}
          <div 
            className="w-8 flex-shrink-0 bg-gray-100 border-l-2 border-gray-900 cursor-col-resize flex items-center justify-center hover:bg-gray-300 transition-colors active:bg-gray-400"
            onMouseDown={startResize}
            title="Trascina per ridimensionare"
          >
            {/* La zigrinatura di presa */}
            <div className="flex flex-col gap-1.5">
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
              <div className="w-1.5 h-1.5 bg-gray-900"></div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}