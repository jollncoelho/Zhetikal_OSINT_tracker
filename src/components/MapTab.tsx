import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapTab.css';
import type { MapPin, EntityNode, EntityData } from '../types';

// Fix Leaflet default icon paths
if (typeof window !== 'undefined') {
  try {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  } catch (_) {}
}

const SHADOW = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png';

const makeIcon = (color: string) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: SHADOW,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [0, -44],
    shadowSize: [41, 41],
  });

const searchIcon = makeIcon('red');
const pinIcon = makeIcon('blue');

// ── Inner helper: fly-to without remounting the MapContainer ────────────────
interface FlyProps { target: [number, number] | null; zoom: number }
function FlyToTarget({ target, zoom }: FlyProps) {
  const map = useMap();
  const prev = useRef<string>('');
  useEffect(() => {
    if (!target) return;
    const key = `${target[0]},${target[1]},${zoom}`;
    if (key === prev.current) return;
    prev.current = key;
    map.flyTo(target, zoom, { duration: 1.2 });
  }, [target, zoom, map]);
  return null;
}

interface MapTabProps {
  pins: MapPin[];
  nodes: EntityNode[];
  onUpdatePins: (pins: MapPin[]) => void;
  onGeocodeLocation?: (nodeId: string, lat: number, lng: number) => void;
  onUpdatePin?: (id: string, updates: Partial<MapPin>) => void;
}

