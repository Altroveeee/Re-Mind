import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { LIGHT_THEME, resolveTheme, mixHex } from '../components/nodeColors';

// ==========================================
// ARCHIVIAZIONE LOCALE: IndexedDB (con ripiego su localStorage).
// Se esiste ancora il vecchio salvataggio in localStorage, viene letto e migrato.
// ==========================================
const DB_NAME = 'remind-db';
const STORE_NAME = 'kv';

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbStorage = {
  getItem: async (name) => {
    try {
      const db = await openDB();
      const value = await new Promise((resolve, reject) => {
        const q = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(name);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      if (value != null) return value;
    } catch (e) { /* ripiego su localStorage */ }
    return localStorage.getItem(name);
  },
  setItem: async (name, value) => {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      try { localStorage.setItem(name, value); } catch (err) { /* spazio esaurito */ }
    }
  },
  removeItem: async (name) => {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* niente */ }
    try { localStorage.removeItem(name); } catch (e) { /* niente */ }
  },
};

const DEFAULT_CONTENT = '<h1>Il Vuoto Artistico</h1><p>Inizia a scrivere il tuo flusso di pensiero qui...</p>';
const normName = (s) => String(s || '').trim().toLowerCase();
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Cambiando palette (cambio di tema o modifica di un colore) i nodi già colorati seguono la palette:
// un nodo col 3° colore del vecchio tema prende il 3° colore del nuovo.
function remapNodeColors(state, oldPalette, newPalette) {
  const map = new Map();
  oldPalette.forEach((c, i) => {
    const to = newPalette[i]?.value;
    if (to && to.toLowerCase() !== c.value.toLowerCase()) map.set(c.value.toLowerCase(), to);
  });
  if (!map.size) return {};
  const mapNodes = (nodes) => (nodes || []).map((n) => {
    const to = n.data?.color && map.get(String(n.data.color).toLowerCase());
    return to ? { ...n, data: { ...n.data, color: to } } : n;
  });
  return {
    nodes: mapNodes(state.nodes),
    projects: state.projects.map((p) => ({ ...p, nodes: mapNodes(p.nodes) })),
  };
}

// Un "quaderno": i suoi testi, la sua mappa di nodi e il suo glossario.
const snapshotOf = (state) => ({
  documents: state.documents,
  activeDocId: state.activeDocId,
  sources: state.sources,
  nodes: state.nodes,
  edges: state.edges,
  glossaryTerms: state.glossaryTerms,
});

const emptyProject = (name) => {
  const docId = uid('doc');
  return {
    id: uid('proj'),
    name,
    documents: [{ id: docId, name: 'Testo 1', content: '<p></p>' }],
    activeDocId: docId,
    sources: { [docId]: 'Testo 1' },
    nodes: [],
    edges: [],
    glossaryTerms: [],
  };
};

// Porta i dati di un quaderno nella forma attuale: ogni nodo / termine è legato al proprio documento (docId).
function normalizeProject(raw = {}) {
  let documents = Array.isArray(raw.documents) ? raw.documents.filter((d) => d && d.id) : [];
  if (!documents.length) {
    documents = [{ id: uid('doc'), name: 'Testo 1', content: raw.editorContent ?? DEFAULT_CONTENT }];
  }
  const firstId = documents[0].id;
  const activeDocId = documents.some((d) => d.id === raw.activeDocId) ? raw.activeDocId : firstId;
  const sources = { ...(raw.sources || {}) };
  documents.forEach((d) => { sources[d.id] = d.name; });
  return {
    documents,
    activeDocId,
    sources,
    nodes: (raw.nodes || []).map((n) => (n.data?.docId ? n : { ...n, data: { ...n.data, docId: firstId } })),
    edges: raw.edges || [],
    glossaryTerms: (raw.glossaryTerms || []).map((t) => (t.docId ? t : { ...t, docId: firstId })),
  };
}

