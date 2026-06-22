import './MapTab.css';
import 'leaflet/dist/leaflet.css';

import { useEffect, useState, useCallback, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { Search, Trash2, Link2, X, MapPin as MapPinIcon, ChevronRight, ChevronLeft, Target } from 'lucide-react';
import type { CaseData, MapPin, EntityNode } from '../types';
import { useNavigation } from '../context/NavigationContext';
import LinkPicker from './LinkPicker';

delete (L.Icon.Default.prototype as any)._getIconUrl;

function injectPulseStyle() {
  if (document.getElementById('pin-pulse-style')) return;
  const s = document.createElement('style');
  s.id = 'pin-pulse-style';
  s.textContent = `
    @keyframes pinPulse {
      0%,100% { box-shadow:0 0 0 0 rgba(255,255,255,0.5),0 2px 8px rgba(0,0,0,0.5); }
      50%      { box-shadow:0 0 0 10px rgba(255,255,255,0),0 2px 8px rgba(0,0,0,0.5); }
    }
  `;
  document.head.appendChild(s);
}

function createPinIcon(color: string, pulse = false) {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="
      width:28px;height:28px;
      background:${color};
      border:3px solid rgba(255,255,255,0.9);
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
      ${pulse ? 'animation:pinPulse 1.2s ease-in-out infinite;' : ''}
    "></div>`,
  });
}

function MapController({
  isVisible,
  onMapReady,
}: {
  isVisible: boolean;
  onMapReady: (map: L.Map) => void;
}) {
  const map = useMap();
  const readyRef = useRef(false);

  useEffect(() => {
    if (!readyRef.current) {
      readyRef.current = true;
      onMapReady(map);
    }
  }, [map, onMapReady]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => map.invalidateSize({ animate: false }), 80);
    return () => clearTimeout(timer);
  }, [isVisible, map]);

  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

interface PinFormData {
  label: string;
  address: string;
  notes: string;
  visitedAt: string;
  withWho: string;
  color: string;
}

