import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '../types';

// Fix icônes
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Composant pour recentrer
function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom, { duration: 1 });
    }
  }, [center, zoom, map]);
  return null;
}

interface MapTabProps {
  pins: MapPin[];
  onUpdatePins: (pins: MapPin[]) => void;
}

export default function MapTab({ pins, onUpdatePins }: MapTabProps) {
  const mapRef = useRef<any>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.603354, 1.888334]);
  const [mapZoom, setMapZoom] = useState(6);
  const [searchMarkerPos, setSearchMarkerPos] = useState<[number, number] | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  // Navigation
  useEffect(() => {
    const handleNavigate = (e: any) => {
      const { pinId, lat, lng } = e.detail || {};
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        const newPos: [number, number] = [lat, lng];
        setMapCenter(newPos);
        setMapZoom(15);
        setSearchMarkerPos(newPos); // Marqueur indépendant
        if (pinId) setSelectedPinId(pinId);
        setRenderKey(prev => prev + 1);
      }
    };
    window.addEventListener('map-navigate-pin', handleNavigate);
    return () => window.removeEventListener('map-navigate-pin', handleNavigate);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setAlertMessage(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const results = await response.json();

      if (!results || results.length === 0) {
        setAlertMessage('❌ Adresse introuvable');
        setTimeout(() => setAlertMessage(null), 4000);
        setSearching(false);
        return;
      }

      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);

      if (!isNaN(lat) && !isNaN(lng)) {
        const newPos: [number, number] = [lat, lng];
        setMapCenter(newPos);
        setMapZoom(15);
        setSearchMarkerPos(newPos); // Marqueur de recherche indépendant
        setRenderKey(prev => prev + 1);
        setAlertMessage(`✅ Trouvé`);
        setTimeout(() => setAlertMessage(null), 4000);
      }
    } catch (err) {
      setAlertMessage('❌ Erreur');
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const safePins = Array.isArray(pins) ? pins.filter(p => 
    p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
  ) : [];

  return (
    <div className="flex-1 flex flex-col min-h-0 relative w-full h-full" style={{ minHeight: '600px' }}>
      {/* Barre recherche */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-cyber-border bg-cyber-dark/90 z-20 flex-shrink-0">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher..."
          className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-3 py-1.5 rounded bg-cyber-cyan/20 text-cyber-cyan text-xs disabled:opacity-40"
        >
          {searching ? '...' : 'OK'}
        </button>
      </div>

      {alertMessage && (
        <div className="absolute top-14 left-1/2 z-30 px-4 py-2 rounded bg-cyber-dark border text-xs">
          {alertMessage}
        </div>
      )}

      {/* CARTE - Container avec dimensions fixes */}
      <div className="flex-1 relative w-full" style={{ height: 'calc(100% - 180px)', minHeight: '400px' }}>
        <MapContainer
          key={`map-${renderKey}`}
          ref={mapRef}
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%', zIndex: 1 }}
          className="z-0"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OSM'
          />
          <Recenter center={mapCenter} zoom={mapZoom} />
          
          {/* Marqueur de recherche - position indépendante */}
          {searchMarkerPos && (
            <Marker key={`search-${renderKey}`} position={searchMarkerPos} icon={redIcon}>
              <Popup>Recherche</Popup>
            </Marker>
          )}

          {/* Pins */}
          {safePins.map((pin) => (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              eventHandlers={{ click: () => setSelectedPinId(pin.id) }}
            >
              <Popup>{pin.label}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Liste pins */}
      <div className="h-32 border-t border-cyber-border bg-cyber-dark/90 overflow-y-auto flex-shrink-0">
        <div className="p-2 space-y-1">
          {safePins.length === 0 ? (
            <p className="text-xs text-cyber-text-dim text-center py-4">Aucun pin</p>
          ) : (
            safePins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => {
                  const pos: [number, number] = [pin.lat, pin.lng];
                  setMapCenter(pos);
                  setMapZoom(15);
                  setSelectedPinId(pin.id);
                  setSearchMarkerPos(pos);
                  setRenderKey(prev => prev + 1);
                }}
                className={`w-full text-left px-2 py-1 rounded text-xs ${
                  selectedPinId === pin.id ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'hover:bg-cyber-panel'
                }`}
              >
                {pin.label} ({pin.lat.toFixed(2)}, {pin.lng.toFixed(2)})
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}