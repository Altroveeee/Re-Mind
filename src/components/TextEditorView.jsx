import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { useStore } from '../store/useStore';
import { Bold, Italic, Heading1, Heading2, List } from 'lucide-react';

export default function TextEditorView() {
  // Estrazione della funzione di iniezione dal cervello globale
  const addNode = useStore((state) => state.addNode);

  // Inizializzazione del motore TipTap
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Origini delle Immagini Digitali...</p><p>La visualizzazione dei dati parte negli anni 60... Inizia a scrivere qui.</p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base focus:outline-none max-w-full min-h-[500px]',
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full min-h-[70vh]">
      
      {/* Toolbar Base dell'Editor */}
      <div className="flex items-center gap-2 border-b border-gray-200 p-2 bg-gray-50">
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

      {/* Area di Testo e Logica di Estrazione Spaziale */}
      <div className="p-6 flex-grow overflow-y-auto relative">
        {editor && (
          <BubbleMenu 
            editor={editor} 
            options={{ placement: 'top', offset: 8 }}
            className="z-50"
          >
            <button
              onClick={() => {
                const selectedText = editor.state.doc.textBetween(
                  editor.state.selection.from,
                  editor.state.selection.to,
                  ' '
                );
                
                if (!selectedText.trim()) return;
                
                // Il salvataggio del frammento nel database (Livello 2)
                addNode({
                  id: 'nodo-' + Date.now(),
                  type: 'semantic', // Il design brutalista
                  position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
                  data: { label: selectedText }
                });
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
