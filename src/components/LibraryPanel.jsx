import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Plus, Upload } from 'lucide-react';
import { readableTextColor } from './nodeColors';
import { useNodeColors } from './useThemeColors';

// Elenco dei quaderni. Il quaderno attivo si apre e mostra i suoi testi.
// La larghezza arriva da App (il pannello si ridimensiona dal bordo destro). Quaderni e testi si possono colorare.
export default function LibraryPanel({ onImportClick, width = 220 }) {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const documents = useStore((s) => s.documents);
  const activeDocId = useStore((s) => s.activeDocId);
  const nodes = useStore((s) => s.nodes);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const addProject = useStore((s) => s.addProject);
  const renameProject = useStore((s) => s.renameProject);
  const removeProject = useStore((s) => s.removeProject);
  const setProjectColor = useStore((s) => s.setProjectColor);
  const setActiveDoc = useStore((s) => s.setActiveDoc);
  const addDocument = useStore((s) => s.addDocument);
  const renameDocument = useStore((s) => s.renameDocument);
  const removeDocument = useStore((s) => s.removeDocument);
  const setDocumentColor = useStore((s) => s.setDocumentColor);
  const moveDocument = useStore((s) => s.moveDocument);
  const paletteColors = useNodeColors();
  const [dragId, setDragId] = useState(null); // testo che si sta trascinando
  const [overId, setOverId] = useState(null); // testo su cui è sopra il mouse
  const [editing, setEditing] = useState(null); // 'p:<id>' | 'd:<id>'
  // Cosa è "selezionato" nell'elenco: il quaderno oppure uno dei suoi testi (uno solo alla volta)
  const [focus, setFocus] = useState('doc'); // 'project' | 'doc'
  const [palette, setPalette] = useState(null); // 'p:<id>' | 'd:<id>': riga con la tavolozza aperta

  const projectNodeCount = (p) => (p.id === activeProjectId ? nodes.length : (p.nodes || []).length);
  const docNodeCount = (id) => nodes.filter((n) => n.data?.docId === id).length;

  const handleNewProject = () => {
    addProject();
    setEditing('p:' + useStore.getState().activeProjectId);
  };

  const handleDeleteProject = (e, p) => {
    e.stopPropagation();
    if (projects.length <= 1) return;
    const n = projectNodeCount(p);
    const msg = `Eliminare il quaderno «${p.name}» con tutti i suoi testi${n ? ` e i suoi ${n} nodi` : ''}?`;
    if (window.confirm(msg)) removeProject(p.id);
  };

  const handleDeleteDoc = (e, doc) => {
    e.stopPropagation();
    if (documents.length <= 1) return;
    const n = docNodeCount(doc.id);
    if (window.confirm(`Eliminare «${doc.name}»${n ? ` insieme ai suoi ${n} nodi` : ''}?`)) removeDocument(doc.id);
  };

  const renameInput = (current, onCommit) => (
    <input
      autoFocus
      defaultValue={current}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => { onCommit(e.target.value.trim() || current); setEditing(null); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(null); }}
      className="w-full min-w-0 px-1 outline-none bg-white text-gray-900"
    />
  );

  // Pallino che apre la tavolozza di una riga
  const colorDot = (key, color) => (
    <button
      onClick={(e) => { e.stopPropagation(); setPalette((cur) => (cur === key ? null : key)); }}
      className="w-3 h-3 rounded-full border-2 border-current opacity-0 group-hover:opacity-100 shrink-0"
      style={color ? { backgroundColor: color } : undefined}
      title="Colore"
    />
  );

  // Tavolozza: nessun colore, i colori dei nodi e un colore a piacere
  const palettePicker = (key, current, onPick) => palette === key && (
    <div className="flex flex-wrap items-center gap-[7px] px-3 py-2 bg-white border-t-2 border-gray-900" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => { onPick(null); setPalette(null); }}
        title="Nessun colore"
        className="w-4 h-4 rounded-full border-2 border-gray-900 bg-white cursor-pointer hover:scale-110 transition-transform"
      />
      {paletteColors.map((c) => (
        <button
          key={c.name}
          onClick={() => { onPick(c.value); setPalette(null); }}
          title={c.name}
          className={`w-4 h-4 rounded-full cursor-pointer hover:scale-110 transition-transform ${current === c.value ? 'ring-2 ring-gray-900 ring-offset-2' : ''}`}
          style={{ backgroundColor: c.value }}
        />
      ))}
      <input
        type="color"
        value={current || '#ffffff'}
        onChange={(e) => onPick(e.target.value)}
        title="Colore personalizzato"
        className="w-4 h-4 p-0 border-2 border-gray-900 bg-transparent cursor-pointer"
      />
    </div>
  );

  const btn = 'flex items-center justify-center gap-1 flex-1 px-2 py-1 border-2 border-gray-900 bg-white text-gray-900 text-[9px] font-bold uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-colors';

  return (
    <aside style={{ width }} className="shrink-0 h-full bg-white flex flex-col overflow-hidden">
      <style>{`
        @keyframes lib-drop {
          from { transform: translateY(calc(-100% * var(--n))); }
          to { transform: translateY(0); }
        }
        .lib-drop { animation: lib-drop 0.32s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        @media (prefers-reduced-motion: reduce) { .lib-drop { animation: none; } }
      `}</style>
      <div className="px-3 py-2 border-b-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest text-gray-900">Quaderni</div>

      <div className="flex gap-1 p-2 border-b-2 border-gray-900">
        <button className={btn} onClick={handleNewProject} title="Nuovo quaderno">
          <Plus size={12} strokeWidth={3} /> Nuovo
        </button>
        <button className={btn} onClick={onImportClick} title="Importa PDF o TXT nel quaderno aperto">
          <Upload size={12} strokeWidth={3} /> Importa
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.map((p) => {
          const active = p.id === activeProjectId;
          const pc = p.color || null;
          return (
            <div key={p.id} className="border-b-2 border-gray-900">
              <div
                onClick={() => { setActiveProject(p.id); setFocus('project'); }}
                onDoubleClick={() => setEditing('p:' + p.id)}
                className={`group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-xs font-bold ${active ? 'border-b-2 border-gray-900' : ''} ${pc ? '' : (active && focus === 'project' ? 'bg-gray-900 text-white' : 'text-gray-900 hover:bg-gray-100')}`}
                style={pc ? { backgroundColor: pc, color: readableTextColor(pc) } : undefined}
                title="Doppio clic per rinominare"
              >
                {editing === 'p:' + p.id
                  ? renameInput(p.name, (v) => renameProject(p.id, v))
                  : <span className="truncate">{p.name}</span>}
                <span className="flex items-center gap-2 shrink-0">
                  {colorDot('p:' + p.id, pc)}
                  <span className={`text-[10px] ${pc ? 'opacity-60' : (active && focus === 'project' ? 'text-gray-300' : 'text-gray-400')}`}>{projectNodeCount(p)}</span>
                  {projects.length > 1 && (
                    <button onClick={(e) => handleDeleteProject(e, p)} className="opacity-0 group-hover:opacity-100 px-1 font-bold hover:text-red-500" title="Elimina quaderno">✕</button>
                  )}
                </span>
              </div>
              {palettePicker('p:' + p.id, pc, (c) => setProjectColor(p.id, c))}

              {active && (
                <div className="bg-white overflow-hidden border-l-4 border-gray-900">
                  {documents.map((doc, i) => {
                    const isDoc = doc.id === activeDocId && focus === 'doc';
                    const dc = doc.color || null;
                    return (
                      <div
                        key={doc.id}
                        className={`lib-drop relative bg-white border-b-2 border-gray-900 ${dragId === doc.id ? 'opacity-40' : ''}`}
                        style={{ '--n': i + 1, zIndex: documents.length - i, animationDelay: `${i * 90}ms` }}
                        draggable={editing !== 'd:' + doc.id}
                        onDragStart={(e) => { setDragId(doc.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(doc.id); } }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId && dragId !== doc.id) moveDocument(dragId, i);
                          setDragId(null); setOverId(null);
                        }}
                        onDragEnd={() => { setDragId(null); setOverId(null); }}
                      >
                        {/* Linea che mostra dove cadrà il testo */}
                        {overId === doc.id && dragId && dragId !== doc.id && (
                          <div
                            className="absolute left-0 right-0 h-[3px] bg-gray-900 z-20 pointer-events-none"
                            style={documents.findIndex((d) => d.id === dragId) < i ? { bottom: 0 } : { top: 0 }}
                          />
                        )}
                        <div
                          onClick={() => { setActiveDoc(doc.id); setFocus('doc'); }}
                          onDoubleClick={() => setEditing('d:' + doc.id)}
                          className={`group flex items-center justify-between gap-2 pl-6 pr-3 py-1.5 cursor-pointer text-[11px] font-semibold ${isDoc && dc ? 'shadow-[inset_6px_0_0_0_var(--ink)]' : ''} ${dc ? '' : (isDoc ? 'bg-gray-900 text-white' : 'text-gray-900 hover:bg-gray-100')}`}
                          style={dc ? { backgroundColor: dc, color: readableTextColor(dc) } : undefined}
                          title="Doppio clic per rinominare"
                        >
                          {editing === 'd:' + doc.id
                            ? renameInput(doc.name, (v) => renameDocument(doc.id, v))
                            : <span className="truncate">{doc.name}</span>}
                          <span className="flex items-center gap-2 shrink-0">
                            {colorDot('d:' + doc.id, dc)}
                            {docNodeCount(doc.id) > 0 && <span className={`text-[10px] ${dc ? 'opacity-60' : (isDoc ? 'text-gray-300' : 'text-gray-400')}`}>{docNodeCount(doc.id)}</span>}
                            {documents.length > 1 && (
                              <button onClick={(e) => handleDeleteDoc(e, doc)} className="opacity-0 group-hover:opacity-100 px-1 font-bold hover:text-red-500" title="Elimina testo">✕</button>
                            )}
                          </span>
                        </div>
                        {palettePicker('d:' + doc.id, dc, (c) => setDocumentColor(doc.id, c))}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => addDocument({ name: `Testo ${documents.length + 1}`, content: '<p></p>' })}
                    className="lib-drop relative bg-white w-full text-left pl-6 pr-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900"
                    style={{ '--n': documents.length + 1, zIndex: 0, animationDelay: `${documents.length * 90}ms` }}
                  >
                    + Nuovo testo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
