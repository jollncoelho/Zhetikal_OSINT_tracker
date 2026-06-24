import { memo } from 'react';
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';

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
}: EdgeProps) {
  // Cette fonction calcule automatiquement le chemin en faisant des virages propres à 90°
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16, // Donne l'arrondi cyber aux virages
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
          stroke: '#ffffff', // Ligne blanche cyber
          opacity: 0.8,
        }}
      />
      
      {/* Affichage de la croix de suppression (X) pile au milieu du virage */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 10,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
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
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
            }}
            title="Supprimer ce lien"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1a202c';
              e.currentTarget.style.color = '#ef4444';
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});