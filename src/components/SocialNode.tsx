import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';
import { Trash2, X, Check, Maximize2, ChevronDown } from 'lucide-react';
import type { EntityData, SocialPlatform } from '../types';
import { SOCIAL_PLATFORMS } from '../types';

const HANDLE_THICKNESS = 14;

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

function PlatformPickerModal({
  currentPlatform,
  onSelect,
  onClose,
}: {
  currentPlatform: SocialPlatform;
  onSelect: (p: SocialPlatform) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative rounded-2xl border border-cyber-border bg-cyber-dark p-6 shadow-2xl"
        style={{ minWidth: 340, boxShadow: '0 0 40px rgba(0,200,212,0.15)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-cyber-text tracking-wide">Choisir le réseau</h2>
            <p className="text-[10px] text-cyber-text-dim font-mono mt-0.5">Sélectionne la plateforme du compte trouvé</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-panel transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Platform grid */}
        <div className="grid grid-cols-5 gap-3">
          {SOCIAL_PLATFORMS.map((p) => {
            const active = p.id === currentPlatform;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-150 group"
                style={{
                  background: active ? `${p.color}18` : 'rgba(17,24,39,0.6)',
                  borderColor: active ? `${p.color}80` : '#1e3a5f',
                  boxShadow: active ? `0 0 12px ${p.color}30` : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    const el = e.currentTarget;
                    el.style.background = `${p.color}12`;
                    el.style.borderColor = `${p.color}60`;
                    el.style.boxShadow = `0 0 8px ${p.color}25`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    const el = e.currentTarget;
                    el.style.background = 'rgba(17,24,39,0.6)';
                    el.style.borderColor = '#1e3a5f';
                    el.style.boxShadow = 'none';
                  }
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                  style={{
                    background: `${p.color}20`,
                    color: p.color,
                  }}
                >
                  <PlatformIcon id={p.id} size={22} />
                </div>
                <span
                  className="text-[9px] font-mono font-bold tracking-wide"
                  style={{ color: active ? p.color : '#64748b' }}
                >
                  {p.label.toUpperCase()}
                </span>
                {active && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: p.color }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default memo(function SocialNode({ id, data, selected }: SocialNodeProps) {
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [modalOpen, setModalOpen] = useState(false);

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

  const handleSelectPlatform = (p: SocialPlatform) => {
    const chosen = SOCIAL_PLATFORMS.find((x) => x.id === p)!;
    window.dispatchEvent(
      new CustomEvent('entity-update', {
        detail: {
          id,
          label: data.label,
          notes: data.notes,
          socialPlatform: p,
          color: chosen.color,
        },
      })
    );
    setModalOpen(false);
  };

  const handleSaveLabel = () => {
    window.dispatchEvent(
      new CustomEvent('entity-update', {
        detail: { id, label, notes: data.notes, socialPlatform: data.socialPlatform, color: data.color },
      })
    );
    setRenamingLabel(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveLabel(); }
    if (e.key === 'Escape') { setLabel(data.label); setRenamingLabel(false); }
  };

  return (
    <>
      <div
        className={`group relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px] ${selected ? 'shadow-lg' : ''}`}
        style={{
          borderColor: selected ? platform.color : `${platform.color}40`,
          boxShadow: selected ? `0 0 16px ${platform.color}40` : `0 0 6px ${platform.color}15`,
        }}
      >
        {/* Handles */}
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

        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 pr-9">
          {/* Platform icon — click opens modal */}
          <button
            onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
            title="Changer de réseau"
            className="relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:scale-110 group/icon"
            style={{ background: `${platform.color}22`, color: platform.color }}
          >
            <PlatformIcon id={platform.id} size={14} />
            <span
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover/icon:opacity-100 transition-opacity"
              style={{ background: platform.color }}
            >
              <ChevronDown size={8} color="#000" />
            </span>
          </button>

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

        {/* Platform badge row */}
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold"
            style={{ color: platform.color, borderColor: `${platform.color}50`, background: `${platform.color}12` }}
          >
            <PlatformIcon id={platform.id} size={9} />
            {platform.label.toUpperCase()}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
            className="text-[9px] font-mono text-cyber-text-dim hover:text-cyber-cyan transition-colors"
          >
            changer
          </button>
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

        {/* Rename confirm */}
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

      {/* Platform picker modal */}
      {modalOpen && (
        <PlatformPickerModal
          currentPlatform={platform.id}
          onSelect={handleSelectPlatform}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
});
