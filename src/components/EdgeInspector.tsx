import { Trash2, X } from 'lucide-react';
import type { Edge } from '@xyflow/react';
import { RELATION_COLORS, RELATION_TYPES, readRelation, type RelationData } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';

interface EdgeInspectorProps {
  edge: Edge;
  onChange: (data: Partial<RelationData>) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Panneau d'édition d'un lien : nature de la relation et confiance.
 * S'ouvre dès qu'un lien est sélectionné dans le graphe.
 *
 * Positionné volontairement **au-dessus** de la barre d'analyse IA : celle-ci
 * est en `position: absolute; bottom: 24px`, centrée, et masquerait le bas du
 * panneau (curseur de confiance compris) si on le collait au bas du canevas.
 */
export default function EdgeInspector({ edge, onChange, onDelete, onClose }: EdgeInspectorProps) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const { relation, confidence } = readRelation(edge.data);
  const relationTone = entityTone(RELATION_COLORS[relation]);

  return (
    <div className="pointer-events-auto absolute bottom-[92px] left-1/2 z-20 w-[min(94vw,560px)] -translate-x-1/2 rounded-xl border border-cyber-border bg-cyber-dark/95 p-3 shadow-2xl backdrop-blur-sm animate-fade-in">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyber-text-dim">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: relationTone }}
          />
          {t('edge.title')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            title={t('edge.delete')}
            aria-label={t('edge.delete')}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-red/15 hover:text-cyber-red"
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('sidebar.delete')}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-cyber-text-dim">
        {t('edge.relation')}
      </p>
      <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-5">
        {RELATION_TYPES.map((type) => {
          const color = entityTone(RELATION_COLORS[type]);
          const isActive = type === relation;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ relation: type })}
              aria-pressed={isActive}
              className="flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[10px] font-medium leading-tight transition-all"
              style={{
                background: isActive ? `${color}1f` : 'transparent',
                borderColor: isActive ? `${color}80` : 'var(--cyber-border)',
                color: isActive ? color : 'var(--cyber-text-dim)',
              }}
            >
              <span
                className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
                style={{ background: color }}
              />
              <span>{t(`relation.${type}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-cyber-text-dim">
          {t('edge.confidence')}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(confidence * 100)}
          onChange={(e) => onChange({ confidence: Number(e.target.value) / 100 })}
          aria-label={t('edge.confidence')}
          className="edge-range flex-1 cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${relationTone} ${confidence * 100}%, var(--cyber-border) ${confidence * 100}%)`,
          }}
        />
        <span className="w-10 shrink-0 text-right font-mono text-[11px] font-semibold text-cyber-text">
          {Math.round(confidence * 100)}%
        </span>
      </div>
    </div>
  );
}
