import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';

export const useStore = create(
  persist(
    (set, get) => ({
      // 1. STATI STRUTTURALI
      blocks: {},
      setBlocks: (newBlocks) => set({ blocks: newBlocks }),

      // 1. STATI STRUTTURALI DINAMICI
      activePanels: ['editor', 'map'], // Di default partiamo con Testo e Nodi
      
      togglePanel: (panelId) => set((state) => {
        const isCurrentlyActive = state.activePanels.includes(panelId);
        
        if (isCurrentlyActive) {
          // Impedisce all'utente di chiudere tutti i pannelli e rimanere a fissare il vuoto
          if (state.activePanels.length === 1) return state; 
          return { activePanels: state.activePanels.filter(id => id !== panelId) };
        } else {
          // Aggiunge il nuovo pannello all'array
          return { activePanels: [...state.activePanels, panelId] };
        }
      }),

      // --- FILTRI VISIVI DEI NODI (L'ex Sintesi) ---
      // 'full' (tutto), 'no-images' (senza immagini), 'titles-only' (solo titoli)
      nodeViewMode: 'full',
      setNodeViewMode: (mode) => set({ nodeViewMode: mode }),

      // --- IL GLOSSARIO INDIPENDENTE ---
      glossaryTerms: [],
      addGlossaryTerm: (term) => set((state) => {
        // Evita duplicati se la parola esiste già
        if (state.glossaryTerms.some(t => t.word === term)) return state;
        return {
          glossaryTerms: [...state.glossaryTerms, { id: `term-${Date.now()}`, word: term, definition: '' }]
        };
      }),
      updateGlossaryDefinition: (id, definition) => set((state) => ({
        glossaryTerms: state.glossaryTerms.map(t => t.id === id ? { ...t, definition } : t)
      })),
      removeGlossaryTerm: (id) => set((state) => ({
        glossaryTerms: state.glossaryTerms.filter(t => t.id !== id)
      })),
      
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