import React, { useRef } from 'react';
import TextEditorView from './components/TextEditorView';
import SpatialMapView from './components/SpatialMapView';
import { useStore } from './store/useStore';

export default function App() {
  // Un riferimento invisibile all'input file nascosto
  const fileInputRef = useRef(null);

  // --- LOGICA DI ESPORTAZIONE ---
  const handleExport = () => {
    const currentState = useStore.getState();
    // Serializza lo stato in una stringa formattata
    const dataStr = JSON.stringify(currentState, null, 2);
    // Crea un oggetto binario (Blob) fingendo che sia un file fisico
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Simula il click su un link invisibile per forzare il download
    const a = document.createElement('a');
    a.href = url;
    a.download = `remind-mappa-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- LOGICA DI IMPORTAZIONE ---
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedState = JSON.parse(e.target.result);
        // L'atto di forza: sovrascrive interamente la memoria attuale
        useStore.setState(importedState);
      } catch (error) {
        alert("Il file è corrotto o non è un artefatto JSON di Re-mind.");
      }
    };
    reader.readAsText(file);
    
    // Resetta l'input per permettere il ricaricamento dello stesso file
    event.target.value = null; 
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="mb-6 max-w-[1400px] mx-auto flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Re-mind</h1>
        
        {/* Pannello di Controllo File */}
        <div className="flex gap-3">
          {/* L'input nativo è orrendo, lo nascondiamo */}
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleImport} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            Carica Mappa
          </button>
          <button 
            onClick={handleExport}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm"
          >
            Esporta JSON
          </button>
        </div>
      </header>
      
      {/* Il layout diviso a metà rimane inalterato */}
      <main className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">Livello 1: Testo Lineare</span>
          </div>
          <TextEditorView />
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">Livello 2: Mappa Spaziale</span>
          </div>
          <SpatialMapView />
        </section>
      </main>
    </div>
  );
}