const PIN_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface Props {
  activeCase: CaseData | null;
  nodes: EntityNode[];
  addPin: (pin: Omit<MapPin, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updatePin: (pinId: string, data: Partial<Omit<MapPin, 'id' | 'createdAt'>>) => void;
  deletePin: (pinId: string) => void;
  addPinLink: (link: { pinId: string; identifierId: string; context: string }) => void;
  removePinLink: (linkId: string) => void;
}

export default function MapTab({
  activeCase,
  nodes,
  addPin,
  updatePin,
  deletePin,
  addPinLink,
  removePinLink,
}: Props) {
  const { view, hoveredIdentifierId, setFocusNodeId } = useNavigation();
  const isVisible = view === 'map';

  // ── core state ──────────────────────────────────────────────────────────────
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);
  const [linkPickerPinId, setLinkPickerPinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const mapRef = useRef<L.Map | null>(null);

  const pins: MapPin[] = activeCase?.locations ?? [];
  const pinLinks = activeCase?.pinLinks ?? [];

  const [form, setForm] = useState<PinFormData>({
    label: '', address: '', notes: '', visitedAt: '', withWho: '', color: '#10b981',
  });

  useEffect(() => { injectPulseStyle(); }, []);

  // ── cross-component navigation via window event ─────────────────────────────
  // App.tsx dispatches 'map-navigate-pin' after switching to map view
  useEffect(() => {
    const handler = (e: Event) => {
      const { pinId, lat, lng } = (e as CustomEvent<{ pinId: string; lat: number; lng: number }>).detail;
      console.log('map-navigate-pin received', pinId, lat, lng);
      setSelectedMarkerId(pinId);
      mapRef.current?.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });
    };
    window.addEventListener('map-navigate-pin', handler);
    return () => window.removeEventListener('map-navigate-pin', handler);
  }, []);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    setTimeout(() => map.invalidateSize({ animate: false }), 80);
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (editingPinId) return;
    setSelectedMarkerId(null);
    setPendingPin({ lat, lng });
    setForm({ label: '', address: '', notes: '', visitedAt: '', withWho: '', color: '#10b981' });
  }, [editingPinId]);

  const handleAddPin = () => {
    if (!pendingPin || !form.label.trim()) return;
    addPin({
      label: form.label.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      visitedAt: form.visitedAt || undefined,
      withWho: form.withWho || undefined,
      color: form.color,
      lat: pendingPin.lat,
      lng: pendingPin.lng,
      iconId: null,
    });
    setPendingPin(null);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'fr,en' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const latlng: [number, number] = [parseFloat(lat), parseFloat(lon)];
        mapRef.current?.flyTo(latlng, 14, { animate: true, duration: 1.2 });
        setPendingPin({ lat: latlng[0], lng: latlng[1] });
        setForm((f) => ({ ...f, address: display_name }));
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  };

  const startEditing = (pin: MapPin) => {
    setEditingPinId(pin.id);
    setForm({
      label: pin.label, address: pin.address, notes: pin.notes,
      visitedAt: pin.visitedAt ?? '', withWho: pin.withWho ?? '', color: pin.color,
    });
  };

  const saveEdit = () => {
    if (!editingPinId) return;
    updatePin(editingPinId, {
      label: form.label.trim(), address: form.address.trim(), notes: form.notes.trim(),
      visitedAt: form.visitedAt || undefined, withWho: form.withWho || undefined, color: form.color,
    });
    setEditingPinId(null);
  };

  const flyToPin = (pin: MapPin) => {
    setSelectedMarkerId(pin.id);
    mapRef.current?.flyTo([pin.lat, pin.lng], 16, { animate: true, duration: 1.0 });
  };

  const linkedNodeIds = (pinId: string) =>
    pinLinks.filter((l) => l.pinId === pinId).map((l) => l.identifierId);

  return (
    <div className="map-tab-root">
      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 bg-cyber-dark/95 border border-cyber-border rounded-xl px-3 py-2 shadow-xl backdrop-blur-sm">
          <MapPinIcon size={13} className="text-cyber-cyan" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Rechercher une adresse..."
            className="bg-transparent text-xs text-cyber-text outline-none w-56 placeholder:text-cyber-text-dim/50"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="text-cyber-cyan hover:text-cyber-text transition-colors disabled:opacity-40"
          >
            <Search size={13} />
          </button>
        </div>
      </div>

      {/* ── Pins sidebar ────────────────────────────────────────────────────── */}
      <div
        className={`absolute top-0 right-0 h-full z-[900] flex flex-col transition-all duration-200 pointer-events-auto
          ${sidebarOpen ? 'w-52' : 'w-0'}`}
      >
        <div
          className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 z-10"
        >
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex items-center justify-center w-5 h-10 bg-cyber-dark border border-r-0 border-cyber-border rounded-l-md text-cyber-text-dim hover:text-cyber-cyan transition-colors"
          >
            {sidebarOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </div>

        {sidebarOpen && (
          <div className="w-full h-full bg-cyber-dark/95 border-l border-cyber-border flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-cyber-border flex-shrink-0">
              <p className="text-[10px] font-semibold text-cyber-cyan uppercase tracking-wider">
                Lieux ({pins.length})
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {pins.length === 0 && (
                <p className="text-[10px] text-cyber-text-dim/40 italic px-3 py-3">
                  Cliquez sur la carte pour ajouter un lieu
                </p>
              )}
              {pins.map((pin) => (
                <button
                  key={pin.id}
                  onClick={() => flyToPin(pin)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-cyber-cyan/5 border-b border-cyber-border/40 transition-colors group
                    ${selectedMarkerId === pin.id ? 'bg-cyber-cyan/10' : ''}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
                    style={{ background: pin.color }}
                  />
                  <div className="min-w-0">
                    <p className={`text-[11px] font-medium truncate ${selectedMarkerId === pin.id ? 'text-cyber-cyan' : 'text-cyber-text'}`}>
                      {pin.label}
                    </p>
                    {pin.address && (
                      <p className="text-[10px] text-cyber-text-dim/60 truncate">{pin.address}</p>
                    )}
                  </div>
                  <Target
                    size={10}
                    className="ml-auto flex-shrink-0 text-cyber-text-dim/0 group-hover:text-cyber-cyan/60 transition-colors mt-0.5"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Leaflet map ─────────────────────────────────────────────────────── */}
      <MapContainer
        center={[48.8566, 2.3522]}
        zoom={5}
        className="map-leaflet-container"
      >
        <MapController isVisible={isVisible} onMapReady={handleMapReady} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapClickHandler onMapClick={handleMapClick} />

        {pins.map((pin) => {
          const linked = linkedNodeIds(pin.id);
          const isPulsing = linked.some((id) => id === hoveredIdentifierId);
          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={createPinIcon(pin.color, isPulsing)}
              eventHandlers={{
                click: () => {
                  console.log('PIN CLICKED', pin.id, pin.lat, pin.lng, pin.label, pin.address);
                  setSelectedMarkerId(pin.id);
                  mapRef.current?.flyTo([pin.lat, pin.lng], 16, { animate: true, duration: 0.8 });
                },
                popupclose: () => {
                  setSelectedMarkerId((prev) => prev === pin.id ? null : prev);
                  setEditingPinId((prev) => prev === pin.id ? null : prev);
                },
              }}
            >
              {selectedMarkerId === pin.id && (
                <Popup>
                  <div className="bg-[#0d111c] border border-cyber-border rounded-lg p-3 min-w-[220px] text-xs text-cyber-text">
                    {editingPinId === pin.id ? (
                      <PinForm
                        form={form}
                        setForm={setForm}
                        onSave={saveEdit}
                        onCancel={() => setEditingPinId(null)}
                      />
                    ) : (
                      <PinInfo
                        pin={pin}
                        linkedIds={linked}
                        nodes={nodes}
                        pinLinks={pinLinks}
                        onEdit={() => startEditing(pin)}
                        onDelete={() => { deletePin(pin.id); setSelectedMarkerId(null); }}
                        onCenter={() => mapRef.current?.flyTo([pin.lat, pin.lng], 16, { animate: true, duration: 0.8 })}
                        onOpenLinkPicker={() => setLinkPickerPinId(pin.id)}
                        onRemoveLink={removePinLink}
                        onFocusNode={setFocusNodeId}
                      />
                    )}
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}

        {pendingPin && (
          <Marker position={[pendingPin.lat, pendingPin.lng]} icon={createPinIcon('#00c8d4')}>
            <Popup>
              <div className="bg-[#0d111c] border border-cyber-border rounded-lg p-3 min-w-[220px] text-xs text-cyber-text">
                <PinForm
                  form={form}
                  setForm={setForm}
                  onSave={handleAddPin}
                  onCancel={() => setPendingPin(null)}
                />
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {linkPickerPinId && (
        <LinkPicker
          nodes={nodes}
          existingLinks={pinLinks.filter((l) => l.pinId === linkPickerPinId)}
          onAdd={(identifierId, context) => addPinLink({ pinId: linkPickerPinId, identifierId, context })}
          onRemove={removePinLink}
          onClose={() => setLinkPickerPinId(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface PinFormProps {
  form: PinFormData;
  setForm: React.Dispatch<React.SetStateAction<PinFormData>>;
  onSave: () => void;
  onCancel: () => void;
}

function PinForm({ form, setForm, onSave, onCancel }: PinFormProps) {
  const f = (key: keyof PinFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 220 }}>
      <p className="text-[10px] font-semibold text-cyber-cyan uppercase tracking-wide">Nouveau point</p>
      <input value={form.label}     onChange={f('label')}     placeholder="Nom du lieu *"     className="input-cyber" autoFocus />
      <input value={form.address}   onChange={f('address')}   placeholder="Adresse"           className="input-cyber" />
      <input value={form.visitedAt} onChange={f('visitedAt')} placeholder="Visité le (date)" className="input-cyber" />
      <input value={form.withWho}   onChange={f('withWho')}   placeholder="Avec qui"          className="input-cyber" />
      <textarea value={form.notes}  onChange={f('notes')}     placeholder="Notes" rows={2}    className="input-cyber resize-none" />
      <div className="flex gap-1 flex-wrap">
        {PIN_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setForm((p) => ({ ...p, color: c }))}
            className="w-5 h-5 rounded-full border-2 transition-all"
            style={{ background: c, borderColor: form.color === c ? '#fff' : 'transparent' }}
          />
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        <button onClick={onSave} className="flex-1 py-1 rounded bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan text-[10px] font-semibold hover:bg-cyber-cyan/30 transition-colors">
          Enregistrer
        </button>
        <button onClick={onCancel} className="px-3 py-1 rounded bg-cyber-panel border border-cyber-border text-cyber-text-dim text-[10px] hover:bg-cyber-dark transition-colors">
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

interface PinInfoProps {
  pin: MapPin;
  linkedIds: string[];
  nodes: EntityNode[];
  pinLinks: CaseData['pinLinks'];
  onEdit: () => void;
  onDelete: () => void;
  onCenter: () => void;
  onOpenLinkPicker: () => void;
  onRemoveLink: (linkId: string) => void;
  onFocusNode: (id: string) => void;
}

function PinInfo({ pin, linkedIds, nodes, pinLinks, onEdit, onDelete, onCenter, onOpenLinkPicker, onRemoveLink, onFocusNode }: PinInfoProps) {
  return (
    <div className="flex flex-col gap-1.5" style={{ minWidth: 200 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: pin.color }} />
          <span className="font-bold text-cyber-text truncate max-w-[120px]">{pin.label}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={onCenter} title="Centrer"
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-cyber-cyan/20 text-cyber-text-dim hover:text-cyber-cyan transition-colors">
            <Target size={10} />
          </button>
          <button onClick={onEdit} title="Modifier"
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-cyber-cyan/20 text-cyber-text-dim hover:text-cyber-cyan transition-colors">
            ✎
          </button>
          <button onClick={onDelete}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-cyber-text-dim hover:text-red-400 transition-colors">
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {pin.address && <p className="text-cyber-text-dim text-[10px]">{pin.address}</p>}
      {pin.visitedAt && (
        <p className="text-[10px] text-cyber-text-dim">
          Visité : {pin.visitedAt}{pin.withWho ? ` avec ${pin.withWho}` : ''}
        </p>
      )}
      {pin.notes && (
        <p className="text-[10px] text-cyber-text-dim italic border-t border-cyber-border pt-1 mt-1">
          {pin.notes}
        </p>
      )}

      <div className="border-t border-cyber-border pt-1.5 mt-0.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-cyber-text-dim uppercase tracking-wide">Liens identifiants</span>
          <button onClick={onOpenLinkPicker} className="flex items-center gap-1 text-[10px] text-cyber-cyan hover:text-cyber-text transition-colors">
            <Link2 size={9} /> Lier
          </button>
        </div>
        {linkedIds.length === 0 && <p className="text-[10px] text-cyber-text-dim/40 italic">Aucun lien</p>}
        {linkedIds.map((nid) => {
          const node = nodes.find((n) => n.id === nid);
          const link = (pinLinks ?? []).find((l) => l.identifierId === nid && l.pinId === pin.id);
          if (!node) return null;
          return (
            <div key={nid} className="flex items-center justify-between gap-1 mt-0.5">
              <button
                onClick={() => onFocusNode(nid)}
                className="text-[10px] text-cyber-cyan hover:underline truncate max-w-[140px] text-left"
              >
                {node.data.label}
              </button>
              {link && (
                <button onClick={() => onRemoveLink(link.id)} className="text-red-400/60 hover:text-red-400 transition-colors flex-shrink-0">
                  <X size={8} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-cyber-text-dim/40 font-mono mt-0.5">
        {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
      </p>
    </div>
  );
}
