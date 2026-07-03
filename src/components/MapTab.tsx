import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  console.log('[MapTab] geocoding address:', address);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { 'Accept-Language': 'fr,en' } }
  );
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

const focusIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 3px #ef444488;"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Runs inside MapContainer — has access to the Leaflet map instance.
// Every time markerState becomes 'ok' it flies to the new coordinates.
function FlyController({ markerState }: { markerState: MarkerState }) {
  const map = useMap();
  useEffect(() => {
    if (markerState.kind === 'ok') {
      map.flyTo([markerState.lat, markerState.lng], 15, { duration: 1.2 });
    }
  }, [markerState, map]);
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
          onFocusConsumed?.();
        } else {
          setMarkerState({ kind: 'error', address });
        }
      })
      .catch(() => {
        if (!cancelled) setMarkerState({ kind: 'error', address });
      });

    return () => { cancelled = true; };
  }, [focusTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full w-full relative">
      {/* Loading overlay */}
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

      {/* Error overlay */}
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
        <FlyController markerState={markerState} />
        {markerState.kind === 'ok' && (
          <Marker position={[markerState.lat, markerState.lng]} icon={focusIcon}>
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
