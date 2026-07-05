import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search } from 'lucide-react';

// Pure CSS divIcon — no external image URLs, works in any Vite build
const PIN_ICON = L.divIcon({
  html: `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#ef4444;border:3px solid #fff;
    box-shadow:0 0 0 2px rgba(239,68,68,.55),0 2px 10px rgba(0,0,0,.6);
  "></div>`,
  className: 'custom-map-pin',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -12],
});

export interface FocusTarget {
  address: string;
  nonce: number;
}

interface MapTabProps {
  focusTarget?: FocusTarget | null;
  onFocusConsumed?: () => void;
  isVisible?: boolean;
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; lat: number; lng: number; label: string }
  | { kind: 'error'; address: string };

async function geocode(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { 'Accept-Language': 'fr,en' } }
    );
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      label: results[0].display_name?.split(',')[0] ?? address,
    };
  } catch {
    return null;
  }
}

// Calls map.setView when target changes — must live inside MapContainer
function Navigator({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prevTarget = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!target) return;
    if (prevTarget.current?.[0] === target[0] && prevTarget.current?.[1] === target[1]) return;
    prevTarget.current = target;
    map.setView(target, 14, { animate: true, duration: 0.8 });
  }, [map, target]);

  return null;
}

// Fixes Leaflet tile rendering after container switches from display:none
function SizeWatcher({ isVisible }: { isVisible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!isVisible) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    });
  }, [map, isVisible]);
  return null;
}

export default function MapTab({ focusTarget, onFocusConsumed, isVisible = true }: MapTabProps) {
  const [searchInput, setSearchInput] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' });
  const [navTarget, setNavTarget] = useState<[number, number] | null>(null);

  async function runSearch(address: string) {
    // 🛠️ NETTOYAGE STRICT : Retire les mots parasites comme "localisation" ou les labels d'entités invalides
    let cleanedAddress = address
      .replace(/(?:localisation|location|entité|entity)\s*:/i, '')
      .replace(/\b(localisation|location)\b/gi, '')
      .trim();

    if (!cleanedAddress) return;

    setSearchState({ kind: 'loading' });
    const result = await geocode(cleanedAddress);
    
    if (result && !isNaN(result.lat) && !isNaN(result.lng)) {
      setSearchState({ kind: 'ok', lat: result.lat, lng: result.lng, label: result.label });
      setNavTarget([result.lat, result.lng]);
    } else {
      setSearchState({ kind: 'error', address: cleanedAddress });
      // Auto-clear error after 5s
      setTimeout(() => setSearchState(s => s.kind === 'error' ? { kind: 'idle' } : s), 5000);
    }
  }

  // Triggered when an entity node sends the user to this map view
  useEffect(() => {
    if (!focusTarget?.address.trim()) return;
    
    const rawAddress = focusTarget.address.trim();
    // Affiche l'adresse brute dans le champ pour que l'utilisateur voie ce qu'il cherche
    setSearchInput(rawAddress);
    
    // Lance la recherche nettoyée de manière asynchrone
    runSearch(rawAddress).then(() => onFocusConsumed?.());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full h-full relative bg-[#0a0e17]">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyber-border bg-cyber-dark/90 flex-shrink-0" style={{ zIndex: 10 }}>
        <div className="relative flex-1 flex items-center">
          <Search size={13} className="absolute left-2.5 text-cyber-text-dim pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch(searchInput)}
            placeholder="Entrez une ville, une adresse ou un pays…"
            className="w-full pl-8 pr-3 py-1.5 bg-cyber-black border border-cyber-border rounded text-xs text-cyber-text font-mono outline-none focus:border-cyber-cyan transition-colors"
          />
        </div>
        <button
          onClick={() => runSearch(searchInput)}
          disabled={searchState.kind === 'loading'}
          className="px-4 py-1.5 rounded bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan text-xs font-semibold font-mono hover:bg-cyber-cyan/30 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {searchState.kind === 'loading' ? '…' : 'OK'}
        </button>
      </div>

      {/* Status banners */}
      {searchState.kind === 'loading' && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold font-mono text-[#a5b4fc]"
          style={{ top: 56, background: 'rgba(15,23,42,0.94)', border: '1px solid rgba(99,102,241,0.35)' }}>
          <span style={{
            width: 11, height: 11, borderRadius: '50%', display: 'inline-block',
            border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#818cf8',
            animation: 'mapspin 0.7s linear infinite',
          }} />
          Géocodage en cours…
        </div>
      )}

      {searchState.kind === 'ok' && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg text-xs font-semibold font-mono text-emerald-300"
          style={{ top: 56, background: 'rgba(6,37,26,0.94)', border: '1px solid rgba(52,211,153,0.35)' }}>
          Localisé : {searchState.label}
        </div>
      )}

      {searchState.kind === 'error' && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg text-xs font-semibold font-mono text-red-300"
          style={{ top: 56, background: 'rgba(69,10,10,0.94)', border: '1px solid rgba(239,68,68,0.4)' }}>
          Adresse introuvable : « {searchState.address} »
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        <MapContainer
          center={[46.6, 1.9]}
          zoom={6}
          zoomControl
          attributionControl
          style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SizeWatcher isVisible={isVisible} />
          <Navigator target={navTarget} />
          
          {searchState.kind === 'ok' && !isNaN(searchState.lat) && !isNaN(searchState.lng) && (
            <Marker
              key={`search-pin-${searchState.lat}-${searchState.lng}-${Date.now()}`}
              position={[searchState.lat, searchState.lng]}
              icon={PIN_ICON}
            >
              <Popup>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{searchState.label}</span>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <style>{`
        @keyframes mapspin { to { transform: rotate(360deg); } }
        .custom-map-pin { background: transparent !important; border: none !important; }
        .leaflet-container { font-family: inherit; }
      `}</style>
    </div>
  );
}