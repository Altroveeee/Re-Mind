import React from 'react';
import { useStore } from '../store/useStore';
import { Type, PenTool, Square, Eraser, Book, Undo, Redo } from 'lucide-react';

export default function ViewSlider() {
  const activePanels = useStore((state) => state.activePanels) || [];
  const togglePanel = useStore((state) => state.togglePanel);

  const panels = [
    { id: 'editor', label: 'Testo' },
    { id: 'map', label: 'Nodi' },
    { id: 'glossary', label: 'Glossario' }
  ];

  return (
    <div className="flex items-center justify-between bg-gray-100 border-b-2 border-gray-900 shrink-0 min-h-[52px]">
      
      {/* SINISTRA: La Docking Station per la barra degli strumenti */}
      <div id="global-toolbar-container" className="flex-1 flex items-center px-2 overflow-x-auto">
        
        {/* Il fantasma della barra: appare disattivato quando chiudi l'editor */}
        {!activePanels.includes('editor') && (
          <div className="flex items-center gap-1 opacity-20 pointer-events-none grayscale min-w-max">
            <button className="p-2"><Undo size={18} /></button>
            <button className="p-2"><Redo size={18} /></button>
            <div className="w-px h-6 bg-gray-400 mx-2"></div>
            <button className="p-2"><Type size={18} /></button>
            <button className="p-2"><PenTool size={18} /></button>
            <div className="w-px h-6 bg-gray-400 mx-2"></div>
            <button className="p-2"><Square size={18} /></button>
            <button className="p-2"><Eraser size={18} /></button>
            <div className="w-px h-6 bg-gray-400 mx-2"></div>
            <button className="p-2"><Book size={18} /></button>
          </div>
        )}
        
      </div>

      {/* DESTRA: I Toggle dei livelli */}
      <div className="flex items-center gap-3 p-2 pr-4 shrink-0">
        {panels.map((panel) => (
          <button
            key={panel.id}
            onClick={() => togglePanel(panel.id)}
            className={`px-4 py-1.5 border-2 border-gray-900 text-[10px] font-bold uppercase tracking-widest transition-all ${
              activePanels.includes(panel.id)
                ? 'bg-gray-900 text-white shadow-none translate-y-[2px] translate-x-[2px]'
                : 'bg-white text-gray-900 shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] hover:bg-gray-50 active:translate-y-[2px] active:translate-x-[2px] active:shadow-none'
            }`}
          >
            {panel.label}
          </button>
        ))}
      </div>
      
    </div>
  );
}