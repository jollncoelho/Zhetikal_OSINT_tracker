import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Trash2, X, Check, NotebookPen,
} from 'lucide-react';
import type { EntityData } from '../types';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote,
};

const TECH_TYPES = ['ip', 'domain', 'url', 'email', 'crypto', 'phone'];


// Thickness of the invisible connection strip along each border (px)
const HANDLE_THICKNESS = 14;

interface EntityNodeProps {
  id: string;
  data: EntityData;
  selected?: boolean;
}

export default memo(function EntityNode({ id, data, selected }: EntityNodeProps) {
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  useEffect(() => {
    if (renamingLabel && labelRef.current) {
      labelRef.current.focus();
      labelRef.current.select();
    }
  }, [renamingLabel]);

  const handleSaveLabel = () => {
    window.dispatchEvent(
      new CustomEvent('entity-update', { detail: { id, label, notes: data.notes } })
    );
    setRenamingLabel(false);
  };

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('entity-delete', { detail: { id } }));
  };

  const handleExpandNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-expand-note', { detail: { id } }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveLabel(); }
    if (e.key === 'Escape') { setLabel(data.label); setRenamingLabel(false); }
  };

  const IconComponent = ICON_MAP[data.icon] || Globe;
  const half = HANDLE_THICKNESS / 2;

  /*
   * Each Handle is a wide transparent strip sitting flush on its border.
   * - background: transparent  → invisible
   * - cursor: crosshair        → tells the user "you can start a connection here"
   * - pointerEvents handled by React Flow automatically
   * All four sides are both source AND target (connectionMode="loose" in ReactFlow),
   * so a connection can start or land anywhere on the perimeter.
   */
  const handleBase: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    cursor: 'crosshair',
  };

  return (
    <div
      className={`group relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px] ${
        selected ? 'shadow-lg' : ''
      }`}
      style={{
        borderColor: selected ? data.color : '#1e3a5f',
        boxShadow: selected ? `0 0 16px ${data.color}40` : 'none',
      }}
    >
      {/* ── Left border strip ── */}
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        style={{
          ...handleBase,
          width: HANDLE_THICKNESS,
          height: '100%',
          top: 0,
          left: -half,
          transform: 'none',
        }}
      />

      {/* ── Right border strip ── */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{
          ...handleBase,
          width: HANDLE_THICKNESS,
          height: '100%',
          top: 0,
          right: -half,
          transform: 'none',
        }}
      />

      {/* ── Top border strip ── */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        style={{
          ...handleBase,
          width: '100%',
          height: HANDLE_THICKNESS,
          left: 0,
          top: -half,
          transform: 'none',
        }}
      />

      {/* ── Bottom border strip ── */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{
          ...handleBase,
          width: '100%',
          height: HANDLE_THICKNESS,
          left: 0,
          bottom: -half,
          transform: 'none',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 pr-9">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${data.color}22` }}>
          <IconComponent size={14} style={{ color: data.color }} />
        </div>

        {renamingLabel ? (
          <input
            ref={labelRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveLabel}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-xs font-bold outline-none focus:border-cyber-cyan font-mono"
            style={{ color: data.color }}
          />
        ) : (
          <span
            className={`flex-1 text-xs font-bold truncate font-mono ${TECH_TYPES.includes(data.entityType) ? 'font-tech' : ''}`}
            style={{ color: data.color }}
            onDoubleClick={(e) => { e.stopPropagation(); setRenamingLabel(true); }}
            title="Double-clic pour renommer"
          >
            {data.label}
          </span>
        )}
      </div>

      {/* Notes preview */}
      <div className="px-3 pb-3 pr-10">
        <p className="text-xs font-mono text-cyber-text-dim italic line-clamp-2">
          {data.notes || <span className="opacity-40">Aucune note...</span>}
        </p>
      </div>

      {/* Open notes button — bottom-left */}
      {!renamingLabel && (
        <button
          onClick={handleExpandNote}
          title="Ouvrir le bloc-notes"
          className="absolute bottom-2 right-2 w-6 h-6 rounded-md flex items-center justify-center
            bg-cyber-dark/70 border border-cyber-border
            text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan/40
            transition-all duration-150 z-10"
        >
          <NotebookPen size={11} />
        </button>
      )}

      {/* Delete button — always visible, top-right corner */}
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

      {/* Rename confirm/cancel row */}
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
