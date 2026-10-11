import React, { useEffect, useRef, useState } from 'react';
import TextEditorView from './components/TextEditorView';
import SpatialMapView, { useViewStore } from './components/SpatialMapView';
import GlossaryView from './components/GlossaryView';
import LibraryPanel from './components/LibraryPanel';
import ThemeEditor from './components/ThemeEditor';
import { readableTextColor } from './components/nodeColors';
import './dark.css';
import { fileToDocument } from './components/documentImport';
import { useStore, exportablePackage } from './store/useStore';
import { ChevronRight } from 'lucide-react';

const PANELS = [
  { id: 'editor', label: 'Testo' },
  { id: 'map', label: 'Nodi' },
  { id: 'glossary', label: 'Glossario' },
];

const IMAGE_MODES = [
  { id: 'attuale', label: 'Dither' },
  { id: 'bn', label: 'B&W' },
  { id: 'colore', label: 'Colored' },
];

const MenuButton = ({ label, open, onToggle, onHover, children }) => (
  <div className="relative" onMouseEnter={onHover}>
    <button
      onClick={onToggle}
      className={`px-1.5 py-0.5 text-xs font-semibold ${open ? 'bg-gray-900 text-white' : 'text-gray-900 hover:bg-gray-100'}`}
    >
      {label}
    </button>
    {open && (
      <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] bg-white border-2 border-gray-900">
        {children}
      </div>
    )}
  </div>
);

const MenuItem = ({ onClick, checked, children }) => (
  <button
    onClick={onClick}
    className="flex items-center w-full text-left px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-900 hover:text-white"
  >
    {checked !== undefined && <span className="w-4 inline-block">{checked ? '✓' : ''}</span>}
    {children}
  </button>
);

