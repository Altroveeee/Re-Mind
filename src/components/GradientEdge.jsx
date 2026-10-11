import React from 'react';
import { BaseEdge, getBezierPath } from 'reactflow';
import { DEFAULT_LINK_COLOR } from './nodeColors';

// Collegamento con gradiente: dal colore del nodo di partenza a quello del nodo di arrivo.
// Il <linearGradient> usa coordinate assolute (userSpaceOnUse) così funziona anche
// per tratti perfettamente orizzontali o verticali, dove la bounding box ha altezza/larghezza 0.
export default function GradientEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const from = data?.fromColor || DEFAULT_LINK_COLOR;
  const to = data?.toColor || DEFAULT_LINK_COLOR;
  const gradientId = `grad-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, stroke: `url(#${gradientId})` }} />
    </>
  );
}
