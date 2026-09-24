import React from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from '../store/useStore';
import SemanticNode from './SemanticNode'; // <-- 1. Importa il design

// 2. Crea il dizionario dei nodi personalizzati
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
    <div className="w-full h-full min-h-[70vh] bg-white border border-gray-200 rounded-lg shadow-sm">
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes} // <-- 3. Passa il dizionario a React Flow
        fitView
      >
        <Background color="#f3f4f6" gap={16} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}