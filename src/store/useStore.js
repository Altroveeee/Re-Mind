import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';

export const useStore = create(
  persist(
    (set, get) => ({
      // 1. STATI STRUTTURALI
      blocks: {},
      setBlocks: (newBlocks) => set({ blocks: newBlocks }),

      viewMode: 2, 
      setViewMode: (mode) => set({ viewMode: mode }),
      
      showHighlights: true,
      toggleHighlights: () => set((state) => ({ showHighlights: !state.showHighlights })),

      // 2. L'EDITOR LINEARE
      editorContent: '<h1>Il Vuoto Artistico</h1><p>Inizia a scrivere il tuo flusso di pensiero qui...</p>',
      setEditorContent: (content) => set({ editorContent: content }),

      // 3. L'ARENA SPAZIALE (Dichiarati UNA sola volta)
      nodes: [],
      edges: [], 

      // 4. LOGICA DI MUTAZIONE NODI
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

      removeNode: (nodeId) => set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      })),

      syncNodeTexts: (updates) => set((state) => ({
        nodes: state.nodes.map((node) => 
          updates[node.id] !== undefined 
            ? { ...node, data: { ...node.data, label: updates[node.id] } } 
            : node
        )
      })),

      // 5. MOTORE MATEMATICO REACT FLOW
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
      name: 'remind-knowledge-base',
    }
  )
);