import React from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../store/useStore';

export default function SemanticNode({ id, data }) {
  // Estraiamo la nuova funzione dal cervello globale
  const updateNodeData = useStore((state) => state.updateNodeData);

  // Converte l'immagine in una stringa di testo (Base64) salvabile in JSON
const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Crea una tela invisibile in memoria
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Riduzione brutale per esaltare i pixel e polverizzare il peso
        const MAX_WIDTH = 300; 
        const scale = Math.min(MAX_WIDTH / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Algoritmo di Atkinson applicato in fase di ingestione
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const oldPixel = 0.2126 * data[idx] + 0.7152 * data[idx+1] + 0.0722 * data[idx+2];
            const newPixel = oldPixel < 128 ? 0 : 255;
            data[idx] = data[idx+1] = data[idx+2] = newPixel;
            data[idx+3] = 255; // Alpha
            
            const err = Math.floor((oldPixel - newPixel) / 8);
            const addError = (ox, oy) => {
              if (x + ox >= 0 && x + ox < canvas.width && y + oy >= 0 && y + oy < canvas.height) {
                const errIdx = ((y + oy) * canvas.width + (x + ox)) * 4;
                data[errIdx] += err; data[errIdx+1] += err; data[errIdx+2] += err;
              }
            };
            addError(1, 0); addError(2, 0); addError(-1, 1); addError(0, 1); addError(1, 1); addError(0, 2);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Estrae un PNG 1-bit ultraleggero e lo salva in Zustand
        const optimizedBase64 = canvas.toDataURL('image/png');
        updateNodeData(id, { image: optimizedBase64 });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-white border-2 border-gray-900 rounded-md p-4 w-72 shadow-[4px_4px_0px_0px_rgba(17,24,39,1)] transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] group">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-900 border-none rounded-sm" />
      
      <div className="flex flex-col gap-3">
        {/* 1. Titolo Editabile */}
        <input 
          type="text"
          placeholder="SENZA TITOLO"
          value={data.title || ''}
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          className="text-xs font-bold uppercase tracking-wider text-gray-900 border-b-2 border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none bg-transparent w-full transition-colors placeholder-gray-300"
        />
        {/* 2. Resa dell'Immagine Pre-Processata (Ultraleggera) */}
                {data.image && (
                <div className="relative w-full h-32 border-2 border-gray-900 overflow-hidden bg-white flex items-center justify-center">
                    <img 
                    src={data.image} 
                    alt="Rappresentazione semantica" 
                    className="object-cover w-full h-full mix-blend-multiply pixelated" 
                    style={{ imageRendering: 'pixelated' }} // Forza il browser a non sfocare i pixel
                    />
                </div>
                )}
        
        {/* 3. Il Frammento di Testo Estratto */}
        <p className="text-sm text-gray-800 font-medium leading-snug break-words">
          {data.label}
        </p>

        {/* 4. Caricatore Immagine (Appare solo se ci passi sopra col mouse) */}
        <label className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 mt-1">
          <span>+ Allega Immagine</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-gray-900 border-none rounded-sm" />
    </div>
  );
}