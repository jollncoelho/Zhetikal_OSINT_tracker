import { memo } from 'react';
import { EdgeProps, getBezierPath, BaseEdge } from '@xyflow/react';

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
  // Cette fonction calcule la trajectoire exacte entre le centre des handles source et target
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: 2,
        stroke: '#ffffff', // Force la flèche en blanc propre comme sur ton image
        opacity: 0.8,
      }}
    />
  );
});