import React, { useMemo, useCallback } from 'react';
import ReactFlow, { Background, Controls, ConnectionMode } from 'reactflow'; 
import 'reactflow/dist/style.css';
import SemanticNode from './SemanticNode';
import { useStore } from '../store/useStore';
import { create } from 'zustand';
import { Layout, AlignLeft, Minus } from 'lucide-react'; 

export const useViewStore = create((set) => ({
  viewMode: 'completa',
  setViewMode: (mode) => set({ viewMode: mode }),
}));

const nodeTypes = {
  semantic: SemanticNode,
};

export default function SpatialMapView() {
  const nodes = useStore((state) => state.nodes);
  const rawEdges = useStore((state) => state.edges);
  
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);
  
  const viewMode = useViewStore((state) => state.viewMode);
  const setViewMode = useViewStore((state) => state.setViewMode);

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  const edges = useMemo(() => {
    return rawEdges.map((edge) => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      let sHandle = edge.sourceHandle;
      let tHandle = edge.targetHandle;

      if (sourceNode && targetNode) {
        const dx = targetNode.position.x - sourceNode.position.x;
        const dy = targetNode.position.y - sourceNode.position.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          sHandle = dx > 0 ? 'right' : 'left';
          tHandle = dx > 0 ? 'left' : 'right';
        } else {
          sHandle = dy > 0 ? 'bottom' : 'top';
          tHandle = dy > 0 ? 'top' : 'bottom';
        }
      }

      const isSelected = edge.selected;

      return {
        ...edge,
        sourceHandle: sHandle,
        targetHandle: tHandle,
        style: {
          ...edge.style,
          stroke: isSelected ? '#9ca3af' : '#111827', 
          strokeWidth: 1.5,
        }
        // NESSUN MARKER. LA FRECCIA È STATA DISTRUTTA.
      };
    });
  }, [rawEdges, nodes]); 

  return (
    <div className="w-full h-full relative bg-[#f4f4f4]">
      <style>{`
        .react-flow__edge.selected .react-flow__edge-path,
        .react-flow__edge:focus .react-flow__edge-path,
        .react-flow__edge:focus-visible .react-flow__edge-path {
          stroke: #9ca3af !important;
        }
      `}</style>

      <div className="absolute top-4 right-4 z-50 flex border-2 border-gray-900 bg-white shadow-[4px_4px_0px_0px_rgba(17,24,39,1)]">
        <button onClick={() => setViewMode('completa')} className={`p-2 transition-colors ${viewMode === 'completa' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`} >
          <Layout size={16} strokeWidth={3} />
        </button>
        <div className="w-[2px] bg-gray-900 shrink-0"></div>
        <button onClick={() => setViewMode('testuale')} className={`p-2 transition-colors ${viewMode === 'testuale' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`} >
          <AlignLeft size={16} strokeWidth={3} />
        </button>
        <div className="w-[2px] bg-gray-900 shrink-0"></div>
        <button onClick={() => setViewMode('sintetica')} className={`p-2 transition-colors ${viewMode === 'sintetica' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`} >
          <Minus size={16} strokeWidth={3} />
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection} 
        connectionRadius={150} 
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