import { useState } from 'react';
import {
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('edge-delete', { detail: { id } }));
  };

  return (
    <>
      {/* Wide invisible stroke for easy hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {/* Visible edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        style={{
          ...style,
          stroke: hovered ? '#ff6b6b' : (style?.stroke as string) || '#00c8d4',
          strokeWidth: 3,
          transition: 'stroke 0.15s ease',
          filter: hovered ? 'drop-shadow(0 0 4px rgba(239,68,68,0.6))' : undefined,
          pointerEvents: 'none',
        }}
        markerEnd={markerEnd}
      />

      {/* X delete button at midpoint, shown on hover */}
      {hovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
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
                boxShadow: '0 0 6px rgba(239,68,68,0.7)',
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
