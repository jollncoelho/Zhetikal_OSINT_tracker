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
}: EdgeProps) {
  // getBezierPath redessine exactement les courbes fluides d'origine de ta deuxième photo !
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
          strokeWidth: 1.5,
          stroke: '#ffffff', // Ligne blanche propre
          strokeDasharray: '5,5', // Recrée l'effet pointillé fin de ta photo !
          opacity: 0.6,
        }}
      />
      
      {/* Ajoute la petite croix de suppression discrète pile au milieu de la courbe */}
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
              width: '16px',
              height: '16px',
              backgroundColor: '#1a202c',
              border: '1px solid #ef4444',
              color: '#ef4444',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              boxShadow: '0 0 6px rgba(239, 68, 68, 0.4)',
              padding: 0,
              lineHeight: 1,
            }}
            title="Supprimer ce lien"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
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