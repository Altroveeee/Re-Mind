import React, { useRef, useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, useStore as useReactFlowStore } from 'reactflow';
import { useStore } from '../store/useStore';
import { useViewStore } from './SpatialMapView';
import { RefreshCw, X } from 'lucide-react';

//selezione nodi
const SelectionBrackets = ({ selected }) => (
  <div className={`absolute -inset-[15px] pointer-events-none transition-opacity duration-150 z-0 ${selected ? 'opacity-100' : 'opacity-0'}`}>
    <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-gray-900" />
    <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-gray-900" />
    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-gray-900" />
    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-gray-900" />
  </div>
);

// ==========================================
// TERMINALI STATICI: Perno Centrale e Anti-Sovrascrittura
// ==========================================
const StaticHandle = ({ position, id, nodeId, isReceiving }) => {
  const edges = useReactFlowStore((state) => state.edges);
  
  const connectionNodeId = useReactFlowStore((state) => state.connectionNodeId);
  const connectionHandleId = useReactFlowStore((state) => state.connectionHandleId);
  const isConnectingFromHere = connectionNodeId === nodeId && connectionHandleId === id;
  
  const isSourceConnected = edges.some(e => e.source === nodeId && e.sourceHandle === id);
  const isTargetConnected = edges.some(e => e.target === nodeId && e.targetHandle === id);
  
  const isTriangle = isTargetConnected || isReceiving;
  const isConnected = isSourceConnected || isTargetConnected;

  const isVisibleForce = isConnected || isReceiving || isConnectingFromHere;
  const visibilityClass = isVisibleForce ? '!opacity-100' : 'opacity-0 group-hover:opacity-100 hover:opacity-100';

  let shapeClasses = "";
  let offsetStyle = {};
  let clipPath = undefined;

  // !transform e origin-center costringono l'animazione hover:scale-125 
  // a rispettare il baricentro esatto della forma, ignorando i CSS di default del framework.
  let transformClasses = "!transform origin-center hover:scale-125 transition-all duration-200 ";
  
  const baseClasses = "!bg-gray-900 z-50 cursor-crosshair absolute !border-none !rounded-none !outline-none focus:!outline-none !ring-0 !shadow-none !min-w-0 !min-h-0 after:content-[''] after:absolute after:-inset-4";

  if (position === Position.Top) {
    transformClasses += "-translate-x-1/2 translate-y-0";
    offsetStyle = { top: isTriangle ? -20 : -18, bottom: 'auto', left: '50%', right: 'auto' };
  }
  if (position === Position.Bottom) {
    transformClasses += "-translate-x-1/2 translate-y-0";
    offsetStyle = { bottom: isTriangle ? -20 : -18, top: 'auto', left: '50%', right: 'auto' };
  }
  if (position === Position.Left) {
    transformClasses += "translate-x-0 -translate-y-1/2";
    offsetStyle = { left: isTriangle ? -20 : -18, right: 'auto', top: '50%', bottom: 'auto' };
  }
  if (position === Position.Right) {
    transformClasses += "translate-x-0 -translate-y-1/2";
    offsetStyle = { right: isTriangle ? -20 : -18, left: 'auto', top: '50%', bottom: 'auto' };
  }

  if (isTriangle) {
    shapeClasses = "!w-3 !h-3";
    if (position === Position.Top) clipPath = 'polygon(0% 0%, 100% 0%, 50% 100%)';
    if (position === Position.Bottom) clipPath = 'polygon(0% 100%, 100% 100%, 50% 0%)';
    if (position === Position.Left) clipPath = 'polygon(0% 0%, 0% 100%, 100% 50%)';
    if (position === Position.Right) clipPath = 'polygon(100% 0%, 0% 50%, 100% 100%)';
  } else {
      if (position === Position.Top || position === Position.Bottom) { 
          shapeClasses = "!w-[14px] !h-[2px]"; 
      } else { 
          shapeClasses = "!w-[2px] !h-[14px]"; 
      }
    }

  return (
    <Handle
      type="source" 
      position={position}
      id={id}
      className={`${baseClasses} ${shapeClasses} ${visibilityClass} ${transformClasses}`}
      style={{ ...offsetStyle, clipPath }}
    />
  );
};

