import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Trash2, X, Check, NotebookPen,
  ExternalLink, SlidersHorizontal,
} from 'lucide-react';
import type { EntityData } from '../types';
import { loadIcons } from './IconPicker';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote,
};

const TECH_TYPES = ['ip', 'domain', 'url', 'email', 'crypto', 'phone'];
const LINK_TYPES = ['url', 'domain'];
const HANDLE_THICKNESS = 14;

function buildOpenUrl(entityType: string, label: string): string | null {
  if (entityType === 'url') return label.startsWith('http') ? label : `https://${label}`;
  if (entityType === 'domain') return `https://${label}`;
  return null;
}

interface EntityNodeProps {
  id: string;
  data: EntityData;
  selected?: boolean;
}

export default memo(function EntityNode({ id, data, selected }: EntityNodeProps) {
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const labelRef = useRef<HTMLInputElement>(null);
  const icons = loadIcons();
  const customIcon = data.customIconId ? icons.find((i) => i.id === data.customIconId) : null;

  useEffect(() => { setLabel(data.label); }, [data.label]);
  useEffect(() => {
    if (renamingLabel && labelRef.current) { labelRef.current.focus(); labelRef.current.select(); }
  }, [renamingLabel]);

  const handleSaveLabel = () => {
    window.dispatchEvent(new CustomEvent('entity-update', { detail: { id, label, notes: data.notes } }));
    setRenamingLabel(false);
  };

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('entity-delete', { detail: { id } }));
  };

  const handleExpandNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-expand-note', { detail: { id } }));
  };

  const handleOpenFields = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-open-fields', { detail: { id } }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveLabel(); }
    if (e.key === 'Escape') { setLabel(data.label); setRenamingLabel(false); }
  };

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingLabel(true);
  };

  const handleGoToMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-go-to-map', { detail: { nodeId: id } }));
  };

  const openUrl = buildOpenUrl(data.entityType, data.label);
  const IconComponent = ICON_MAP[data.icon] || Globe;
  const half = HANDLE_THICKNESS / 2;
  const handleBase: React.CSSProperties = {
    background: 'transparent', border: 'none', borderRadius: 0, cursor: 'crosshair',
  };

  return (
    <div
      className={`group relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px] ${selected ? 'shadow-lg' : ''}`}
      style={{
        borderColor: selected ? data.color : '#1e3a5f',
        boxShadow: selected ? `0 0 16px ${data.color}40` : 'none',
      }}
    >
      
      <Handle type="target" position={Position.Left} ... />
      <Handle type="source" position={Position.Right} ... />
      <Handle type="target" position={Position.Top} ... />
      <Handle type="source" position={Position.Bottom} ... />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 pr-9">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: customIcon ? 'transparent' : `${data.color}22` }}
        >
          {customIcon ? (
            <img src={customIcon.dataUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <IconComponent size={14} style={{ color: data.color }} />
          )}
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
            onDoubleClick={handleLabelDoubleClick}
            title="Double-clic pour renommer"
          >
            {data.label}
          </span>
        )}
      </div>
      {/* Photo preview — photo type only */}
      {data.entityType === 'photo' && data.photoUrl && (
        <div className="px-3 pt-2">
          <img
            src={data.photoUrl}
            alt=""
            className="w-full h-24 object-cover rounded border border-cyber-border"
          />
        </div>
      )}
      {/* Notes preview */}
      <div className={`px-3 pb-3 ${!renamingLabel ? 'pr-10' : ''}`}>
        <p className="text-xs font-mono text-cyber-text-dim italic line-clamp-2">
          {data.notes || <span className="opacity-40">Aucune note...</span>}
        </p>
      </div>

      {/* Action buttons */}
      {!renamingLabel && (
        <>
          {/* Delete — top right */}
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

          {/* Open notes — bottom right */}
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

          {/* Fields button — bottom right - 1 */}
          <button
            onClick={handleOpenFields}
            title="Champs personnalisés"
            className="absolute bottom-2 right-[2.2rem] w-6 h-6 rounded-md flex items-center justify-center
              bg-cyber-dark/70 border border-cyber-border
              text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan/40
              transition-all duration-150 z-10"
          >
            <SlidersHorizontal size={11} />
          </button>

          {/* Lookup IP — ip type only */}
          {data.entityType === 'ip' && (
            <a
              href={`https://ipinfo.io/${data.label}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Analyser / géolocaliser cette IP"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 right-[4.4rem] w-6 h-6 rounded-md flex items-center justify-center
                bg-cyber-dark/70 border border-cyber-border
                text-cyber-text-dim hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/40
                transition-all duration-150 z-10"
            >
              <ExternalLink size={11} />
            </a>
          )}

          {/* Voir sur la carte — location type only */}
          {data.entityType === 'location' && (
            <button
              onClick={handleGoToMap}
              title="Voir sur la carte"
              className="absolute bottom-2 right-[4.4rem] w-6 h-6 rounded-md flex items-center justify-center
                bg-cyber-dark/70 border border-cyber-border
                text-cyber-text-dim hover:text-cyber-green hover:bg-cyber-green/10 hover:border-cyber-green/40
                transition-all duration-150 z-10"
            >
              <MapPin size={11} />
            </button>
          )}

          {/* Open link — URL/Domain only */}
          {LINK_TYPES.includes(data.entityType) && openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Ouvrir ${data.entityType === 'domain' ? 'le domaine' : 'le lien'}`}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 right-[4.4rem] w-6 h-6 rounded-md flex items-center justify-center
                bg-cyber-dark/70 border border-cyber-border
                text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan/40
                transition-all duration-150 z-10"
            >
              <ExternalLink size={11} />
            </a>
          )}
        </>
      )}

      {/* Rename confirm/cancel */}
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