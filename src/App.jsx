import React, { useRef } from 'react';
import TextEditorView from './components/TextEditorView';
import SpatialMapView from './components/SpatialMapView'; // Assicurati che il nome sia corretto
import ViewSlider from './components/ViewSlider';
import { useStore } from './store/useStore';

export default function App() {
  // 1. Estrazione dello stato visivo
  const viewMode = useStore((state) => state.viewMode);
  
  // 2. Riferimento per l'importazione
  const fileInputRef = useRef(null);

  // --- LOGICA DI ESPORTAZIONE (Preservata) ---
  const handleExport = () => {
    const currentState = useStore.getState();
    const dataStr = JSON.stringify(currentState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `remind-mappa-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- LOGICA DI IMPORTAZIONE (Preservata) ---
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedState = JSON.parse(e.target.result);
        useStore.setState(importedState);
      } catch (error) {
        alert("Il file è corrotto o non è un artefatto JSON di Re-mind.");
      }
    };
    reader.readAsText(file);
    event.target.value = null; 
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-100 overflow-hidden font-sans">
      
      {/* L'Intestazione Brutalista con I/O */}
      <header className="flex items-center justify-between p-4 bg-white border-b-2 border-gray-900 z-50">
        <h1 className="text-2xl font-black tracking-tighter uppercase text-gray-900">Re-mind</h1>
        
        <div className="flex gap-4">
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleImport} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-white border-2 border-gray-900 text-[10px] font-bold uppercase tracking-widest text-gray-900 hover:bg-gray-100 transition-all shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none"
          >
            Carica Mappa
          </button>
          <button 
            onClick={handleExport}
            className="px-4 py-2 bg-gray-900 text-white border-2 border-gray-900 text-[10px] font-bold uppercase tracking-widest hover:bg-gray-800 transition-all shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none"
          >
            Esporta JSON
          </button>
        </div>
      </header>

      {/* Il Controllore di Stato Spaziale */}
      <ViewSlider />
      
      {/* L'Arena dei Dati Dinamica */}
      <div className="flex flex-1 w-full overflow-hidden relative">
        
        {/* LIVELLO 1: L'Editor */}
        {viewMode <= 2 && (
          <div 
            className={`h-full border-gray-900 transition-all duration-300 ease-in-out bg-white overflow-hidden relative flex flex-col
              ${viewMode === 1 ? 'w-full max-w-4xl mx-auto border-l-2 border-r-2' : 'w-1/2 border-r-2'}`}
          >
            <div className="absolute top-0 right-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-10">Livello 1</div>
            <TextEditorView />
          </div>
        )}

        {/* LIVELLO 2: La Mappa Spaziale */}
        {viewMode >= 2 && (
          <div 
            className={`h-full bg-gray-100 transition-all duration-300 ease-in-out relative 
              ${viewMode === 2 ? 'w-1/2' : 'w-full'}`}
          >
            <div className="absolute top-0 left-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-10">Livello 2</div>
            <SpatialMapView />
          </div>
        )}
        
      </div>
    </div>
  );
}