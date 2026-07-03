import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '../types';

export interface FocusTarget {
  address: string;
}

interface MapTabProps {
  pins: MapPin[];
  onUpdatePins: (pins: MapPin[]) => void;
  focusTarget?: FocusTarget | null;
  onFocusConsumed?: () => void;
}

type GeoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; lat: number; lng: number; address: string }
  | { status: 'error'; address: string };

function FlyToController({
  geo,
  onReady,
}: {
  geo: GeoState;
  onReady: () => void;
}) {
  const map = useMap();
  const didFly = useRef(false);

  useEffect(() => {
    if (geo.status === 'ok' && !didFly.current) {
      didFly.current = true;
      map.flyTo([geo.lat, geo.lng], 15, { duration: 1.2 });
      onReady();
    }
  }, [geo, map, onReady]);

  useEffect(() => {
    didFly.current = false;
  }, [geo]);

  return null;
}

function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function MapClickHandler({ onClick }: { onClick: (e: L.LeafletMouseEvent) => void }) {
  useMapEvents({ click: onClick });
  return null;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { 'Accept-Language': 'fr,en' } }
  );
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

export default function MapTab({ pins, onUpdatePins, focusTarget, onFocusConsumed }: MapTabProps) {
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' });

  useEffect(() => {
    if (!focusTarget) {
      setGeo({ status: 'idle' });
      return;
    }

    const address = focusTarget.address.trim();
    if (!address) {
      setGeo({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setGeo({ status: 'loading' });

    geocode(address).then((pos) => {
      if (cancelled) return;
      if (pos) {
        setGeo({ status: 'ok', lat: pos.lat, lng: pos.lng, address });
      } else {
        setGeo({ status: 'error', address });
      }
    }).catch(() => {
      if (!cancelled) setGeo({ status: 'error', address });
    });

    return () => { cancelled = true; };
  }, [focusTarget]);

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng;
    const newPin: MapPin = {
      id: crypto.randomUUID(),
      label: 'Nouveau lieu',
      address: '',
      lat,
      lng,
      visitedAt: '',
      withWho: '',
      notes: '',
      color: '#3b82f6',
      iconId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdatePins([...pins, newPin]);
    setOpenPopupId(newPin.id);
  };

  const handleMarkerClick = (pin: MapPin) => {
    setOpenPopupId(prev => (prev === pin.id ? null : pin.id));
  };

  const handleSavePin = (pin: MapPin) => {
    onUpdatePins(pins.map(p => (p.id === pin.id ? pin : p)));
  };

  const focusIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 3px #ef444488;"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  return (
    <div className="h-full w-full relative">
      {geo.status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 8,
            padding: '7px 16px',
            color: '#a5b4fc',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              border: '2px solid rgba(99,102,241,0.4)',
              borderTopColor: '#818cf8',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.75s linear infinite',
            }}
          />
          Géocodage en cours…
        </div>
      )}

      {geo.status === 'error' && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(127,29,29,0.92)',
            border: '1px solid rgba(239,68,68,0.5)',
            borderRadius: 8,
            padding: '7px 16px',
            color: '#fca5a5',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Adresse introuvable : « {geo.address} »
        </div>
      )}

      <MapContainer
        center={[20, 0]}
        zoom={2}
        zoomControl={false}
        attributionControl={true}
        style={{ height: '100%', width: '100%' }}
      >
        <MapRefCapture mapRef={mapRef} />
        <FlyToController
          geo={geo}
          onReady={() => onFocusConsumed?.()}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onClick={handleMapClick} />

        {/* Persisted pins */}
        {pins.map(pin => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            eventHandlers={{ click: () => handleMarkerClick(pin) }}
          >
            {openPopupId === pin.id && (
              <Popup>
                <div className="space-y-2">
                  <input
                    defaultValue={pin.label}
                    onBlur={(e) => handleSavePin({ ...pin, label: e.target.value || 'Lieu' })}
                    className="font-bold text-sm border rounded px-1"
                  />
                  <input
                    defaultValue={pin.address}
                    onBlur={(e) => handleSavePin({ ...pin, address: e.target.value })}
                    className="text-xs border rounded px-1 w-64"
                  />
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => mapRef.current?.flyTo([pin.lat, pin.lng], 16, { duration: 1.5 })}>
                      Centrer
                    </button>
                    <button
                      onClick={() =>
                        window.open(`https://www.google.com/maps?q=${pin.lat},${pin.lng}`, '_blank')
                      }
                    >
                      Google Maps
                    </button>
                  </div>
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        {/* Temporary focus marker — current node only, cleared when address changes */}
        {geo.status === 'ok' && (
          <Marker position={[geo.lat, geo.lng]} icon={focusIcon}>
            <Popup>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{geo.address}</span>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
