import React from 'react';
import { useStore } from '../store/useStore';

export default function ViewSlider() {
  const viewMode = useStore((state) => state.viewMode);
  const setViewMode = useStore((state) => state.setViewMode);

  return (
    <div className="flex flex-col items-center justify-center py-4 bg-white border-b-2 border-gray-900 w-full z-50">
      <div className="relative w-64 h-8 flex items-center">
        {/* La linea orizzontale */}
        <div className="absolute w-full h-[2px] bg-gray-900 top-1/2 -translate-y-1/2 z-0"></div>
        
        {/* I 4 stati generati dinamicamente */}
        {[1, 2, 3, 4].map((step) => {
          const isActive = viewMode === step;
          return (
            <button
              key={step}
              onClick={() => setViewMode(step)}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 transition-all focus:outline-none 
                ${isActive ? 'w-4 h-4 bg-white border-2 border-gray-900 rounded-none' : 'w-2 h-2 bg-gray-900 rounded-full hover:scale-150'}
              `}
              style={{ left: `${((step - 1) / 3) * 100}%` }}
              title={`Modalità ${step}`}
            />
          );
        })}
      </div>
      
      {/* Etichette Brutaliste */}
      <div className="flex justify-between w-64 mt-2 font-bold text-[10px] uppercase tracking-widest text-gray-900">
        <span className={viewMode === 1 ? 'opacity-100' : 'opacity-30'}>Testo</span>
        <span className={viewMode === 2 ? 'opacity-100' : 'opacity-30'}>Ibrido</span>
        <span className={viewMode === 3 ? 'opacity-100' : 'opacity-30'}>Nodi</span>
        <span className={viewMode === 4 ? 'opacity-100' : 'opacity-30'}>Sintesi</span>
      </div>
    </div>
  );
}