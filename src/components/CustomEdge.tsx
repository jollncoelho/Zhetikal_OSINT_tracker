import { useState } from 'react';
import {
  EdgeLabelRenderer,
  useNodes,
  type EdgeProps,
  type Node,
} from '@xyflow/react';

function getNodePerimeterPoint(
  node: Node,
  offX: number,
  offY: number
): { x: number; y: number } {
  const w = (node.measured?.width ?? node.width ?? 200) as number;
  const h = (node.measured?.height ?? node.height ?? 80) as number;
  return {
    x: node.position.x + offX * w,
    y: node.position.y + offY * h,
  };
}

function getStraightPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): [string, number, number] {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  return [`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`, midX, midY];
}

interface FreeEdgeData extends Record<string, unknown> {
  sourceOffX?: number;
  sourceOffY?: number;
  targetOffX?: number;
  targetOffY?: number;
}

export default function CustomEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const nodes = useNodes();

  const edgeData = data as FreeEdgeData | undefined;

  let sx = sourceX;
  let sy = sourceY;
  let tx = targetX;
  let ty = targetY;

  if (edgeData?.sourceOffX !== undefined && edgeData?.sourceOffY !== undefined) {
    const sourceNode = nodes.find((n) => n.id === source);
    if (sourceNode) {
      const pt = getNodePerimeterPoint(sourceNode, edgeData.sourceOffX, edgeData.sourceOffY);
      sx = pt.x;
      sy = pt.y;
    }
  }

  if (edgeData?.targetOffX !== undefined && edgeData?.targetOffY !== undefined) {
    const targetNode = nodes.find((n) => n.id === target);
    if (targetNode) {
      const pt = getNodePerimeterPoint(targetNode, edgeData.targetOffX, edgeData.targetOffY);
      tx = pt.x;
      ty = pt.y;
    }
  }

  const [edgePath, labelX, labelY] = getStraightPath(sx, sy, tx, ty);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('edge-delete', { detail: { id } }));
  };

  const strokeColor = hovered ? '#ff6b6b' : (style?.stroke as string) || '#00c8d4';

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
          stroke: strokeColor,
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
