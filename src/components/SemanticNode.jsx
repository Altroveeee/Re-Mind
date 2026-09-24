import React, { useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../store/useStore';

export default function SemanticNode({ id, data }) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const removeNode = useStore((state) => state.removeNode);
  
  // 1. Estraiamo lo stato della visualizzazione dal cervello globale
  const viewMode = useStore((state) => state.viewMode); 
  
  const textareaRef = useRef(null);

  // Regola l'altezza al montaggio e ogni volta che il testo cambia
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset per calcolare la riduzione
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [data.label]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const MAX_WIDTH = 300; 
        const scale = Math.min(MAX_WIDTH / img.width, 1);
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const oldPixel = 0.2126 * pixels[idx] + 0.7152 * pixels[idx+1] + 0.0722 * pixels[idx+2];
            const newPixel = oldPixel < 128 ? 0 : 255;
            pixels[idx] = pixels[idx+1] = pixels[idx+2] = newPixel; pixels[idx+3] = 255;
            const err = Math.floor((oldPixel - newPixel) / 8);
            const addError = (ox, oy) => {
              if (x + ox >= 0 && x + ox < canvas.width && y + oy >= 0 && y + oy < canvas.height) {
                const errIdx = ((y + oy) * canvas.width + (x + ox)) * 4;
                pixels[errIdx] += err; pixels[errIdx+1] += err; pixels[errIdx+2] += err;
              }
            };
            addError(1, 0); addError(2, 0); addError(-1, 1); addError(0, 1); addError(1, 1); addError(0, 2);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        updateNodeData(id, { image: canvas.toDataURL('image/png') });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ---------------------------------------------------------
  // LA MUTAZIONE ASTRATTA (STATO 4)
  // Se lo slider è su "Sintesi", il codice si ferma qui e restituisce questo.
  // ---------------------------------------------------------
  if (viewMode === 4) {
    return (
      <div className="bg-white border-2 border-gray-900 p-2 font-bold uppercase text-[10px] tracking-widest text-center shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] transition-transform hover:-translate-y-[1px]">
        <Handle type="target" position={Position.Top} className="w-2 h-2 bg-gray-900 rounded-none border-none" />
        {data.title || 'NODO SENZA NOME'}
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-gray-900 rounded-none border-none" />
      </div>
    );
  }

  // ---------------------------------------------------------
  // RITORNO STANDARD (STATI 2 e 3)
  // Se lo slider NON è su 4, il codice ignora il blocco sopra e disegna la card completa.
  // ---------------------------------------------------------
  return (
    <div className="bg-white border-2 border-gray-900 rounded-md p-4 w-72 shadow-[4px_4px_0px_0px_rgba(17,24,39,1)] transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] group relative">
      
      {/* Bottone di Eliminazione Nodo (Hover) */}
      <button 
        onClick={() => removeNode(id)}
        className="absolute -top-3 -right-3 bg-red-500 text-white border-2 border-gray-900 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
        title="Elimina Nodo"
      >
        ✕
      </button>

      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-900 border-none rounded-sm" />
      
      <div className="flex flex-col gap-3">
        <input 
          type="text"
          placeholder="SENZA TITOLO"
          value={data.title || ''}
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          className="text-xs font-bold uppercase tracking-wider text-gray-900 border-b-2 border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none bg-transparent w-full transition-colors placeholder-gray-300"
        />

        {data.image && (
          <div className="relative w-full h-32 border-2 border-gray-900 overflow-hidden bg-white flex items-center justify-center group/image">
            <img 
              src={data.image} 
              alt="Rappresentazione semantica" 
              className="object-cover w-full h-full mix-blend-multiply pixelated" 
              style={{ imageRendering: 'pixelated' }}
            />
            {/* Bottone Eliminazione Immagine (Hover sull'immagine) */}
            <button 
              onClick={() => updateNodeData(id, { image: null })}
              className="absolute top-2 right-2 bg-white border-2 border-gray-900 text-gray-900 text-[10px] font-bold px-2 py-1 opacity-0 group-hover/image:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(17,24,39,1)] active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
            >
              RIMUOVI
            </button>
          </div>
        )}
        
        {/* Il Frammento ora è una Textarea editabile autoredimensionate */}
        <textarea 
          ref={textareaRef}
          value={data.label || ''}
          onChange={(e) => updateNodeData(id, { label: e.target.value })}
          className="text-sm text-gray-800 font-medium leading-snug break-words bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 p-1 -mx-1 rounded-sm w-full overflow-hidden transition-shadow"
          rows={1} // Partiamo da 1 riga, si espanderà da sola
        />

        <label className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 mt-1">
          <span>+ Allega Immagine</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-gray-900 border-none rounded-sm" />
    </div>
  );
}