export default function MapTab({ pins, nodes, onUpdatePins, onGeocodeLocation, onUpdatePin }: MapTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [flyZoom, setFlyZoom] = useState(6);
  const [alert, setAlert] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  const showAlert = useCallback((msg: string, ms = 4000) => {
    setAlert(msg);
    setTimeout(() => setAlert(null), ms);
  }, []);

  // ── External navigation event ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      const { lat, lng } = e.detail || {};
      if (typeof lat === 'number' && !isNaN(lat)) {
        setFlyTarget([lat, lng]);
        setFlyZoom(15);
      }
    };
    window.addEventListener('map-navigate-pin', handler);
    return () => window.removeEventListener('map-navigate-pin', handler);
  }, []);

  // ── Geocode + create/update pin ─────────────────────────────────────────
  const geocodeAndNavigate = useCallback(async (address: string, nodeId: string) => {
    if (!address?.trim()) { showAlert('Aucune adresse pour cette entité', 3000); return; }
    setGeocodingId(nodeId);
    showAlert(`Recherche : ${address}`);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const data = await res.json();
      if (!data?.length) { showAlert(`Adresse introuvable : ${address}`); setGeocodingId(null); return; }

      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      const displayName: string = data[0].display_name || address;

      if (isNaN(lat) || !isFinite(lat)) { showAlert('Coordonnées invalides'); setGeocodingId(null); return; }

      setFlyTarget([lat, lng]);
      setFlyZoom(15);
      showAlert(`${displayName}`);

      onGeocodeLocation?.(nodeId, lat, lng);

      const existing = pins.find(p => p.id === nodeId);
      if (!existing) {
        onUpdatePins([...pins, {
          id: nodeId, label: address, address: displayName,
          lat, lng, notes: '', color: '#06b6d4',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }]);
      } else {
        onUpdatePins(pins.map(p =>
          p.id === nodeId ? { ...p, lat, lng, address: displayName, updatedAt: new Date().toISOString() } : p
        ));
      }
    } catch {
      showAlert('Erreur de géocodage');
    } finally {
      setGeocodingId(null);
    }
  }, [onGeocodeLocation, pins, onUpdatePins, showAlert]);

  useEffect(() => {
    const handler = (e: any) => {
      const { nodeId, address } = e.detail || {};
      if (address?.trim()) geocodeAndNavigate(address.trim(), nodeId);
    };
    window.addEventListener('map-geocode-address', handler);
    return () => window.removeEventListener('map-geocode-address', handler);
  }, [geocodeAndNavigate]);

  // ── Manual search (no new pin, just fly) ────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await res.json();
      if (!data?.length) { showAlert('Adresse introuvable'); return; }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (!isNaN(lat)) { setFlyTarget([lat, lng]); setFlyZoom(15); showAlert(data[0].display_name); }
    } catch { showAlert('Erreur'); }
    finally { setSearching(false); }
  }, [searchQuery, showAlert]);

  const handlePinNotesChange = useCallback((pinId: string, notes: string) => {
    if (onUpdatePin) {
      onUpdatePin(pinId, { notes, updatedAt: new Date().toISOString() });
    } else {
      onUpdatePins(pins.map(p => p.id === pinId ? { ...p, notes, updatedAt: new Date().toISOString() } : p));
    }
  }, [onUpdatePin, onUpdatePins, pins]);

  const handleCopyCoords = useCallback(async (pin: MapPin) => {
    const txt = `${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}`;
    try { await navigator.clipboard.writeText(txt); } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: txt });
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} document.body.removeChild(ta);
    }
    setCopiedPinId(pin.id);
    setTimeout(() => setCopiedPinId(null), 1600);
  }, []);

  const locationNodes = nodes.filter(n => (n.data as EntityData)?.entityType === 'location');
  const safePins = Array.isArray(pins)
    ? pins.filter(p => p && typeof p.lat === 'number' && !isNaN(p.lat) && isFinite(p.lat))
    : [];

  if (!isClient) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-dark">
        <p className="text-cyber-text-dim font-mono text-xs">Chargement de la carte…</p>
      </div>
    );
  }

  return (
    <div className="map-tab-root">
      {/* Search bar */}
      <div className="map-search-bar">
        <span className="map-search-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher une adresse, un lieu…"
          className="map-search-input"
        />
        <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="map-search-btn">
          {searching ? '…' : 'OK'}
        </button>
      </div>

      {alert && <div className="map-alert">{alert}</div>}

      {/* Map — single MapContainer, never remounted */}
      <div className="map-leaflet-container">
        <MapContainer
          center={[46.603354, 1.888334]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          zoomControl
        >
          {/* CartoDB Voyager: dark but with readable streets + labels */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            subdomains="abcd"
            maxZoom={19}
          />
          <FlyToTarget target={flyTarget} zoom={flyZoom} />

          {/* Pins from geocoded entities */}
          {safePins.map(pin => (
            <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon}>
              <Popup className="pin-popup-wrapper" minWidth={340} maxWidth={360}>
                <PinPopupContent
                  pin={pin}
                  copied={copiedPinId === pin.id}
                  onCopy={handleCopyCoords}
                  onNotesChange={handlePinNotesChange}
                />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Entity list */}
      <div className="map-entity-list">
        <p className="map-entity-list-title">
          Entités Adresse ({locationNodes.length}) — cliquer pour géocoder
        </p>
        {locationNodes.length === 0 ? (
          <p className="map-entity-empty">Aucune entité Adresse dans ce cas</p>
        ) : (
          <div className="map-entity-items">
            {locationNodes.map(node => {
              const data = node.data as EntityData;
              const address = String(data.label || data.fields?.address || data.notes || '');
              const hasCoords = !!(data.fields?.lat && data.fields?.lng);
              const isLoading = geocodingId === node.id;
              return (
                <button
                  key={node.id}
                  onClick={() => geocodeAndNavigate(address, node.id)}
                  disabled={isLoading}
                  className={`map-entity-item ${isLoading ? 'loading' : hasCoords ? 'geocoded' : ''}`}
                >
                  <span className="map-entity-dot" style={{ background: hasCoords ? '#10b981' : '#475569' }} />
                  <span className="map-entity-label">{isLoading ? 'Géocodage…' : address || 'Sans adresse'}</span>
                  {hasCoords && <span className="map-entity-badge">GPS ✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Popup content as a separate component ──────────────────────────────────
interface PinPopupProps {
  pin: MapPin;
  copied: boolean;
  onCopy: (pin: MapPin) => void;
  onNotesChange: (id: string, notes: string) => void;
}
function PinPopupContent({ pin, copied, onCopy, onNotesChange }: PinPopupProps) {
  return (
    <div className="pin-popup">
      <div className="pin-popup-header">
        <span className="pin-popup-dot" />
        <span className="pin-popup-title">{pin.label || 'Lieu'}</span>
      </div>
      <div className="pin-popup-body">
        <div className="pin-popup-section">
          <div className="pin-popup-label">Address</div>
          <div className="pin-popup-address">{pin.address || '(non renseignée)'}</div>
        </div>
        <div className="pin-popup-section">
          <div className="pin-popup-label">GPS Coordinates</div>
          <div className="pin-popup-coords">
            <span>Lat: {pin.lat.toFixed(6)}</span>
            <span>Lng: {pin.lng.toFixed(6)}</span>
          </div>
        </div>
        <div className="pin-popup-section">
          <div className="pin-popup-label">Investigator Notes</div>
          <textarea
            className="pin-popup-notes"
            defaultValue={pin.notes || ''}
            placeholder="Investigator notes (e.g. Suspect home, shell company address, social scene)…"
            onChange={e => onNotesChange(pin.id, e.target.value)}
          />
        </div>
      </div>
      {copied && <div className="pin-popup-copied">Coordonnées copiées !</div>}
      <div className="pin-popup-actions">
        <button className="pin-popup-btn pin-popup-btn-copy" onClick={() => onCopy(pin)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copier GPS
        </button>
        <a
          className="pin-popup-btn pin-popup-btn-gmaps"
          href={`https://www.google.com/maps/search/?api=1&query=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`}
          target="_blank"
          rel="noreferrer"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Google Maps
        </a>
      </div>
    </div>
  );
}