export default function SemanticNode({ id, data, dragging, selected, xPos, yPos }) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const removeNode = useStore((state) => state.removeNode);
  const viewMode = useViewStore((state) => state.viewMode); 
  
  const updateNodeInternals = useUpdateNodeInternals();
  const textareaRef = useRef(null);

  const connectionNodeId = useReactFlowStore((state) => state.connectionNodeId);
  const isReceiving = connectionNodeId && connectionNodeId !== id;

  const [inputKey, setInputKey] = useState(Date.now());
  const [tilt, setTilt] = useState({ x: 0, z: 0 });
  const lastPos = useRef({ x: xPos, y: yPos });
  
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let start = Date.now();
    const timer = setInterval(() => {
       updateNodeInternals(id);
       if (Date.now() - start > 220) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [isHovered, dragging, isReceiving, id, updateNodeInternals]);

  useEffect(() => {
    if (!dragging) {
      setTilt({ x: 0, z: 0 });
      lastPos.current = { x: xPos, y: yPos };
      return;
    }
    const deltaX = xPos - (lastPos.current.x || xPos);
    const deltaY = yPos - (lastPos.current.y || yPos);
    
    const tiltZ = Math.max(-6, Math.min(6, deltaX * 1.2));
    const tiltX = Math.max(-6, Math.min(6, deltaY * -1.2)); 
    
    setTilt({ x: tiltX, z: tiltZ });
    lastPos.current = { x: xPos, y: yPos };

    const timeout = setTimeout(() => setTilt({ x: 0, z: 0 }), 120);
    return () => clearTimeout(timeout);
  }, [xPos, yPos, dragging]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      updateNodeInternals(id); 
    }
  }, [data.label, id, updateNodeInternals]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const scale = Math.min(300 / img.width, 1);
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dataArr = pixels.data;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const oldPixel = 0.2126 * dataArr[idx] + 0.7152 * dataArr[idx+1] + 0.0722 * dataArr[idx+2];
            const newPixel = oldPixel < 128 ? 0 : 255;
            dataArr[idx] = dataArr[idx+1] = dataArr[idx+2] = newPixel; dataArr[idx+3] = 255;
            const err = Math.floor((oldPixel - newPixel) / 8);
            const addError = (ox, oy) => {
              if (x + ox >= 0 && x + ox < canvas.width && y + oy >= 0 && y + oy < canvas.height) {
                const errIdx = ((y + oy) * canvas.width + (x + ox)) * 4;
                dataArr[errIdx] += err; dataArr[errIdx+1] += err; dataArr[errIdx+2] += err;
              }
            };
            addError(1, 0); addError(2, 0); addError(-1, 1); addError(0, 1); addError(1, 1); addError(0, 2);
          }
        }
        ctx.putImageData(pixels, 0, 0);
        updateNodeData(id, { image: canvas.toDataURL('image/png') });
        setInputKey(Date.now()); 
        setTimeout(() => updateNodeInternals(id), 50); 
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (e) => {
    e.stopPropagation(); 
    updateNodeData(id, { image: null }); 
    setInputKey(Date.now()); 
    setTimeout(() => updateNodeInternals(id), 50);
  };

  const kineticStyle = {
    transform: `perspective(800px) rotateX(${dragging ? tilt.x : 0}deg) rotateZ(${dragging ? tilt.z : 0}deg)`,
    transformOrigin: 'center center',
    boxShadow: dragging 
      ? `${6 + (tilt.z * -1.2)}px ${6 + (tilt.x * 1.2)}px 0px 0px rgba(17,24,39,1)`
      : (isHovered ? '6px 6px 0px 0px rgba(17,24,39,1)' : '0px 0px 0px 0px rgba(17,24,39,1)'),
    transition: dragging 
      ? 'transform 0.08s ease-out, box-shadow 0.08s ease-out'
      : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease-out'
  };

  const outerWrapperClasses = `relative group ${dragging ? 'cursor-grabbing z-50' : 'cursor-grab z-10 hover:z-20'}`;
  const elevationWrapperClasses = `w-full h-full relative transition-all duration-200 ${dragging ? '-top-[6px] -left-[6px]' : 'top-0 left-0 group-hover:-top-[6px] group-hover:-left-[6px]'}`;
  const innerCardClasses = "bg-white border-2 border-gray-900 w-full h-full relative flex flex-col"; //per la sezione del nodo

  if (viewMode === 'sintetica') {
    return (
    <div className={outerWrapperClasses} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className={elevationWrapperClasses}>
        
        <SelectionBrackets selected={selected} /> 

        <StaticHandle position={Position.Top} id="top" nodeId={id} isReceiving={isReceiving} />
        <StaticHandle position={Position.Left} id="left" nodeId={id} isReceiving={isReceiving} />
        <StaticHandle position={Position.Right} id="right" nodeId={id} isReceiving={isReceiving} />
        <StaticHandle position={Position.Bottom} id="bottom" nodeId={id} isReceiving={isReceiving} />

        <div className={`px-2 py-1.5 flex items-center justify-between ${innerCardClasses}`} style={kineticStyle}>
          <input 
              type="text"
              placeholder="SENZA TITOLO"
              value={data.title || ''}
              onChange={(e) => updateNodeData(id, { title: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()} 
              className="text-[10px] font-bold uppercase tracking-widest text-gray-900 bg-transparent outline-none w-full placeholder-gray-400 nodrag cursor-text relative z-30 min-w-0 text-left"
          />
          <button 
              onClick={(e) => { e.stopPropagation(); removeNode(id); }} 
              className="ml-2 text-gray-900 hover:text-red-600 transition-colors cursor-pointer nodrag flex-shrink-0 opacity-0 group-hover:opacity-100 relative z-40"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
    );
  }

  const showImage = viewMode === 'completa' && data.image;

  return (
    <div className={`rounded-md w-72 ${outerWrapperClasses}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className={elevationWrapperClasses}>

        <SelectionBrackets selected={selected} /> 
        
        <StaticHandle position={Position.Top} id="top" nodeId={id} isReceiving={isReceiving} />
        <StaticHandle position={Position.Left} id="left" nodeId={id} isReceiving={isReceiving} />
        <StaticHandle position={Position.Right} id="right" nodeId={id} isReceiving={isReceiving} />
        <StaticHandle position={Position.Bottom} id="bottom" nodeId={id} isReceiving={isReceiving} />

        <div className={`rounded-md ${innerCardClasses}`} style={kineticStyle}>
          
          {/* L'Intestazione (Header) con il separatore brutalista */}
          <div className="flex items-center justify-between border-b-2 border-gray-900 px-3 py-2 bg-transparent relative z-30">
            <input 
              type="text"
              placeholder="SENZA TITOLO"
              value={data.title || ''}
              onChange={(e) => updateNodeData(id, { title: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()} 
              className="text-xs font-bold uppercase tracking-wider text-gray-900 bg-transparent w-full focus:outline-none placeholder-gray-300 nodrag cursor-text min-w-0"
            />
            <button 
              onClick={(e) => { e.stopPropagation(); removeNode(id); }} 
              className="ml-2 text-gray-900 hover:text-red-600 transition-colors cursor-pointer nodrag flex-shrink-0 opacity-0 group-hover:opacity-100"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>

          {/* Il corpo del nodo (nota i padding adattati per compensare l'header) */}
          <div className="flex flex-col gap-3 px-4 pb-4 pt-3 relative z-30">

            {showImage && (
              <div className="flex items-center justify-between border-b-2 border-gray-900 px-3 py-2 bg-white relative z-30">
            <input 
              type="text"
              placeholder="SENZA TITOLO"
              value={data.title || ''}
              onChange={(e) => updateNodeData(id, { title: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()} 
              className="text-xs font-bold uppercase tracking-wider text-gray-900 bg-transparent w-full focus:outline-none placeholder-gray-300 nodrag cursor-text min-w-0"
            />
            <button 
              onClick={(e) => { e.stopPropagation(); removeNode(id); }} 
              className="ml-2 text-gray-900 hover:text-red-600 transition-colors cursor-pointer nodrag flex-shrink-0 opacity-0 group-hover:opacity-100"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>
            )}
            
            <textarea 
              ref={textareaRef}
              value={data.label || ''}
              onChange={(e) => updateNodeData(id, { label: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-sm text-gray-800 font-medium leading-snug break-words bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 p-1 -mx-1 rounded-sm w-full overflow-hidden transition-shadow nodrag cursor-text"
              rows={1} 
            />

            {viewMode === 'completa' && (
              <label className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 mt-1 nodrag">
                <span>+ Allega Immagine</span>
                <input key={`add-${inputKey}`} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}