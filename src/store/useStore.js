import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // <-- Il siero della memoria
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';

export const useStore = create(
  persist(
    (set, get) => ({
      blocks: {},
      setBlocks: (newBlocks) => set({ blocks: newBlocks }),

      nodes: [], 
      edges: [], 

      addNode: (node) => set((state) => ({ 
        nodes: [...state.nodes, node] 
      })),

      updateNodeData: (nodeId, newData) => set((state) => ({
        nodes: state.nodes.map((node) => 
          node.id === nodeId 
            ? { ...node, data: { ...node.data, ...newData } } 
            : node
        )
      })),

      onNodesChange: (changes) => set({
        nodes: applyNodeChanges(changes, get().nodes),
      }),

      onEdgesChange: (changes) => set({
        edges: applyEdgeChanges(changes, get().edges),
      }),
      
      onConnect: (connection) => set({
        edges: addEdge(connection, get().edges),
      }),
    }),
    {
      name: 'remind-knowledge-base', // Il nome del database nel browser
    }
  )
);