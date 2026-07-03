import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '../types';

interface MapTabProps {
  pins: MapPin[];
  onUpdatePins: (pins: MapPin[]) => void;
}

export default function MapTab({ pins, onUpdatePins }: MapTabProps) {
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

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
    console.log('PIN CLICKED', pin.id, pin.lat, pin.lng, pin.label, pin.address);
    setOpenPopupId(prev => (prev === pin.id ? null : pin.id));
  };

  const handleSavePin = (pin: MapPin) => {
    onUpdatePins(pins.map(p => (p.id === pin.id ? pin : p)));
  };

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        zoomControl={false}
        attributionControl={true}
        whenCreated={(map) => {
          mapRef.current = map;
        }}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onClick={handleMapClick} />
        {pins.map(pin => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            eventHandlers={{
              click: () => handleMarkerClick(pin),
            }}
          >
            {openPopupId === pin.id && (
              <Popup>
                <div className="space-y-2">
                  <input
                    defaultValue={pin.label}
                    onBlur={(e) =>
                      handleSavePin({ ...pin, label: e.target.value || 'Lieu' })
                    }
                    className="font-bold text-sm border rounded px-1"
                  />
                  <input
                    defaultValue={pin.address}
                    onBlur={(e) =>
                      handleSavePin({ ...pin, address: e.target.value })
                    }
                    className="text-xs border rounded px-1 w-64"
                  />
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => {
                        mapRef.current?.flyTo([pin.lat, pin.lng], 16, { duration: 1.5 });
                      }}
                    >
                      Centrer
                    </button>
                    <button
                      onClick={() => {
                        window.open(
                          `https://www.google.com/maps?q=${pin.lat},${pin.lng}`,
                          '_blank'
                        );
                      }}
                    >
                      Google Maps
                    </button>
                  </div>
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function MapClickHandler({ onClick }: { onClick: (e: L.LeafletMouseEvent) => void }) {
  useMapEvents({
    click: onClick,
  });
  return null;
}