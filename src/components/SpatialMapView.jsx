import React from 'react';
import ReactFlow, { Background, Controls, ConnectionMode } from 'reactflow'; 
import 'reactflow/dist/style.css';
import SemanticNode from './SemanticNode';
import { useStore } from '../store/useStore';
import { create } from 'zustand';
import { Eye } from 'lucide-react'; // L'astrazione visiva che sostituisce le parole

// IL MICRO-CERVELLO DELLE VISTE
export const useViewStore = create((set) => ({
  viewMode: 'completa',
  setViewMode: (mode) => set({ viewMode: mode }),
}));

const nodeTypes = {
  semantic: SemanticNode,
};

export default function SpatialMapView() {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);
  
  const viewMode = useViewStore((state) => state.viewMode);
  const setViewMode = useViewStore((state) => state.setViewMode);

  return (
    <div className="w-full h-full relative bg-[#f4f4f4]">
      
      {/* --- LO SLIDER DELLA DENSITA' VISIVA --- */}
      <div className="absolute top-4 right-4 z-50 flex items-center h-10 bg-white border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(17,24,39,1)]">
        
        {/* L'Icona*/}
        <div className="flex items-center justify-center w-10 h-full border-r-2 border-gray-900 bg-gray-100" title="Livello di Astrazione">
          <Eye size={18} strokeWidth={2.5} className="text-gray-900" />
        </div>
        
        {/* Slider */}
        <div className="relative w-28 h-full flex items-center mx-4">
          
          <div className="absolute w-full h-[2px] bg-gray-900" />
          
          <div className="absolute inset-0 flex justify-between items-center">
            <div className="w-2.5 h-2.5 bg-gray-900 rounded-full" />
            <div className="w-2.5 h-2.5 bg-gray-900 rounded-full" />
            <div className="w-2.5 h-2.5 bg-gray-900 rounded-full" />
          </div>
          
          <div 
            className="absolute w-[18px] h-[18px] bg-white border-[3px] border-gray-900 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-none z-10"
            style={{
              left: viewMode === 'completa' ? '0' : viewMode === 'testuale' ? '50%' : '100%',
              transform: viewMode === 'completa' ? 'translateX(0)' : viewMode === 'testuale' ? 'translateX(-50%)' : 'translateX(-100%)'
            }}
          />
          
          <div className="absolute inset-0 flex z-20">
            <div className="flex-1 cursor-pointer" onClick={() => setViewMode('completa')} title="Densità Massima" />
            <div className="flex-1 cursor-pointer" onClick={() => setViewMode('testuale')} title="Rimozione Media" />
            <div className="flex-1 cursor-pointer" onClick={() => setViewMode('sintetica')} title="Astrazione Strutturale" />
          </div>

        </div>
      </div>

      {/* --- IL MOTORE DELLA MAPPA --- */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionMode={ConnectionMode.Loose} 
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        fitView
      >
        <Background color="#111827" gap={16} size={1} />
        <Controls className="bg-white border-2 border-gray-900 rounded-none shadow-[4px_4px_0px_0px_rgba(17,24,39,1)]" />
      </ReactFlow>
    </div>
  );
}