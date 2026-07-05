import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PIN_ICON = L.divIcon({
  html: `<div style="
    width:14px;height:14px;border-radius:50%;
    background:#ef4444;border:2.5px solid #fff;
    box-shadow:0 0 0 2px rgba(239,68,68,.45),0 2px 8px rgba(0,0,0,.5);
  "></div>`,
  className: 'custom-pin',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -10],
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

type MarkerState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ok'; lat: number; lng: number; address: string }
  | { kind: 'error'; address: string };

// Keywords that indicate a non-FR/BE/CH address — skip country restriction for these
const FOREIGN_COUNTRY_KEYWORDS = [
  'maroc', 'algérie', 'algerie', 'tunisie', 'usa', 'united states', 'uk',
  'germany', 'allemagne', 'espagne', 'spain', 'italie', 'italy', 'portugal',
  'canada', 'australia', 'chine', 'china', 'russie', 'russia',
];

const FR_ZONE_KEYWORDS = ['france', 'belgique', 'suisse', 'luxembourg'];

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const lower = address.toLowerCase();
  const isForeign = FOREIGN_COUNTRY_KEYWORDS.some((k) => lower.includes(k));
  const hasCountry = isForeign || FR_ZONE_KEYWORDS.some((k) => lower.includes(k));

  // When no country is detected, append ", France" to steer Nominatim toward FR
  const query = hasCountry ? address : `${address}, France`;

  if (!isForeign) {
    // Strict search restricted to FR/BE/CH/LU — prevents jumps to the USA
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
        `&countrycodes=fr,be,ch,lu&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept-Language': 'fr,en' } }
      );
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
      }
    } catch {
      // fall through to global retry
    }
  }

  // Global fallback for foreign addresses or FR addresses not found above
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { 'Accept-Language': 'fr,en' } }
    );
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

// Sub-component inside MapContainer — exposes the Leaflet map instance via a ref
// so the parent can call flyTo() directly without any stale-closure risk.
function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  mapRef.current = map;
  return null;
}

export default function MapTab({ focusTarget, onFocusConsumed, isVisible }: MapTabProps) {
  const [markerState, setMarkerState] = useState<MarkerState>({ kind: 'none' });
  const mapRef = useRef<L.Map | null>(null);

  // When the map tab becomes visible, recalculate tile layout —
  // Leaflet loses track of dimensions while the container is hidden.
  useEffect(() => {
    if (isVisible && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 50);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!focusTarget?.address.trim()) {
      setMarkerState({ kind: 'none' });
      return;
    }

    const address = focusTarget.address.trim();
    let cancelled = false;
    setMarkerState({ kind: 'loading' });

    geocode(address)
      .then((pos) => {
        if (cancelled) return;
        if (pos) {
          setMarkerState({ kind: 'ok', lat: pos.lat, lng: pos.lng, address });
          // Always uses the live map instance — no stale closure possible
          mapRef.current?.flyTo([pos.lat, pos.lng], 15, { duration: 1.2 });
        } else {
          setMarkerState({ kind: 'error', address });
        }
        onFocusConsumed?.();
      })
      .catch(() => {
        if (!cancelled) {
          setMarkerState({ kind: 'error', address });
          onFocusConsumed?.();
        }
      });

    return () => { cancelled = true; };
  // focusTarget is a new object reference each time App calls setMapFocusTarget({ address })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  return (
    <div className="h-full w-full relative">
      {markerState.kind === 'loading' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(15,23,42,0.92)',
          border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8,
          padding: '7px 16px', color: '#a5b4fc', fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 12, height: 12,
            border: '2px solid rgba(99,102,241,0.4)', borderTopColor: '#818cf8',
            borderRadius: '50%', display: 'inline-block',
            animation: 'spin 0.75s linear infinite',
          }} />
          Géocodage en cours…
        </div>
      )}

      {markerState.kind === 'error' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(127,29,29,0.92)',
          border: '1px solid rgba(239,68,68,0.5)', borderRadius: 8,
          padding: '7px 16px', color: '#fca5a5', fontSize: 12, fontWeight: 600,
        }}>
          Adresse introuvable : « {markerState.address} »
        </div>
      )}

      <MapContainer
        center={[46.5, 2.5]}
        zoom={5}
        zoomControl={false}
        attributionControl
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Captures the live map instance into mapRef on every render */}
        <MapRefCapture mapRef={mapRef} />
        {markerState.kind === 'ok' && (
          <Marker
            key={`${markerState.lat},${markerState.lng}`}
            position={[markerState.lat, markerState.lng]}
            icon={PIN_ICON}
          >
            <Popup>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{markerState.address}</span>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
