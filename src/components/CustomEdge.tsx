import { memo, useState } from 'react';
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { RELATION_COLORS, readRelation, type RelationType } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';

/**
 * Arête du graphe.
 *
 * Encodage visuel :
 *   - **couleur**  → nature de la relation (`relation.*`)
 *   - **épaisseur** → niveau de confiance de l'analyste (1,2 → 4 px)
 *   - **pointillés** → famille de relation (preuve/alias, communication…)
 *   - **animation du flux** → uniquement sur le lien survolé ou sélectionné,
 *     pour garder un canevas calme quand rien n'est en cours d'édition
 */

/**
 * Trame de trait par relation : `undefined` = trait plein.
 *
 * La trame double la couleur, elle ne la remplace pas : sur un graphe dense et
 * à 1–2 px, deux teintes voisines se confondent alors qu'un pointillé se repère
 * encore. Chaque famille a sa trame, donc un « réside à » pointillé vert reste
 * lisible à côté d'un « possède » plein orange même en daltonisme.
 */
const RELATION_DASH: Partial<Record<RelationType, string>> = {
  // Identité : continuité de la personne.
  alias: '6 4',
  sameAs: '10 3 2 3',
  // Personne : liens humains, trame longue et calme.
  family: '2 3',
  resides: '1 4',
  works: '8 3',
  frequented: '3 5',
  // Technique : flux.
  communicates: '1 5',
  // Trace : ce qui prouve ou ce qui mentionne.
  paid: '5 3',
  mentioned: '1 3',
  evidence: '2 4',
  member: '8 4',
};

/** Ensembles explicitement pleins, pour que le type reste exhaustif côté TS. */

function strokeWidthFor(confidence: number): number {
  return 1.2 + confidence * 2.8;
}

export default memo(function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const { t } = useLanguage();
  const { entityTone } = useTheme();

  const { relation, confidence } = readRelation(data);
  const color = entityTone(RELATION_COLORS[relation]);
  const active = Boolean(selected) || hovered;
  const strokeWidth = strokeWidthFor(confidence) + (active ? 0.8 : 0);
  const dash = RELATION_DASH[relation];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35,
  });

  const markerId = `arrow-${id}`;
  const relationLabel = t(`relation.${relation}`);
  const confidencePct = `${Math.round(confidence * 100)}%`;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('edge-delete', { detail: { id } }));
  };

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth={active ? 7 : 6}
          markerHeight={active ? 7 : 6}
          orient="auto-start-reverse"
        >
          <path
            d="M 0 1.5 L 8.5 5 L 0 8.5"
            fill="none"
            style={{ stroke: color, strokeWidth: 1.8 }}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      {/* Zone de clic large, invisible */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: 'pointer' }}
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {/* Halo sur le lien actif */}
      {active && (
        <path
          d={edgePath}
          fill="none"
          style={{
            stroke: color,
            strokeWidth: strokeWidth + 5,
            opacity: 0.18,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Trait de base — `stroke`/`strokeWidth` passent par `style` et non par
          des attributs de présentation : la feuille de style de React Flow
          (`.react-flow__edge-path { stroke: #b1b1b7; stroke-width: 1 }`) prime
          sur les attributs, jamais sur les styles en ligne. */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: color,
          strokeWidth,
          strokeDasharray: dash,
          strokeLinecap: 'round',
          pointerEvents: 'none',
          opacity: active ? 1 : 0.72,
          transition: 'stroke-width 0.15s ease, opacity 0.15s ease',
        }}
      />

      {/* Flux animé — uniquement sur le lien actif */}
      {active && (
        <path
          d={edgePath}
          fill="none"
          style={{
            stroke: color,
            strokeWidth,
            strokeDasharray: '5 12',
            strokeLinecap: 'round',
            pointerEvents: 'none',
            animation: 'flow-dash 1.1s linear infinite',
          }}
        />
      )}

      {/* Étiquette + suppression au point médian */}
      {active && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 12,
            }}
            className="nodrag nopan flex items-center gap-1 rounded-full border border-cyber-border bg-cyber-dark/95 py-0.5 pl-2 pr-0.5 shadow-lg backdrop-blur-sm"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="whitespace-nowrap text-[10px] font-medium text-cyber-text">
              {relationLabel}
            </span>
            <span className="whitespace-nowrap font-mono text-[10px] text-cyber-text-dim">
              {confidencePct}
            </span>
            <button
              type="button"
              onClick={handleDelete}
              title={t('edge.delete')}
              aria-label={t('edge.delete')}
              className="flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold leading-none text-cyber-text-dim transition-colors hover:bg-cyber-red/20 hover:text-cyber-red"
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
