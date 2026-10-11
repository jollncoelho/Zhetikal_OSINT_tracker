import { useMemo } from 'react';
import { Maximize2, Minus, Plus, Search, X, Link2 } from 'lucide-react';
import { useReactFlow, useStore } from '@xyflow/react';
import { useLanguage } from '../i18n/LanguageContext';
import { matchesQuery } from '../lib/graphFilter';
import type { EntityData, EntityNode } from '../types';

interface GraphHudProps {
  nodes: EntityNode[];
  edgeCount: number;
  filter: string;
  onFilterChange: (value: string) => void;
  /** Affiche l'astuce « cliquer un lien » tant qu'aucun lien n'est sélectionné. */
  showEdgeHint: boolean;
}

/**
 * Bandeau d'information du graphe : compteurs, filtre, zoom et recadrage.
 * Flottant au-dessus du canevas — le conteneur laisse passer les clics pour ne
 * pas gêner le déplacement de la vue.
 */
export default function GraphHud({
  nodes,
  edgeCount,
  filter,
  onFilterChange,
  showEdgeHint,
}: GraphHudProps) {
  const { t } = useLanguage();
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);

  const matchCount = useMemo(
    () =>
      filter.trim()
        ? nodes.filter((node) => matchesQuery(node.data as EntityData, filter)).length
        : nodes.length,
    [nodes, filter],
  );

  const filtering = filter.trim().length > 0;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
      {/* Compteurs */}
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-cyber-border bg-cyber-dark/85 px-3 py-1.5 backdrop-blur-sm">
        <span className="flex items-center gap-1.5 text-[11px] text-cyber-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-cyber-cyan" />
          <b className="font-mono text-xs font-semibold text-cyber-text">{nodes.length}</b>
          {t('hud.entities')}
        </span>
        <span className="h-3 w-px bg-cyber-border" />
        <span className="flex items-center gap-1.5 text-[11px] text-cyber-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-cyber-blue" />
          <b className="font-mono text-xs font-semibold text-cyber-text">{edgeCount}</b>
          {t('hud.links')}
        </span>
      </div>

      {/* Filtre */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-cyber-border bg-cyber-dark/85 px-2.5 py-1.5 backdrop-blur-sm">
        <Search size={12} className="shrink-0 text-cyber-text-dim" />
        <input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder={t('hud.filterPlaceholder')}
          aria-label={t('hud.filterPlaceholder')}
          className="w-40 bg-transparent text-[11px] text-cyber-text outline-none placeholder:text-cyber-text-dim/60 focus:w-56 transition-[width] duration-200 sm:w-48"
        />
        {filtering && (
          <>
            <span
              className={`whitespace-nowrap font-mono text-[10px] ${
                matchCount === 0 ? 'text-cyber-red' : 'text-cyber-cyan'
              }`}
            >
              {matchCount} {t('hud.matches')}
            </span>
            <button
              type="button"
              onClick={() => onFilterChange('')}
              title={t('hud.clearFilter')}
              aria-label={t('hud.clearFilter')}
              className="shrink-0 rounded p-0.5 text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
            >
              <X size={11} />
            </button>
          </>
        )}
      </div>

      {/* Zoom + recadrage */}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-cyber-border bg-cyber-dark/85 p-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomOut({ duration: 180 })}
          title="−"
          aria-label="−"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-cyan/10 hover:text-cyber-cyan"
        >
          <Minus size={12} />
        </button>
        <span className="w-11 text-center font-mono text-[10px] text-cyber-text-dim">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomIn({ duration: 180 })}
          title="+"
          aria-label="+"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-cyan/10 hover:text-cyber-cyan"
        >
          <Plus size={12} />
        </button>
        <span className="mx-0.5 h-4 w-px bg-cyber-border" />
        <button
          type="button"
          onClick={() => fitView({ duration: 260, padding: 0.2 })}
          title={t('hud.fit')}
          aria-label={t('hud.fit')}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-cyan/10 hover:text-cyber-cyan"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Astuce liens — centrée, sous le bandeau */}
      {showEdgeHint && edgeCount > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-full mt-2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-cyber-border bg-cyber-dark/80 px-2.5 py-1 text-[10px] text-cyber-text-dim backdrop-blur-sm">
          <Link2 size={10} className="text-cyber-cyan" />
          {t('edge.hint')}
        </div>
      )}
    </div>
  );
}