// Accetta il formato nuovo (con projects) e quelli vecchi (un solo insieme di testi/nodi = un solo quaderno).
export function normalizeRoot(raw = {}) {
  const projects = Array.isArray(raw.projects) && raw.projects.length
    ? raw.projects.map((p, i) => ({ id: p.id || uid('proj'), name: p.name || `Quaderno ${i + 1}`, color: p.color ?? null, ...normalizeProject(p) }))
    : [{ id: 'proj-1', name: raw.name || 'Quaderno 1', ...normalizeProject(raw) }];
  const active = projects.find((p) => p.id === raw.activeProjectId) || projects[0];
  return { projects, activeProjectId: active.id, ...snapshotOf(active) };
}

// Elenco dei quaderni con quello attivo aggiornato (i dati "vivi" stanno al livello principale dello store).
export const syncedProjects = (state) =>
  state.projects.map((p) => (p.id === state.activeProjectId ? { ...p, ...snapshotOf(state) } : p));

// Contenuto del pacchetto .remind: tutti i quaderni
export function exportablePackage(state) {
  return {
    app: 'remind',
    version: 3,
    activeProjectId: state.activeProjectId,
    projects: syncedProjects(state).map((p) => ({
      ...p,
      nodes: p.nodes.map(({ selected, dragging, ...n }) => n),
      edges: p.edges.map(({ selected, ...e }) => e),
    })),
  };
}

