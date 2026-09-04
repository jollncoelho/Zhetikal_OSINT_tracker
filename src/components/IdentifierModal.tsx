import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, SlidersHorizontal, Satellite } from 'lucide-react';
import type { EntityData, EntityType } from '../types';
import { ENTITY_FIELDS, ENTITY_LABELS, ENTITY_COLORS } from '../types';
import IconPicker from './IconPicker';

const GODSEYE_BASE = import.meta.env.VITE_GODSEYE_URL || 'https://osintgodseye.prohacking77.me';

interface Props {
  nodeId: string;
  data: EntityData;
  onUpdate: (nodeId: string, data: Partial<EntityData>) => void;
  onClose: () => void;
}

export default function IdentifierModal({ nodeId, data, onUpdate, onClose }: Props) {
  const [fields, setFields] = useState<Record<string, unknown>>(data.fields ?? {});
  const [showIconPicker, setShowIconPicker] = useState(false);
  const fieldDefs = ENTITY_FIELDS[data.entityType as EntityType] ?? [];

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(nodeId, { fields });
    onClose();
  };

  const handleIconSelect = (iconId: string | null) => {
    onUpdate(nodeId, { customIconId: iconId });
    setShowIconPicker(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative bg-cyber-dark border border-cyber-border rounded-2xl shadow-2xl w-[400px] max-h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-cyber-border"
          style={{ borderTopColor: ENTITY_COLORS[data.entityType as EntityType] }}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} style={{ color: ENTITY_COLORS[data.entityType as EntityType] }} />
            <div>
              <h2 className="text-sm font-bold text-cyber-text">{data.label}</h2>
              <p className="text-[10px] text-cyber-text-dim font-mono">{ENTITY_LABELS[data.entityType as EntityType]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowIconPicker(true)}
              className="text-[10px] px-2 py-1 rounded border border-cyber-border text-cyber-text-dim hover:text-cyber-cyan hover:border-cyber-cyan/40 transition-colors"
            >
              {data.customIconId ? '✓ Icône custom' : 'Icône'}
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-panel transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
          {fieldDefs.length === 0 ? (
            <p className="text-xs text-cyber-text-dim/50 text-center py-8 italic">
              Aucun champ disponible pour ce type
            </p>
          ) : (
            <div className="space-y-3">
              {fieldDefs.map((def) => (
                <div key={def.key}>
                  <label className="block text-[10px] text-cyber-text-dim uppercase tracking-wide mb-1">
                    {def.label}
                  </label>
                  <input
                    type={def.type === 'number' ? 'number' : 'text'}
                    value={String(fields[def.key] ?? '')}
                    onChange={(e) => handleFieldChange(def.key, e.target.value)}
                    className="input-cyber w-full"
                    placeholder={`${def.label}...`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-cyber-border">
          <button
            onClick={handleSave}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: `${ENTITY_COLORS[data.entityType as EntityType]}20`,
              color: ENTITY_COLORS[data.entityType as EntityType],
              border: `1px solid ${ENTITY_COLORS[data.entityType as EntityType]}40`,
            }}
          >
            Sauvegarder
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cyber-panel border border-cyber-border text-cyber-text-dim text-xs hover:bg-cyber-dark transition-colors"
          >
            Annuler
          </button>
        </div>

        {/* God's Eye projection — geocodes address if no GPS coords */}
        {(() => {
          const f = data.fields;
          const lat = f ? parseFloat(String(f.lat)) : NaN;
          const lon = f ? parseFloat(String(f.lng ?? f.lon ?? f.longitude)) : NaN;
          const hasCoords = !isNaN(lat) && !isNaN(lon) && isFinite(lat) && isFinite(lon);
          const isLoc = data.entityType === 'location';
          if (!hasCoords && !isLoc) return null;

          const handleProject = async () => {
            const label = encodeURIComponent(data.label || '');
            const type = encodeURIComponent(data.entityType || '');
            if (hasCoords) {
              window.open(`${GODSEYE_BASE}/?lat=${lat}&lon=${lon}&zoom=16&label=${label}&type=${type}`, '_blank');
              return;
            }
            const address = data.label?.trim();
            if (!address) return;
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
              const results = await res.json();
              if (Array.isArray(results) && results.length > 0) {
                const glat = parseFloat(results[0].lat);
                const glon = parseFloat(results[0].lon);
                if (!isNaN(glat) && !isNaN(glon)) {
                  onUpdate(nodeId, { fields: { ...(data.fields || {}), lat: String(glat), lng: String(glon) } });
                  window.open(`${GODSEYE_BASE}/?lat=${glat}&lon=${glon}&zoom=16&label=${label}&type=${type}`, '_blank');
                  return;
                }
              }
            } catch (e) {
              console.error('Geocoding failed', e);
            }
            window.open(`${GODSEYE_BASE}/?label=${label}&type=${type}`, '_blank');
          };

          return (
            <button
              onClick={handleProject}
              className="flex items-center justify-center gap-2 px-5 py-2.5 border-t border-cyber-cyan/20 bg-cyber-cyan/5 text-cyber-cyan text-[11px] font-semibold hover:bg-cyber-cyan/15 transition-colors w-full"
            >
              <Satellite size={13} /> PROJETER DANS GOD'S EYE
            </button>
          );
        })()}
      </div>

      {showIconPicker && (
        <IconPicker
          currentIconId={data.customIconId ?? null}
          onSelect={handleIconSelect}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </div>,
    document.body
  );
}
