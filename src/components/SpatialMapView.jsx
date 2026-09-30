import React from 'react';
import ReactFlow, { Background, Controls, ConnectionMode } from 'reactflow'; 
import 'reactflow/dist/style.css';
import SemanticNode from './SemanticNode';
import { useStore } from '../store/useStore';

const nodeTypes = {
  semantic: SemanticNode,
};

export default function SpatialMapView() {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);

return (
    <div className="w-full h-full relative">
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionMode={ConnectionMode.Loose} 
        
        // --- LA DIRETTIVA DI SELEZIONE MULTIPLA ---
        // multiSelectionKeyCode: Permette di cliccare più nodi tenendo premuto Shift
        // selectionKeyCode: Permette di disegnare il rettangolo di selezione tenendo premuto Shift e trascinando
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        
        fitView
        className="bg-[#f4f4f4]"
      >
        <Background color="#111827" gap={16} size={1} />
        <Controls 
          className="bg-white border-2 border-gray-900 rounded-none shadow-[4px_4px_0px_0px_rgba(17,24,39,1)]" 
        />
      </ReactFlow>
    </div>
  );
}