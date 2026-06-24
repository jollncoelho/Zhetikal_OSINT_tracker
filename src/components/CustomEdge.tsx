import { memo } from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

export default memo(function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected, // <-- React Flow nous dit ici si la flèche est sélectionnée (rouge) !
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: selected ? '#ef4444' : '#ffffff', // Rouge si sélectionné, blanc sinon
          strokeDasharray: '5,5',
          opacity: selected ? 1 : 0.6,
        }}
      />
      
      {/* On affiche la croix UNIQUEMENT si la flèche est sélectionnée (rouge) */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              pointerEvents: 'all', // Permet le clic
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Envoie le signal de suppression que App.tsx écoute
                window.dispatchEvent(new CustomEvent('edge-delete', { detail: { id } }));
              }}
              style={{
                width: '18px',
                height: '18px',
                backgroundColor: '#1a202c',
                border: '1px solid #ef4444',
                color: '#ef4444',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
                padding: 0,
              }}
              title="Supprimer ce lien"
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});