import React, { useEffect } from 'react'; // <-- AGGIUNTO useEffect
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { SemanticMark } from './SemanticMark';
import { useStore } from '../store/useStore';
import { Bold, Italic, Heading1, Heading2, List } from 'lucide-react';

export default function TextEditorView() {
  const addNode = useStore((state) => state.addNode);
  const syncNodeTexts = useStore((state) => state.syncNodeTexts);
  const nodes = useStore((state) => state.nodes); // <-- ESTRAI I NODI

  const editor = useEditor({
    extensions: [StarterKit, SemanticMark],
    content: '<p>Origini delle Immagini Digitali...</p><p>La visualizzazione dei dati parte negli anni 60... Inizia a scrivere qui.</p>',
    editorProps: {
      attributes: { class: 'prose prose-sm sm:prose-base focus:outline-none max-w-full min-h-[500px]' },
    },
    // Sincronizzazione Editor -> Nodo (Esistente)
    onUpdate: ({ editor }) => {
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

  // SINCRONIZZAZIONE INVERSA: Nodo -> Editor
  useEffect(() => {
    // Selezioniamo l'editor solo se non è a fuoco (per non interrompere la digitazione manuale)
    if (!editor || editor.isFocused) return;

    nodes.forEach(node => {
      let start = null;
      let end = null;
      
      // Trova le coordinate del frammento di testo nell'editor
      editor.state.doc.descendants((n, pos) => {
        if (n.marks && n.marks.some(m => m.attrs.id === node.id)) {
          if (start === null) start = pos;
          end = pos + n.nodeSize;
        }
      });

      // Se lo trova e il testo è diverso, sovrascrive l'editor
      if (start !== null && end !== null) {
        const currentEditorText = editor.state.doc.textBetween(start, end, ' ');
        if (currentEditorText !== node.data.label) {
          editor.chain()
            .setTextSelection({ from: start, to: end })
            .insertContent(node.data.label)
            .setMark('semanticMark', { id: node.id }) // Riapplica il marcatore
            .run();
        }
      }
    });
  }, [nodes, editor]);

  if (!editor) return null;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full min-h-[70vh]">
      {/* ... Toolbar invariata ... */}
      <div className="p-6 flex-grow overflow-y-auto relative">
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
                
                // 1. Crea il nodo spaziale
                addNode({
                  id: nodeId,
                  type: 'semantic',
                  position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
                  data: { label: selectedText }
                });

                // 2. Applica il riquadro brutalista al testo, marchiandolo con l'ID
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