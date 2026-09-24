import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { SemanticMark } from './SemanticMark';
import { useStore } from '../store/useStore';
import { Bold, Italic, Heading1, Heading2, List, Eye, EyeOff } from 'lucide-react'; // <-- Aggiunte le icone Eye e EyeOff

export default function TextEditorView() {
  const addNode = useStore((state) => state.addNode);
  const syncNodeTexts = useStore((state) => state.syncNodeTexts);
  const nodes = useStore((state) => state.nodes);
  const editorContent = useStore((state) => state.editorContent);
  const setEditorContent = useStore((state) => state.setEditorContent);

  // ESTRAZIONE DEI NUOVI POTERI DI VISIBILITÀ
  const showHighlights = useStore((state) => state.showHighlights);
  const toggleHighlights = useStore((state) => state.toggleHighlights);

  const editor = useEditor({
    extensions: [StarterKit, SemanticMark],
    content: editorContent,
    editorProps: {
      attributes: { class: 'prose prose-sm sm:prose-base focus:outline-none max-w-full min-h-[500px]' },
    },
    onUpdate: ({ editor }) => {
      setEditorContent(editor.getHTML());
      const updates = {};
      editor.state.doc.descendants((node) => {
        if (node.marks) {
          const mark = node.marks.find(m => m.type.name === 'semanticMark');
          if (mark) {
            const id = mark.attrs.id;
            updates[id] = (updates[id] || '') + (node.text || '');
          }
        }
      });
      syncNodeTexts(updates);
    },
  });

  // ... useEffect della sincronizzazione inversa (INVARIATO) ...

  if (!editor) return null;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full min-h-[70vh]">
      
{/* L'ARMA SEGRETA DEFINITIVA: Rendering accelerato via GPU e mascheratura perfetta */}
      <style>{`
        /* 1. Lo stato visibile: Monolito perfetto accelerato via hardware */
        .semantic-mark-node {
          background-color: white;
          color: #111827;
          -webkit-box-decoration-break: clone;
          box-decoration-break: clone;
          padding: 4px 4px;
          margin: 0 2px;
          line-height: 1;
          cursor: pointer;
          position: relative;
          z-index: 10;
          display: inline;
          transition: transform 0.1s ease;
          /* Il finto bordo a 4 direzioni */
          filter: drop-shadow(2px 0 0 #111827) drop-shadow(-2px 0 0 #111827) drop-shadow(0 2px 0 #111827) drop-shadow(0 -2px 0 #111827);
          /* Stabilizzazione del rendering per prevenire sfarfallii su contenteditable */
          will-change: filter, transform;
          transform: translateZ(0);
        }

        .semantic-mark-node:hover {
          transform: translateY(-1px) translateZ(0);
        }

        /* 2. Lo stato nascosto: Annientamento ottico totale */
        .hide-highlights .semantic-mark-node,
        .hide-highlights .semantic-mark-node:hover,
        .hide-highlights .semantic-mark-node:focus,
        .hide-highlights .semantic-mark-node:active {
          background: transparent !important;
          color: inherit !important;
          -webkit-box-decoration-break: slice !important;
          box-decoration-break: slice !important;
          padding: 0 !important;
          margin: 0 !important;
          font-weight: inherit !important;
          filter: none !important;
          box-shadow: none !important;
          border: none !important;
          transform: none !important;
          cursor: text !important;
          will-change: auto !important;
        }
      `}</style>

      {/* Toolbar Aggiornata con divisione in Flex */}
      <div className="flex items-center justify-between border-b border-gray-200 p-2 bg-gray-50">
        
        {/* Gruppo di formattazione standard */}
        <div className="flex items-center gap-2">
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded-md ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-200' : 'hover:bg-gray-200'}`}>
            <Heading1 size={18} />
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 rounded-md ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : 'hover:bg-gray-200'}`}>
            <Heading2 size={18} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1"></div>
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 rounded-md ${editor.isActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-200'}`}>
            <Bold size={18} />
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 rounded-md ${editor.isActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-200'}`}>
            <Italic size={18} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1"></div>
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 rounded-md ${editor.isActive('bulletList') ? 'bg-gray-200' : 'hover:bg-gray-200'}`}>
            <List size={18} />
          </button>
        </div>

        {/* L'Interruttore Brutalista */}
        <button
          onClick={toggleHighlights}
          className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-2 border-gray-900 transition-all shadow-[2px_2px_0px_0px_rgba(17,24,39,1)] active:translate-y-[1px] active:translate-x-[1px] active:shadow-none
            ${showHighlights ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}
          title="Attiva/Disattiva visibilità nodi nel testo"
        >
          {showHighlights ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>{showHighlights ? 'Nascondi Nodi' : 'Mostra Nodi'}</span>
        </button>
      </div>

      {/* Area di Testo: applichiamo la classe condizionale 'hide-highlights' */}
      <div className={`p-6 flex-grow overflow-y-auto relative ${showHighlights ? '' : 'hide-highlights'}`}>
        {editor && (
          <BubbleMenu editor={editor} options={{ placement: 'top', offset: 8 }} className="z-50">
            <button
              onClick={() => {
                const selectedText = editor.state.doc.textBetween(
                  editor.state.selection.from,
                  editor.state.selection.to,
                  ' '
                );
                if (!selectedText.trim()) return;
                
                const nodeId = 'nodo-' + Date.now();
                addNode({
                  id: nodeId,
                  type: 'semantic',
                  position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
                  data: { label: selectedText }
                });

                editor.chain().focus().setMark('semanticMark', { id: nodeId }).run();
              }}
              className="bg-gray-900 text-white px-3 py-1.5 text-sm font-semibold rounded-md shadow-lg hover:bg-gray-700 transition-transform active:scale-95 flex items-center gap-2 cursor-pointer relative"
            >
              ✦ Estrai Nodo
            </button>
          </BubbleMenu>
        )}
        
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}