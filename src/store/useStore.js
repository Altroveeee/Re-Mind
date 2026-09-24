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

      editorContent: '<h1>Il Vuoto Artistico</h1><p>Inizia a scrivere il tuo flusso di pensiero qui...</p>',
        setEditorContent: (content) => set({ editorContent: content }),

        // MACCHINA A STATI DEL LAYOUT
        // 1 = Solo Testo, 2 = Split, 3 = Solo Mappa, 4 = Solo Mappa Astratta
        viewMode: 2, 
        setViewMode: (mode) => set({ viewMode: mode }),
        
        showHighlights: true,
        toggleHighlights: () => set((state) => ({ showHighlights: !state.showHighlights })),

        nodes: [],

      editorContent: '<h1>Il Vuoto Artistico</h1><p>Inizia a scrivere il tuo flusso di pensiero qui...</p>',
        setEditorContent: (content) => set({ editorContent: content }),

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

      //Elimina il nodo e le sue connessioni
      removeNode: (nodeId) => set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      })),

      // Sincronizzazione massiva del testo dall'editor ai nodi
      syncNodeTexts: (updates) => set((state) => ({
        nodes: state.nodes.map((node) => 
          updates[node.id] !== undefined 
            ? { ...node, data: { ...node.data, label: updates[node.id] } } 
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