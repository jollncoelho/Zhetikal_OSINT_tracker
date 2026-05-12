import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Trash2, X, Check, Maximize2 } from 'lucide-react';
import type { EntityData, SocialPlatform } from '../types';
import { SOCIAL_PLATFORMS } from '../types';

const HANDLE_THICKNESS = 14;

// SVG icon paths for each platform (minimal, recognizable)
const PlatformIcon = ({ id, size = 14 }: { id: SocialPlatform; size?: number }) => {
  const s = size;
  switch (id) {
    case 'facebook':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.93a8.17 8.17 0 0 0 4.78 1.52V7a4.85 4.85 0 0 1-1.01-.31z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect x="2" y="9" width="4" height="12" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      );
    case 'x':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
  }
};

interface SocialNodeProps {
  id: string;
  data: EntityData;
  selected?: boolean;
}

export default memo(function SocialNode({ id, data, selected }: SocialNodeProps) {
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);

  const platform = SOCIAL_PLATFORMS.find((p) => p.id === data.socialPlatform) ?? SOCIAL_PLATFORMS[0];
  const half = HANDLE_THICKNESS / 2;

  const handleBase: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    cursor: 'crosshair',
  };

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('entity-delete', { detail: { id } }));
  };

  const handleExpandNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-expand-note', { detail: { id } }));
  };

  const selectPlatform = (p: SocialPlatform, e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('entity-update', {
        detail: { id, label: data.label, notes: data.notes, socialPlatform: p, color: SOCIAL_PLATFORMS.find((x) => x.id === p)?.color ?? data.color },
      })
    );
  };

  const handleSaveLabel = () => {
    window.dispatchEvent(
      new CustomEvent('entity-update', { detail: { id, label, notes: data.notes, socialPlatform: data.socialPlatform } })
    );
    setRenamingLabel(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveLabel(); }
    if (e.key === 'Escape') { setLabel(data.label); setRenamingLabel(false); }
  };

  return (
    <div
      className={`group relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px] ${selected ? 'shadow-lg' : ''}`}
      style={{
        borderColor: selected ? platform.color : '#1e3a5f',
        boxShadow: selected ? `0 0 16px ${platform.color}40` : 'none',
      }}
      onDoubleClick={handleExpandNote}
    >
      {/* Border handles */}
      <Handle id="left" type="source" position={Position.Left}
        style={{ ...handleBase, width: HANDLE_THICKNESS, height: '100%', top: 0, left: -half, transform: 'none' }} />
      <Handle id="right" type="source" position={Position.Right}
        style={{ ...handleBase, width: HANDLE_THICKNESS, height: '100%', top: 0, right: -half, transform: 'none' }} />
      <Handle id="top" type="source" position={Position.Top}
        style={{ ...handleBase, width: '100%', height: HANDLE_THICKNESS, left: 0, top: -half, transform: 'none' }} />
      <Handle id="bottom" type="source" position={Position.Bottom}
        style={{ ...handleBase, width: '100%', height: HANDLE_THICKNESS, left: 0, bottom: -half, transform: 'none' }} />

      {/* Delete button */}
      {!renamingLabel && (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          title="Supprimer"
          className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center
            bg-cyber-dark/70 border border-cyber-border
            text-cyber-text-dim hover:text-red-400 hover:bg-red-500/15 hover:border-red-500/40
            transition-all duration-150 z-10"
        >
          <Trash2 size={11} />
        </button>
      )}

      {/* Header: platform icon + label */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 pr-9">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-200"
          style={{ background: `${platform.color}22`, color: platform.color }}
        >
          <PlatformIcon id={platform.id} size={14} />
        </div>

        {renamingLabel ? (
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveLabel}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-xs font-bold outline-none focus:border-cyber-cyan font-mono"
            style={{ color: platform.color }}
          />
        ) : (
          <span
            className="flex-1 text-xs font-bold truncate font-mono cursor-text"
            style={{ color: platform.color }}
            onDoubleClick={(e) => { e.stopPropagation(); setRenamingLabel(true); }}
            title="Double-clic pour renommer"
          >
            {data.label}
          </span>
        )}
      </div>

      {/* Platform selector */}
      <div className="flex items-center gap-1 px-3 pb-2" onClick={(e) => e.stopPropagation()}>
        {SOCIAL_PLATFORMS.map((p) => {
          const active = p.id === platform.id;
          return (
            <button
              key={p.id}
              title={p.label}
              onClick={(e) => selectPlatform(p.id, e)}
              className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 border"
              style={{
                background: active ? `${p.color}25` : 'transparent',
                borderColor: active ? `${p.color}80` : 'transparent',
                color: active ? p.color : '#4b5563',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = p.color;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${p.color}50`;
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = '#4b5563';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                }
              }}
            >
              <PlatformIcon id={p.id} size={12} />
            </button>
          );
        })}
        <span className="ml-auto text-[9px] font-mono font-bold" style={{ color: platform.color }}>
          {platform.label.toUpperCase()}
        </span>
      </div>

      {/* Notes preview */}
      <div className="px-3 pb-3">
        <div className="flex items-start gap-1">
          <p className="flex-1 text-xs font-mono text-cyber-text-dim italic line-clamp-2">
            {data.notes || <span className="opacity-50">Double-clic pour noter...</span>}
          </p>
          <button
            onClick={handleExpandNote}
            className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan transition-colors"
            title="Ouvrir les notes"
          >
            <Maximize2 size={9} />
          </button>
        </div>
      </div>

      {/* Rename confirm row */}
      {renamingLabel && (
        <div className="flex gap-1 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleSaveLabel}
            className="flex items-center gap-1 px-2 py-1 rounded bg-cyber-green/20 border border-cyber-green/40 text-cyber-green text-[10px] font-medium hover:bg-cyber-green/30 transition-colors"
          >
            <Check size={10} /> OK
          </button>
          <button
            onClick={() => { setLabel(data.label); setRenamingLabel(false); }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-cyber-panel border border-cyber-border text-cyber-text-dim text-[10px] font-medium hover:bg-cyber-dark transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  );
});
