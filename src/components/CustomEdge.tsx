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
  // 1. getSmoothStepPath force la flèche à faire des angles propres à 90° au lieu de tirer de biais
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16, // Donne un bel arrondi cyber aux angles
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
          stroke: '#ffffff', // Ta ligne blanche propre
          opacity: 0.8,
        }}
      />
      
      {/* 2. EdgeLabelRenderer permet de coller un vrai bouton cliquable au milieu du fil */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 10,
            pointerEvents: 'all', // Permet de cliquer dessus malgré le canvas
          }}
          className="nodrag nopan"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Déclenche l'événement global de suppression d'edge que App.tsx écoute déjà
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
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)',
            }}
            title="Supprimer ce lien"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ef4444').valueOf() && (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1a202c').valueOf() && (e.currentTarget.style.color = '#ef4444')}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});