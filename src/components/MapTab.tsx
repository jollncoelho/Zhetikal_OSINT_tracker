import { useEffect, useRef, useState } from 'react';
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

// Countries whose names in the address string mean we should NOT append ", France"
// and should NOT restrict to fr/be/ch/lu.
const FOREIGN_COUNTRY_KEYWORDS = [
  'maroc', 'algérie', 'algerie', 'tunisie', 'usa', 'united states', 'uk',
  'germany', 'allemagne', 'espagne', 'spain', 'italie', 'italy', 'portugal',
  'belgique', 'suisse', 'luxembourg', 'canada', 'australia', 'chine', 'china',
];

const FR_ZONE_KEYWORDS = ['france', 'belgique', 'suisse', 'luxembourg'];

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const lower = address.toLowerCase();
  const isForeign = FOREIGN_COUNTRY_KEYWORDS.some((k) => lower.includes(k));
  const hasCountry = isForeign || FR_ZONE_KEYWORDS.some((k) => lower.includes(k));

  // Append ", France" when no country is specified — guides Nominatim toward FR
  const query = hasCountry ? address : `${address}, France`;

  // First attempt: restricted to FR/BE/CH/LU zone (unless explicitly foreign)
  if (!isForeign) {
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
      // fall through to global retry below
    }
  }

  // Fallback: global search (handles foreign addresses and FR addresses not found above)
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

// Lives inside MapContainer — accesses the live Leaflet map via useMap().
// Reads coordinates from a ref so it never captures stale prop values.
function FlyController({ flyRef }: { flyRef: React.MutableRefObject<(() => void) | null> }) {
  const map = useMap();

  useEffect(() => {
    // Register a stable callback that the outer component can invoke
    flyRef.current = () => {
      // The outer component writes target coords into coordsRef before calling this
    };
  }, [map, flyRef]);

  return null;
}

export default function MapTab({ focusTarget, onFocusConsumed }: MapTabProps) {
  const [markerState, setMarkerState] = useState<MarkerState>({ kind: 'none' });

  // mapRef gives us direct access to the Leaflet map instance from outside MapContainer
  const mapRef = useRef<L.Map | null>(null);

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
          // Fly using the ref — always fresh, no stale closure
          if (mapRef.current) {
            mapRef.current.flyTo([pos.lat, pos.lng], 15, { duration: 1.2 });
          }
        } else {
          setMarkerState({ kind: 'error', address });
        }
        // Consume after result is fully processed so the parent can trigger again
        onFocusConsumed?.();
      })
      .catch(() => {
        if (!cancelled) {
          setMarkerState({ kind: 'error', address });
          onFocusConsumed?.();
        }
      });

    return () => { cancelled = true; };
  // focusTarget object identity changes every time App calls setMapFocusTarget({ address })
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
        ref={mapRef}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
