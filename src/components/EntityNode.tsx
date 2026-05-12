import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Pencil, Trash2, X, Check, Maximize2,
} from 'lucide-react';
import type { EntityData } from '../types';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote,
};

const TECH_TYPES = ['ip', 'domain', 'url', 'email', 'crypto', 'phone'];

const TYPE_LABELS: Record<string, string> = {
  ip: 'IP',
  domain: 'DOMAIN',
  email: 'EMAIL',
  username: 'USER',
  phone: 'PHONE',
  location: 'LOCATION',
  organization: 'ORG',
  person: 'PERSON',
  file: 'FILE',
  url: 'URL',
  crypto: 'CRYPTO',
  note: 'NOTE',
};

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
  const typeLabel = TYPE_LABELS[data.entityType] || data.entityType.toUpperCase();

  return (
    <div
      className={`relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px] ${
        selected ? 'shadow-lg' : ''
      }`}
      style={{
        borderColor: selected ? data.color : '#1e3a5f',
        boxShadow: selected ? `0 0 16px ${data.color}40` : 'none',
      }}
      onDoubleClick={handleExpandNote}
    >
      {/*
        Single invisible handle per side, covering the full side length.
        opacity:0 hides the dot; pointerEvents:all keeps them connectable.
        connectionMode="loose" on ReactFlow lets source↔target connect freely.
      */}
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        style={{ opacity: 0, width: 1, height: '100%', top: 0, transform: 'none', borderRadius: 0, left: 0 }}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{ opacity: 0, width: 1, height: '100%', top: 0, transform: 'none', borderRadius: 0, right: 0 }}
      />
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        style={{ opacity: 0, width: '100%', height: 1, left: 0, transform: 'none', borderRadius: 0, top: 0 }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, width: '100%', height: 1, left: 0, transform: 'none', borderRadius: 0, bottom: 0 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${data.color}22` }}>
          <IconComponent size={16} style={{ color: data.color }} />
        </div>

        {renamingLabel ? (
          <input
            ref={labelRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveLabel}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-sm font-semibold text-cyber-text outline-none focus:border-cyber-cyan font-tech"
          />
        ) : (
          <span className={`flex-1 text-sm font-semibold text-cyber-text truncate ${TECH_TYPES.includes(data.entityType) ? 'font-tech' : ''}`}>
            {data.label}
          </span>
        )}

        <span
          className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0"
          style={{ color: data.color, borderColor: `${data.color}44`, background: `${data.color}11` }}
        >
          {typeLabel}
        </span>
      </div>

      {/* Notes preview */}
      <div className="px-3 pb-3">
        <div className="flex items-start gap-1">
          <p className="flex-1 text-xs font-mono text-cyber-text-dim italic line-clamp-2">
            {data.notes || (
              <span className="opacity-50">Double-clic pour noter...</span>
            )}
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

      {/* Action buttons */}
      {renamingLabel ? (
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
      ) : (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setRenamingLabel(true); }}
            className="w-5 h-5 rounded flex items-center justify-center bg-cyber-dark/80 hover:bg-cyber-panel text-cyber-text-dim hover:text-cyber-cyan transition-colors"
            title="Renommer"
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="w-5 h-5 rounded flex items-center justify-center bg-cyber-dark/80 hover:bg-cyber-panel text-cyber-text-dim hover:text-cyber-red transition-colors"
            title="Supprimer"
          >
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
});