export default function App() {
  const activePanels = useStore((state) => state.activePanels) || [];
  const togglePanel = useStore((state) => state.togglePanel);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const bodyRef = useRef(null);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);

  const customThemes = useStore((state) => state.customThemes) || [];
  const [editingThemeId, setEditingThemeId] = useState(null);
  const [libraryWidth, setLibraryWidth] = useState(220);

  // La classe 'dark' sull'<html> accende la modalità scura, 'themed' una modalità personalizzata
  // (i colori scelti diventano variabili CSS, vedi dark.css)
  useEffect(() => {
    const root = document.documentElement;
    const custom = customThemes.find((t) => t.id === theme);
    const VARS = { '--ink': 'ink', '--paper': 'paper', '--canvas': 'canvas', '--workspace': 'workspace', '--map-bg': 'mapBg' };
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('themed', !!custom);
    Object.entries(VARS).forEach(([cssVar, key]) => {
      if (custom) root.style.setProperty(cssVar, custom[key]);
      else root.style.removeProperty(cssVar);
    });
    const fontName = (custom?.font || '').trim();
    root.classList.toggle('custom-font', !!fontName);
    if (fontName) root.style.setProperty('--ui-font', `"${fontName.replace(/"/g, '')}", ui-sans-serif, system-ui, sans-serif`);
    else root.style.removeProperty('--ui-font');
    root.style.colorScheme = custom ? (readableTextColor(custom.paper) === '#ffffff' ? 'dark' : 'light') : '';
  }, [theme, customThemes]);

  const startLibraryResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = libraryWidth;
    const onMouseMove = (moveEvent) => {
      setLibraryWidth(Math.max(160, Math.min(startWidth + (moveEvent.clientX - startX), 480)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleNewTheme = () => {
    setOpenMenu(null);
    setEditingThemeId(useStore.getState().addCustomTheme(`Personalizzata ${customThemes.length + 1}`));
  };
  const handleEditTheme = (id) => {
    setOpenMenu(null);
    setTheme(id);
    setEditingThemeId(id);
  };

  // Lo store si carica da IndexedDB: si mostra l'app solo a caricamento finito
  const [ready, setReady] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    if (ready) return;
    if (useStore.persist.hasHydrated()) { setReady(true); return; }
    return useStore.persist.onFinishHydration(() => setReady(true));
  }, [ready]);

  const [openMenu, setOpenMenu] = useState(null); // null | 'file' | 'edit'
  const [imageSubOpen, setImageSubOpen] = useState(false);
  const imageMode = useViewStore((state) => state.imageMode);
  const setImageMode = useViewStore((state) => state.setImageMode);
  const [glossaryWidth, setGlossaryWidth] = useState(30);
  const [mainSplitRatio, setMainSplitRatio] = useState(50);
  const mainAreaRef = useRef(null);

  const startGlossaryResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = glossaryWidth;
    const containerSize = bodyRef.current?.clientWidth || window.innerWidth;
    const onMouseMove = (moveEvent) => {
      let newWidth = startWidth - ((moveEvent.clientX - startX) / containerSize) * 100;
      // MARGINE DI SICUREZZA: Il glossario non scende sotto il 25% e non supera il 60%
      setGlossaryWidth(Math.max(25, Math.min(newWidth, 60)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startMainResize = (e) => {
    e.preventDefault();
    if (!mainAreaRef.current) return;
    const isVertical = activePanels.includes('glossary') && activePanels.includes('editor') && activePanels.includes('map');
    const startPos = isVertical ? e.clientY : e.clientX;
    const startRatio = mainSplitRatio;
    const rect = mainAreaRef.current.getBoundingClientRect();
    const containerSize = isVertical ? rect.height : rect.width;
    const onMouseMove = (moveEvent) => {
      let newRatio = startRatio + (((isVertical ? moveEvent.clientY : moveEvent.clientX) - startPos) / containerSize) * 100;
      // MARGINE DI SICUREZZA: Testo e Nodi non scendono mai sotto il 25% e non superano il 75%
      setMainSplitRatio(Math.max(25, Math.min(newRatio, 75)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // --- Pacchetto .remind: un solo file con mappa, testi e glossario ---
  const handleSavePackage = () => {
    const dataStr = JSON.stringify(exportablePackage(useStore.getState()), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remind-${new Date().toISOString().slice(0, 10)}.remind`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenPackage = (event) => {
    const file = event.target.files[0];
    event.target.value = null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        if (!raw || (!raw.documents && !raw.nodes && !raw.editorContent)) throw new Error('formato');
        if (!window.confirm('Aprire questo file sostituirà tutti i quaderni attuali. Continuare?')) return;
        useStore.getState().loadPackage(raw);
      } catch (error) { alert('File non valido: serve un pacchetto .remind (o un vecchio JSON di Re-mind).'); }
    };
    reader.readAsText(file);
  };

  const handleImportTexts = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = null;
    const errors = [];
    for (const file of files) {
      try {
        const doc = await fileToDocument(file);
        useStore.getState().addDocument(doc);
      } catch (err) { errors.push(err.message || String(err)); }
    }
    if (errors.length) alert(errors.join('\n'));
  };

  const hasEditor = activePanels.includes('editor');
  const hasMap = activePanels.includes('map');
  const hasGlossary = activePanels.includes('glossary');
  const isGlossaryShared = hasGlossary && (hasEditor || hasMap);
  const stackMainPanels = hasEditor && hasMap && hasGlossary;

  if (!ready) {
    return <div className="w-screen h-screen flex items-center justify-center bg-gray-100 text-xs font-bold uppercase tracking-widest text-gray-900">Caricamento…</div>;
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-100 overflow-hidden font-sans">
      {/* TOPBAR COMPATTA: logo + menu a sinistra, toggle dei pannelli al centro */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-3 h-10 bg-white border-b-2 border-gray-900 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-black tracking-tighter uppercase text-gray-900 leading-none">Re-mind</h1>

          <input type="file" accept=".remind,.json" ref={fileInputRef} className="hidden" onChange={handleOpenPackage} />
          <input type="file" accept=".pdf,.txt" multiple ref={textInputRef} className="hidden" onChange={handleImportTexts} />
          <MenuButton
            label="File"
            open={openMenu === 'file'}
            onToggle={() => setOpenMenu((m) => (m === 'file' ? null : 'file'))}
            onHover={() => openMenu && setOpenMenu('file')}
          >
            <MenuItem onClick={() => { setOpenMenu(null); textInputRef.current?.click(); }}>Importa testo o PDF…</MenuItem>
            <MenuItem onClick={() => { setOpenMenu(null); fileInputRef.current?.click(); }}>Apri pacchetto…</MenuItem>
            <MenuItem onClick={() => { setOpenMenu(null); handleSavePackage(); }}>Salva pacchetto (.remind)</MenuItem>
          </MenuButton>

          <MenuButton
            label="Modifica"
            open={openMenu === 'edit'}
            onToggle={() => { setImageSubOpen(false); setOpenMenu((m) => (m === 'edit' ? null : 'edit')); }}
            onHover={() => { if (openMenu) { setImageSubOpen(false); setOpenMenu('edit'); } }}
          >
            <div className="relative" onMouseEnter={() => setImageSubOpen(true)} onMouseLeave={() => setImageSubOpen(false)}>
              <button
                onClick={() => setImageSubOpen((o) => !o)}
                className="flex items-center justify-between w-full text-left px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-900 hover:text-white"
              >
                Immagini
                <ChevronRight size={12} strokeWidth={3} className="ml-3" />
              </button>
              {imageSubOpen && (
                <div className="absolute left-full -top-[2px] min-w-[130px] bg-white border-2 border-gray-900">
                  {IMAGE_MODES.map((m) => (
                    <MenuItem key={m.id} checked={imageMode === m.id} onClick={() => { setImageMode(m.id); setOpenMenu(null); setImageSubOpen(false); }}>
                      {m.label}
                    </MenuItem>
                  ))}
                </div>
              )}
            </div>
          </MenuButton>

          <MenuButton
            label="Vista"
            open={openMenu === 'view'}
            onToggle={() => { setImageSubOpen(false); setOpenMenu((m) => (m === 'view' ? null : 'view')); }}
            onHover={() => { if (openMenu) { setImageSubOpen(false); setOpenMenu('view'); } }}
          >
            <MenuItem checked={theme === 'dark'} onClick={() => { setTheme('dark'); setOpenMenu(null); }}>Modalità scura</MenuItem>
            <MenuItem checked={theme === 'light'} onClick={() => { setTheme('light'); setOpenMenu(null); }}>Modalità chiara</MenuItem>
            {customThemes.map((t) => (
              <div key={t.id} className="flex items-stretch">
                <div className="flex-1 min-w-0">
                  <MenuItem checked={theme === t.id} onClick={() => { setTheme(t.id); setOpenMenu(null); }}>
                    <span className="truncate">{t.name}</span>
                  </MenuItem>
                </div>
                <button
                  onClick={() => handleEditTheme(t.id)}
                  className="px-2.5 text-xs font-semibold text-gray-900 hover:bg-gray-900 hover:text-white"
                  title="Modifica i colori"
                >
                  ✎
                </button>
              </div>
            ))}
            <div className="border-t-2 border-gray-900" />
            <MenuItem onClick={handleNewTheme}>Personalizza…</MenuItem>
          </MenuButton>

          {openMenu && <div className="fixed inset-0 z-40" onMouseDown={() => { setOpenMenu(null); setImageSubOpen(false); }} />}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLibraryOpen((o) => !o)}
            className={`px-3 py-1 border-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest transition-all ${libraryOpen ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            Quaderni
          </button>
          <div className="w-px h-5 bg-gray-400" />
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => togglePanel(panel.id)}
              className={`px-3 py-1 border-2 border-gray-900 text-[9px] font-bold uppercase tracking-widest transition-all ${
                activePanels.includes(panel.id)
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-900 hover:bg-gray-50'
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>

        <div />
      </header>

      {/* BARRA STRUMENTI: l'editor vi inietta la sua toolbar (resta visibile, disattivata, anche con l'editor chiuso). */}
      <div id="global-toolbar-container" className="relative z-40 flex items-center px-2 min-h-[36px] bg-gray-100 border-b-2 border-gray-900 shrink-0">
      </div>

      <div className="flex flex-1 w-full overflow-hidden">
        {libraryOpen && (
          <>
            <LibraryPanel width={libraryWidth} onImportClick={() => textInputRef.current?.click()} />
            <div onMouseDown={startLibraryResize} className="h-full bg-gray-900 z-30 flex-none cursor-col-resize transition-all w-[2px] hover:w-[6px] active:w-[8px]" />
          </>
        )}
        <div ref={bodyRef} className="flex flex-1 min-w-0 h-full overflow-hidden relative bg-gray-200">

        <div
          ref={mainAreaRef}
          className={`flex overflow-hidden ${stackMainPanels ? 'flex-col' : 'flex-row'} ${(!hasEditor && !hasMap) ? 'hidden' : ''}`}
          style={{ width: isGlossaryShared ? `${100 - glossaryWidth}%` : '100%', flex: isGlossaryShared ? 'none' : '1 1 0%' }}
        >

          {/* MARGINE FISICO: min-w-[250px] e min-h-[250px] impediscono lo schiacciamento totale */}
          <div
            className={`relative bg-white overflow-hidden flex flex-col min-h-[250px] min-w-[250px] ${!hasEditor ? 'hidden' : ''}`}
            style={{ flex: hasMap && hasEditor ? `0 0 ${mainSplitRatio}%` : '1 1 0%' }}
          >
            <div className="absolute top-0 right-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-20 pointer-events-none">Testo</div>
            <TextEditorView />
          </div>

          {hasEditor && hasMap && (
            <div onMouseDown={startMainResize} className={`flex-none bg-gray-900 z-30 transition-all flex items-center justify-center group ${stackMainPanels ? 'h-[2px] hover:h-[6px] active:h-[8px] w-full cursor-row-resize' : 'w-[2px] hover:w-[6px] active:w-[8px] h-full cursor-col-resize'}`}>
              <div className={`bg-white transition-opacity opacity-0 group-hover:opacity-100 ${stackMainPanels ? 'w-8 h-[2px]' : 'h-8 w-[2px]'}`} />
            </div>
          )}

          {/* MARGINE FISICO: min-w-[250px] e min-h-[250px] */}
          {hasMap && (
            <div className="flex-1 relative bg-gray-50 overflow-hidden min-h-[250px] min-w-[250px]">
              <div className="absolute top-0 left-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-20 pointer-events-none">Nodi</div>
              <SpatialMapView key={activeProjectId} />
            </div>
          )}

        </div>

        {isGlossaryShared && (
          <div onMouseDown={startGlossaryResize} className="h-full bg-gray-900 z-30 flex-none cursor-col-resize transition-all flex flex-col justify-center items-center group w-[2px] hover:w-[6px] active:w-[8px]">
            <div className="h-8 w-[2px] bg-white transition-opacity opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* MARGINE FISICO: min-w-[250px] */}
        {hasGlossary && (
          <div className="h-full bg-white overflow-hidden relative min-w-[250px]" style={{ width: isGlossaryShared ? `${glossaryWidth}%` : '100%', flex: isGlossaryShared ? 'none' : '1 1 0%' }}>
            <div className="absolute top-0 left-0 bg-gray-900 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 z-20 pointer-events-none">Glossario</div>
            <GlossaryView />
          </div>
        )}

        </div>
      </div>

      {editingThemeId && <ThemeEditor id={editingThemeId} onClose={() => setEditingThemeId(null)} />}
    </div>
  );
}
