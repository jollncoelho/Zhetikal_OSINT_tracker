import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Icône personnalisée robuste générée en code CSS pur (évite le bug des images cassées de Vite)
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

// Fonction de géocodage mondiale et blindée contre le crash NaN
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { 'Accept-Language': 'fr,en' } }
    );
    const results = await res.json();
    
    if (!Array.isArray(results) || results.length === 0) return null;
    
    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);

    // Blocage de sécurité : si l'API répond n'importe quoi ou une chaîne vide
    if (isNaN(lat) || isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

// Sous-composant pour capturer l'instance Leaflet sans stale closures
function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  mapRef.current = map;
  return null;
}

export default function MapTab({ focusTarget, onFocusConsumed, isVisible }: MapTabProps) {
  const [markerState, setMarkerState] = useState<MarkerState>({ kind: 'none' });
  const mapRef = useRef<L.Map | null>(null);

  // Recalcule la taille du conteneur Leaflet quand l'onglet devient visible
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
        
        // Si les coordonnées sont valides et existent
        if (pos && !isNaN(pos.lat) && !isNaN(pos.lng)) {
          setMarkerState({ kind: 'ok', lat: pos.lat, lng: pos.lng, address });
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
  }, [focusTarget]);

  return (
    <div className="h-full w-full relative">
      {/* Alertes visuelles de traitement */}
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
        
        <MapRefCapture mapRef={mapRef} />
        
        {/* Rendu sécurisé du marqueur de la goutte rouge */}
        {markerState.kind === 'ok' && !isNaN(markerState.lat) && !isNaN(markerState.lng) && (
          <Marker
            key={`marker-${markerState.lat}-${markerState.lng}-${Date.now()}`}
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