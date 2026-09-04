import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Share2, Camera,
  Server, Network, Fingerprint, ShieldCheck, Crosshair,
  Trash2, X, Check, NotebookPen,
  ExternalLink, SlidersHorizontal, Search, Satellite
} from 'lucide-react';
import type { EntityData } from '../types';
import { loadIcons } from './IconPicker';
import { useLanguage } from '../i18n/LanguageContext';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Share2, Camera,
  Server, Network, Fingerprint, ShieldCheck, Crosshair,
};

const TECH_TYPES = ['ip', 'domain', 'hostname', 'url', 'email', 'crypto', 'phone', 'username', 'asn', 'hash', 'sslcert', 'ttp'];
const LINK_TYPES = ['url', 'domain', 'hostname'];

const GODSEYE_BASE = import.meta.env.VITE_GODSEYE_URL || 'https://osintgodseye.prohacking77.me';

function extractCoords(data: EntityData): { lat: number; lon: number } | null {
  const f = data.fields;
  if (f) {
    const lat = parseFloat(String(f.lat));
    const lon = parseFloat(String(f.lng ?? f.lon ?? f.longitude));
    if (!isNaN(lat) && !isNaN(lon) && isFinite(lat) && isFinite(lon)) {
      return { lat, lon };
    }
  }
  return null;
}

function buildGodsEyeUrl(data: EntityData): string | null {
  const coords = extractCoords(data);
  if (!coords) return null;
  const label = encodeURIComponent(data.label || '');
  const type = encodeURIComponent(data.entityType || '');
  return `${GODSEYE_BASE}/?lat=${coords.lat}&lon=${coords.lon}&zoom=14&label=${label}&type=${type}`;
}

function buildOpenUrl(entityType: string, label: string): string | null {
  if (entityType === 'url') return label.startsWith('http') ? label : `https://${label}`;
  if (entityType === 'domain' || entityType === 'hostname') return `https://${label}`;
  return null;
}

// Fonction de routage OSINT globale pour pivoter vers les meilleurs outils tiers
function buildOsintPivotUrl(entityType: string, label: string): string | null {
  if (!label) return null;
  const cleanLabel = label.trim();

  switch (entityType.toLowerCase()) {
    case 'email':
      return `https://epieos.com/?q=${encodeURIComponent(cleanLabel)}`;
    case 'username':
      return `https://whatsmyname.app/?target=${encodeURIComponent(cleanLabel)}`;
    case 'domain':
    case 'hostname':
      return `https://www.virustotal.com/gui/domain/${encodeURIComponent(cleanLabel)}`;
    case 'phone': {
      const cleanPhone = cleanLabel.replace(/[^0-9+]/g, '');
      return `https://intelx.io/?s=${encodeURIComponent(cleanPhone)}`;
    }
    case 'ip':
    case 'ipaddress':
      return `https://iknowwhatyoudownload.com/en/peer/?ip=${encodeURIComponent(cleanLabel)}`;
    case 'asn': {
      const num = cleanLabel.replace(/[^0-9]/g, '');
      return `https://bgp.he.net/AS${encodeURIComponent(num)}`;
    }
    case 'hash':
      return `https://www.virustotal.com/gui/file/${encodeURIComponent(cleanLabel)}`;
    case 'sslcert':
      return `https://crt.sh/?q=${encodeURIComponent(cleanLabel)}`;
    case 'crypto':
      return `https://www.walletexplorer.com/?q=${encodeURIComponent(cleanLabel)}`;
    case 'url':
      return `https://www.virustotal.com/gui/url/${encodeURIComponent(cleanLabel)}`;
    default:
      return null;
  }
}

interface EntityNodeProps {
  id: string;
  data: EntityData;
  selected?: boolean;
}

