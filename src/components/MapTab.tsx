import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons broken by Vite asset hashing
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export interface FocusTarget {
  address: string;
}

interface MapTabProps {
  focusTarget?: FocusTarget | null;
  onFocusConsumed?: () => void;
}

type MarkerState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ok'; lat: number; lng: number; address: string }
  | { kind: 'error'; address: string };

const COUNTRY_KEYWORDS = ['france', 'belgique', 'suisse', 'luxembourg', 'maroc', 'algérie', 'tunisie', 'usa', 'united states', 'uk', 'germany', 'espagne', 'spain', 'italie', 'italy'];

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const lower = address.toLowerCase();
  const hasCountry = COUNTRY_KEYWORDS.some((k) => lower.includes(k));
  const query = hasCountry ? address : `${address}, France`;

  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr,be,ch,lu` +
    `&q=${encodeURIComponent(query)}`;

  const res = await fetch(url, { headers: { 'Accept-Language': 'fr,en' } });
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) {
    // Retry without country restriction if nothing found (e.g. explicit foreign address)
    const fallback = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { 'Accept-Language': 'fr,en' } }
    );
    const fallbackResults = await fallback.json();
    if (!Array.isArray(fallbackResults) || fallbackResults.length === 0) return null;
    return { lat: parseFloat(fallbackResults[0].lat), lng: parseFloat(fallbackResults[0].lon) };
  }
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// Must live inside MapContainer to access the Leaflet map instance via useMap().
function FlyController({
  markerState,
  onFocusConsumed,
}: {
  markerState: MarkerState;
  onFocusConsumed?: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (markerState.kind !== 'ok') return;
    map.flyTo([markerState.lat, markerState.lng], 15, { duration: 1.2 });
    onFocusConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerState]);

  return null;
}

export default function MapTab({ focusTarget, onFocusConsumed }: MapTabProps) {
  const [markerState, setMarkerState] = useState<MarkerState>({ kind: 'none' });

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
        } else {
          setMarkerState({ kind: 'error', address });
        }
      })
      .catch(() => {
        if (!cancelled) setMarkerState({ kind: 'error', address });
      });

    return () => { cancelled = true; };
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
        center={[20, 0]}
        zoom={2}
        zoomControl={false}
        attributionControl
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyController markerState={markerState} onFocusConsumed={onFocusConsumed} />
        {markerState.kind === 'ok' && (
          <Marker
            key={`${markerState.lat},${markerState.lng}`}
            position={[markerState.lat, markerState.lng]}
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
