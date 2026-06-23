import { useState } from 'react';
import {
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35,
  });

  const isActive = hovered || selected;
  const strokeColor = isActive ? '#ff6b6b' : (style?.stroke as string) || '#00c8d4';
  const markerId = `arrow-${id}`;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('edge-delete', { detail: { id } }));
  };

  return (
    <>
      {/* Custom arrowhead marker */}
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 1.5 L 8.5 5 L 0 8.5"
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      {/* Wide invisible hit area */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {/* Glow layer on active */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={6}
          opacity={0.18}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Animated flow line */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isActive ? 2.2 : 1.6}
        strokeDasharray="6 4"
        markerEnd={`url(#${markerId})`}
        style={{
          pointerEvents: 'none',
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
          animation: 'flow-dash 1.6s linear infinite',
        }}
      />

      {/* Solid base line (partial opacity so dash shows motion) */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isActive ? 2.2 : 1.6}
        opacity={0.3}
        style={{
          pointerEvents: 'none',
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
        }}
      />

      {/* Delete button at midpoint */}
      {hovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 10,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={handleDelete}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#ef4444',
                border: '2px solid #0d1321',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                boxShadow: '0 0 8px rgba(239,68,68,0.7)',
              }}
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