export default memo(function EntityNode({ id, data, selected }: EntityNodeProps) {
  const { t } = useLanguage();
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [addressInput, setAddressInput] = useState(data.label);
  const labelRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const icons = loadIcons();
  const customIcon = data.customIconId ? icons.find((i) => i.id === data.customIconId) : null;

  useEffect(() => { setLabel(data.label); }, [data.label]);
  useEffect(() => { setAddressInput(data.label); }, [data.label]);

  useEffect(() => {
    if (renamingLabel && labelRef.current) { labelRef.current.focus(); labelRef.current.select(); }
  }, [renamingLabel]);

  // Focus auto sur le champ adresse quand un nœud Adresse est créé sans label
  useEffect(() => {
    if (data.entityType === 'location' && !data.label && addressRef.current) {
      addressRef.current.focus();
    }
  }, [data.entityType, data.label]);

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
    window.dispatchEvent(new CustomEvent('entity-go-to-map', { detail: { nodeId: id, address: data.label } }));
  };

  // Validation de l'adresse : le label du nœud prend la valeur de l'adresse saisie
  const handleSaveAddress = () => {
    const clean = addressInput.trim();
    if (clean && clean !== data.label) {
      window.dispatchEvent(new CustomEvent('entity-update', { detail: { id, label: clean, notes: data.notes } }));
    } else if (!clean) {
      setAddressInput(data.label);
    }
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
    if (e.key === 'Escape') { setAddressInput(data.label); (e.target as HTMLInputElement).blur(); }
  };

  const openUrl = buildOpenUrl(data.entityType, data.label);
  const pivotOsintUrl = buildOsintPivotUrl(data.entityType, data.label);
  const IconComponent = ICON_MAP[data.icon] || Globe;
  const isLocation = data.entityType === 'location';

  return (
    <div
      className="group relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px]"
      style={{
        borderColor: selected ? data.color : '#1e3a5f',
        boxShadow: selected ? `0 0 16px ${data.color}40` : 'none',
      }}
    >
      <Handle type="source" position={Position.Left} id="left" style={{ width: 12, height: 12, left: -6, top: '50%', transform: 'translateY(-50%)', background: '#10b981', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="target" position={Position.Left} id="left-in" style={{ width: 12, height: 12, left: -6, top: '50%', transform: 'translateY(-50%)', background: '#ef4444', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ width: 12, height: 12, right: -6, top: '50%', transform: 'translateY(-50%)', background: '#10b981', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="target" position={Position.Right} id="right-in" style={{ width: 12, height: 12, right: -6, top: '50%', transform: 'translateY(-50%)', background: '#ef4444', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="source" position={Position.Top} id="top" style={{ width: 12, height: 12, top: -6, left: '50%', transform: 'translateX(-50%)', background: '#10b981', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="target" position={Position.Top} id="top-in" style={{ width: 12, height: 12, top: -6, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ width: 12, height: 12, bottom: -6, left: '50%', transform: 'translateX(-50%)', background: '#10b981', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-in" style={{ width: 12, height: 12, bottom: -6, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', border: '2px solid #0a0e17', cursor: 'crosshair', zIndex: 100 }} />

      {/* Contenu : occupe 100% de l'espace, aucune interférence */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: customIcon ? 'transparent' : `${data.color}22` }}>
          {customIcon ? (
            <img src={customIcon.dataUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <IconComponent size={14} style={{ color: data.color }} />
          )}
        </div>

        {isLocation ? (
          // Nœud Adresse : champ input propre, label = valeur saisie
          <input
            ref={addressRef}
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={handleAddressKeyDown}
            onBlur={handleSaveAddress}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder={t('node.addressPlaceholder')}
            className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-xs font-bold outline-none focus:border-cyber-cyan font-mono min-w-0"
            style={{ color: data.color }}
          />
        ) : renamingLabel ? (
          <input ref={labelRef} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveLabel} onClick={(e) => e.stopPropagation()} className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-xs font-bold outline-none focus:border-cyber-cyan font-mono min-w-0" style={{ color: data.color }} />
        ) : (
          <>
            <span className={`flex-1 text-xs font-bold truncate font-mono ${TECH_TYPES.includes(data.entityType) ? 'font-tech' : ''}`} style={{ color: data.color }} onDoubleClick={handleLabelDoubleClick} title={t('node.rename')}>
              {data.label}
            </span>
            {data.entityType === 'url' && openUrl && (
              <a
                href={data.label}
                target="_blank"
                rel="noopener noreferrer"
                title={t('node.openLink')}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-all duration-150"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </>
        )}
      </div>

      {data.entityType === 'photo' && data.photoUrl && (
        <div className="px-3 pt-2">
          <img
            src={data.photoUrl}
            alt=""
            className="w-full h-24 object-cover rounded border border-cyber-border cursor-pointer hover:border-cyber-cyan/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('entity-view-photo', { detail: { photoUrl: data.photoUrl, label: data.label } }));
            }}
          />
        </div>
      )}

      <div className="px-3 pb-3">
        <p className="text-xs font-mono text-cyber-text-dim italic line-clamp-2">
          {data.notes || <span className="opacity-40">{t('node.noNotes')}</span>}
        </p>
      </div>

      {renamingLabel && !isLocation && (
        <div className="flex gap-1 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={handleSaveLabel} className="flex items-center gap-1 px-2 py-1 rounded bg-cyber-green/20 border border-cyber-green/40 text-cyber-green text-[10px] font-medium hover:bg-cyber-green/30 transition-colors">
            <Check size={10} /> OK
          </button>
          <button onClick={() => { setLabel(data.label); setRenamingLabel(false); }} className="flex items-center gap-1 px-2 py-1 rounded bg-cyber-panel border border-cyber-border text-cyber-text-dim text-[10px] font-medium hover:bg-cyber-dark transition-colors">
            <X size={10} />
          </button>
        </div>
      )}

      {/* BARRE D'ACTIONS FLOTTANTE : apparaît uniquement au survol, à l'extérieur du nœud */}
      {!renamingLabel && (
        <div
          className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1 py-1 rounded-lg bg-cyber-dark/95 border border-cyber-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 pointer-events-auto whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleDelete} title={t('node.delete')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-red-400 hover:bg-red-500/15 transition-colors">
            <Trash2 size={12} />
          </button>
          <button onClick={handleExpandNote} title={t('node.openNote')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
            <NotebookPen size={12} />
          </button>
          <button onClick={handleOpenFields} title={t('node.fields')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
            <SlidersHorizontal size={12} />
          </button>

          {isLocation && (
            <button onClick={handleGoToMap} title={t('node.viewMap')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-green hover:bg-cyber-green/10 transition-colors">
              <MapPin size={12} />
            </button>
          )}

          {(() => { const gye = buildGodsEyeUrl(data); return gye ? (
            <a href={gye} target="_blank" rel="noopener noreferrer" title="Projeter dans God's Eye" onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
              <Satellite size={12} />
            </a>
          ) : null; })()}

          {pivotOsintUrl && (
            <a href={pivotOsintUrl} target="_blank" rel="noopener noreferrer" title={t('node.osint')} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
              <ExternalLink size={12} />
            </a>
          )}

          {LINK_TYPES.includes(data.entityType) && openUrl && (
            <a href={data.entityType === 'url' ? data.label : openUrl} target="_blank" rel="noopener noreferrer" title={t('node.visitLink')} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
              <Search size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
});