export const useStore = create(
  persist(
    (set, get) => ({
      // 1. STATI STRUTTURALI
      blocks: {},
      setBlocks: (newBlocks) => set({ blocks: newBlocks }),

      activePanels: ['editor', 'map'],

      togglePanel: (panelId) => set((state) => {
        const isCurrentlyActive = state.activePanels.includes(panelId);
        if (isCurrentlyActive) {
          if (state.activePanels.length === 1) return state;
          return { activePanels: state.activePanels.filter((id) => id !== panelId) };
        }
        return { activePanels: [...state.activePanels, panelId] };
      }),

      nodeViewMode: 'full',
      setNodeViewMode: (mode) => set({ nodeViewMode: mode }),

      // --- TEMA ('light' | 'dark' | id di una modalità personalizzata): la prima volta segue il sistema, poi ricorda la scelta ---
      theme: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
      setTheme: (theme) => set((state) => {
        if (theme === state.theme) return state;
        const oldPal = resolveTheme(state.theme, state.customThemes).nodeColors;
        const newPal = resolveTheme(theme, state.customThemes).nodeColors;
        return { theme, ...remapNodeColors(state, oldPal, newPal) };
      }),

      // Modalità personalizzate: { id, name, ink, paper, canvas, workspace, mapBg, nodeColors:[{name,value}] }
      customThemes: [],
      // Nuova modalità: parte da una copia di quella in uso e diventa quella attiva.
      addCustomTheme: (name) => {
        const st = get();
        const base = resolveTheme(st.theme, st.customThemes);
        const id = uid('theme');
        const theme = {
          id, name: name || 'Personalizzata',
          ink: base.ink, paper: base.paper, canvas: base.canvas, workspace: base.workspace, mapBg: base.mapBg,
          dots: base.dots || mixHex(base.ink, base.mapBg, 0.5), font: base.font || '',
          nodeColors: base.nodeColors.map((c) => ({ ...c })),
        };
        set((s) => ({ customThemes: [...s.customThemes, theme] }));
        get().setTheme(id);
        return id;
      },
      updateCustomTheme: (id, patch) => set((state) => {
        const t = state.customThemes.find((x) => x.id === id);
        if (!t) return state;
        const next = { ...t, ...patch };
        const extra = patch.nodeColors && state.theme === id ? remapNodeColors(state, t.nodeColors, next.nodeColors) : {};
        return { customThemes: state.customThemes.map((x) => (x.id === id ? next : x)), ...extra };
      }),
      removeCustomTheme: (id) => set((state) => {
        const customThemes = state.customThemes.filter((t) => t.id !== id);
        if (state.theme !== id) return { customThemes };
        const oldPal = resolveTheme(id, state.customThemes).nodeColors;
        return { customThemes, theme: 'light', ...remapNodeColors(state, oldPal, LIGHT_THEME.nodeColors) };
      }),

      // --- QUADERNI ---
      // I dati del quaderno attivo (documents, nodes, edges, glossaryTerms...) vivono qui sotto, al livello principale.
      // Gli altri quaderni stanno in `projects`; passando da uno all'altro si scambiano.
      projects: [{
        id: 'proj-1', name: 'Quaderno 1',
        documents: [{ id: 'doc-1', name: 'Documento 1', content: DEFAULT_CONTENT }],
        activeDocId: 'doc-1', sources: { 'doc-1': 'Documento 1' }, nodes: [], edges: [], glossaryTerms: [],
      }],
      activeProjectId: 'proj-1',
      // Cambia a ogni cambio di quaderno / apertura pacchetto: dice all'editor di ricaricarsi.
      epoch: 0,

      addProject: (name) => set((state) => {
        const projects = syncedProjects(state);
        const fresh = emptyProject(name || `Quaderno ${projects.length + 1}`);
        return { projects: [...projects, fresh], activeProjectId: fresh.id, ...snapshotOf(fresh), epoch: state.epoch + 1 };
      }),

      setActiveProject: (id) => set((state) => {
        if (id === state.activeProjectId) return state;
        const target = state.projects.find((p) => p.id === id);
        if (!target) return state;
        return { projects: syncedProjects(state), activeProjectId: id, ...snapshotOf(target), epoch: state.epoch + 1 };
      }),

      renameProject: (id, name) => set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, name } : p)),
      })),

      // Colore del quaderno / del testo nell'elenco Quaderni (null = nessun colore)
      setProjectColor: (id, color) => set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, color: color || null } : p)),
      })),
      setDocumentColor: (id, color) => set((state) => ({
        documents: state.documents.map((d) => (d.id === id ? { ...d, color: color || null } : d)),
      })),

      removeProject: (id) => set((state) => {
        if (state.projects.length <= 1) return state;
        const projects = syncedProjects(state).filter((p) => p.id !== id);
        if (id !== state.activeProjectId) return { projects };
        const target = projects[0];
        return { projects, activeProjectId: target.id, ...snapshotOf(target), epoch: state.epoch + 1 };
      }),

      // --- LIBRERIA DEI TESTI (del quaderno attivo) ---
      documents: [{ id: 'doc-1', name: 'Documento 1', content: DEFAULT_CONTENT }],
      activeDocId: 'doc-1',
      // Registro dei nomi: resta anche se il documento manca, così la mappa sa dire quale file serve.
      sources: { 'doc-1': 'Documento 1' },

      setActiveDoc: (id) => set((state) => (state.documents.some((d) => d.id === id) ? { activeDocId: id } : state)),

      // Aggiunge un documento. Se la mappa aspettava un file con lo stesso nome (nodi "orfani"),
      // il documento prende il suo id e i nodi si ricollegano da soli.
      addDocument: ({ name, content }) => {
        const st = get();
        const missing = Object.entries(st.sources).find(
          ([sid, sname]) => normName(sname) === normName(name) && !st.documents.some((d) => d.id === sid)
        );
        const id = missing ? missing[0] : `doc-${Date.now()}`;
        let html = content || '<p></p>';
        if (missing) {
          // Ripristino best-effort dei riquadri: cerca nel testo la frase di ogni nodo ricollegato
          st.nodes.filter((n) => n.data?.docId === id).forEach((n) => {
            const label = escapeHtml(n.data?.label || '');
            if (!label) return;
            const idx = html.indexOf(label);
            if (idx < 0) return;
            const span = `<span id="${n.id}" data-semantic-id="${n.id}" class="semantic-mark-node">${label}</span>`;
            html = html.slice(0, idx) + span + html.slice(idx + label.length);
          });
        }
        set((state) => ({
          documents: [...state.documents, { id, name, content: html }],
          activeDocId: id,
          sources: { ...state.sources, [id]: name },
        }));
        return id;
      },

      renameDocument: (id, name) => set((state) => ({
        documents: state.documents.map((d) => (d.id === id ? { ...d, name } : d)),
        sources: { ...state.sources, [id]: name },
      })),

      updateDocumentContent: (id, content) => set((state) => ({
        documents: state.documents.map((d) => (d.id === id ? { ...d, content } : d)),
      })),

      // Elimina il documento con i suoi nodi, collegamenti e termini di glossario.
      removeDocument: (id) => set((state) => {
        if (state.documents.length <= 1) return state;
        const documents = state.documents.filter((d) => d.id !== id);
        const goneNodeIds = new Set(state.nodes.filter((n) => n.data?.docId === id).map((n) => n.id));
        const sources = { ...state.sources };
        delete sources[id];
        return {
          documents,
          sources,
          activeDocId: state.activeDocId === id ? documents[0].id : state.activeDocId,
          nodes: state.nodes.filter((n) => !goneNodeIds.has(n.id)),
          edges: state.edges.filter((e) => !goneNodeIds.has(e.source) && !goneNodeIds.has(e.target)),
          glossaryTerms: state.glossaryTerms.filter((t) => t.docId !== id),
        };
      }),

      // Sostituisce tutto il lavoro con quello di un pacchetto .remind (o di un vecchio JSON)
      loadPackage: (raw) => set((state) => ({ ...normalizeRoot(raw), epoch: state.epoch + 1 })),

      // --- IL GLOSSARIO INDIPENDENTE ---
      glossaryTerms: [],
      addGlossaryTerm: (term, docId) => set((state) => {
        const owner = docId || state.activeDocId;
        if (state.glossaryTerms.some((t) => t.word === term && t.docId === owner)) return state;
        return {
          glossaryTerms: [...state.glossaryTerms, { id: `term-${Date.now()}`, word: term, definition: '', docId: owner }],
        };
      }),
      updateGlossaryDefinition: (id, definition) => set((state) => ({
        glossaryTerms: state.glossaryTerms.map((t) => (t.id === id ? { ...t, definition } : t)),
      })),
      removeGlossaryTerm: (id) => set((state) => ({
        glossaryTerms: state.glossaryTerms.filter((t) => t.id !== id),
      })),

      showHighlights: true,
      toggleHighlights: () => set((state) => ({ showHighlights: !state.showHighlights })),

      // 3. L'ARENA SPAZIALE
      nodes: [],
      edges: [],

      // 4. LOGICA DI MUTAZIONE NODI
      addNode: (node) => set((state) => ({
        nodes: [...state.nodes, { ...node, data: { ...node.data, docId: node.data?.docId || state.activeDocId } }],
      })),

      updateNodeData: (nodeId, newData) => set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        ),
      })),

      removeNode: (nodeId) => set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      })),

      syncNodeTexts: (updates) => set((state) => ({
        nodes: state.nodes.map((node) =>
          updates[node.id] !== undefined
            ? { ...node, data: { ...node.data, label: updates[node.id] } }
            : node
        ),
      })),

      // 5. MOTORE MATEMATICO REACT FLOW
      onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
      onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
      onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),
    }),
    {
      name: 'remind-knowledge-base',
      storage: createJSONStorage(() => idbStorage),
      // Si salva sempre l'elenco dei quaderni aggiornato; `epoch` non serve salvarlo.
      partialize: (state) => { const { epoch, ...rest } = state; return { ...rest, projects: syncedProjects(state) }; },
      merge: (persisted, current) => (persisted ? { ...current, ...persisted, ...normalizeRoot(persisted) } : current),
    }
  )
);
