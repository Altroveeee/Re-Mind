import React, { useRef, useState } from 'react';
import TextEditorView from './components/TextEditorView';
import SpatialMapView from './components/SpatialMapView'; 
import ViewSlider from './components/ViewSlider';
import GlossaryView from './components/GlossaryView';
import { useStore } from './store/useStore';

export default function App() {
  const activePanels = useStore((state) => state.activePanels) || [];
  const fileInputRef = useRef(null);

  const [glossaryWidth, setGlossaryWidth] = useState(30);
  const [mainSplitRatio, setMainSplitRatio] = useState(50);
  const mainAreaRef = useRef(null);

  const startGlossaryResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = glossaryWidth;
    const containerSize = window.innerWidth;
    const onMouseMove = (moveEvent) => {
      let newWidth = startWidth - ((moveEvent.clientX - startX) / containerSize) * 100; 
      // MARGINE DI SICUREZZA: Il glossario non scende sotto il 25% e non supera il 60%
      setGlossaryWidth(Math.max(25, Math.min(newWidth, 60)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startMainResize = (e) => {
    e.preventDefault();
    if (!mainAreaRef.current) return;
    const isVertical = activePanels.includes('glossary') && activePanels.includes('editor') && activePanels.includes('map');
    const startPos = isVertical ? e.clientY : e.clientX;
    const startRatio = mainSplitRatio;
    const rect = mainAreaRef.current.getBoundingClientRect();
    const containerSize = isVertical ? rect.height : rect.width;
    const onMouseMove = (moveEvent) => {
      let newRatio = startRatio + (((isVertical ? moveEvent.clientY : moveEvent.clientX) - startPos) / containerSize) * 100;
      // MARGINE DI SICUREZZA: Testo e Nodi non scendono mai sotto il 25% e non superano il 75%
      setMainSplitRatio(Math.max(25, Math.min(newRatio, 75)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

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

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try { useStore.setState(JSON.parse(e.target.result)); } catch (error) { alert("File JSON non valido."); }
    };
    reader.readAsText(file);
    event.target.value = null; 
  };

  const hasEditor = activePanels.includes('editor');
  const hasMap = activePanels.includes('map');
  const hasGlossary = activePanels.includes('glossary');
  const isGlossaryShared = hasGlossary && (hasEditor || hasMap);
  const stackMainPanels = hasEditor && hasMap && hasGlossary;

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-100 overflow-hidden font-sans">
      <header className="flex items-center justify-between p-4 bg-white border-b-2 border-gray-900 z-50 shrink-0">
        <h1 className="text-2xl font-black tracking-tighter uppercase text-gray-900">Re-mind</h1>
        <div className="flex gap-4">
          <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleImport} />
          <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-white border-2 border-gray-900 text-[10px] font-bold uppercase tracking-widest text-gray-900 hover:bg-gray-100 transition-all shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none">Carica Mappa</button>
          <button onClick={handleExport} className="px-4 py-2 bg-gray-900 text-white border-2 border-gray-900 text-[10px] font-bold uppercase tracking-widest hover:bg-gray-800 transition-all shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none">Esporta JSON</button>
        </div>
      </header>

      <ViewSlider />
      
      <div className="flex flex-1 w-full overflow-hidden relative bg-gray-200">
        
        <div 
          ref={mainAreaRef}
          className={`flex overflow-hidden ${stackMainPanels ? 'flex-col' : 'flex-row'} ${(!hasEditor && !hasMap) ? 'hidden' : ''}`}
          style={{ width: isGlossaryShared ? `${100 - glossaryWidth}%` : '100%', flex: isGlossaryShared ? 'none' : '1 1 0%' }}
        >
          
          {/* MARGINE FISICO: min-w-[250px] e min-h-[250px] impediscono lo schiacciamento totale */}
          <div 
            className={`relative bg-white overflow-hidden flex flex-col min-h-[250px] min-w-[250px] ${!hasEditor ? 'hidden' : ''}`}
            style={{ flex: hasMap && hasEditor ? `0 0 ${mainSplitRatio}%` : '1 1 0%' }}
          >
            {/* L'id global-toolbar-container permette al TextEditorView di iniettare la sua toolbar qui in alto */}
            <div id="global-toolbar-container" className="w-full shrink-0 z-30 bg-white"></div>
            <div className="absolute top-0 right-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-20 pointer-events-none">Testo</div>
            <TextEditorView />
          </div>

          {hasEditor && hasMap && (
            <div onMouseDown={startMainResize} className={`flex-none bg-gray-900 z-30 transition-all flex items-center justify-center group ${stackMainPanels ? 'h-[2px] hover:h-[6px] active:h-[8px] w-full cursor-row-resize' : 'w-[2px] hover:w-[6px] active:w-[8px] h-full cursor-col-resize'}`}>
              <div className={`bg-white transition-opacity opacity-0 group-hover:opacity-100 ${stackMainPanels ? 'w-8 h-[2px]' : 'h-8 w-[2px]'}`} />
            </div>
          )}

          {/* MARGINE FISICO: min-w-[250px] e min-h-[250px] */}
          {hasMap && (
            <div className="flex-1 relative bg-gray-50 overflow-hidden min-h-[250px] min-w-[250px]">
              <div className="absolute top-0 left-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-20 pointer-events-none">Nodi</div>
              <SpatialMapView />
            </div>
          )}
          
        </div>

        {isGlossaryShared && (
          <div onMouseDown={startGlossaryResize} className="h-full bg-gray-900 z-30 flex-none cursor-col-resize transition-all flex flex-col justify-center items-center group w-[2px] hover:w-[6px] active:w-[8px]">
            <div className="h-8 w-[2px] bg-white transition-opacity opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* MARGINE FISICO: min-w-[250px] */}
        {hasGlossary && (
          <div className="h-full bg-white overflow-hidden relative min-w-[250px]" style={{ width: isGlossaryShared ? `${glossaryWidth}%` : '100%', flex: isGlossaryShared ? 'none' : '1 1 0%' }}>
            <div className="absolute top-0 left-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-20 pointer-events-none">Glossario</div>
            <GlossaryView />
          </div>
        )}
        
      </div>
    </div>
  );
}