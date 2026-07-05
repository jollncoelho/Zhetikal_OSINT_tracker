import { useEffect, useState, useCallback } from 'react';
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

// Composant interne pour déplacer proprement la vue sans recréer la carte
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, zoom);
      // Force le rafraîchissement des tuiles pour éviter les carrés gris cassés
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }
  }, [center, zoom, map]);

  return null;
}

interface MapTabProps {
  pins: MapPin[];
  onUpdatePins: (pins: MapPin[]) => void;
}

export default function MapTab({ pins, onUpdatePins }: MapTabProps) {
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.603354, 1.888334]);
  const [mapZoom, setMapZoom] = useState(6);
  const [markerKey, setMarkerKey] = useState(0);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Navigation
  useEffect(() => {
    const handleNavigate = (e: any) => {
      try {
        const { pinId, lat, lng } = e.detail || {};
        if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
          setMapCenter([lat, lng]);
          setMapZoom(15);
          if (pinId) setSelectedPinId(pinId);
          setMarkerKey(Date.now());
        }
      } catch (err) {
        console.error('Nav error:', err);
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

      if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
        setMapCenter([lat, lng]);
        setMapZoom(15);
        setMarkerKey(Date.now());
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
    <div className="flex-1 flex flex-col min-h-0 relative w-full h-full">
      <div className="h-12 flex items-center gap-2 px-4 border-b border-cyber-border bg-cyber-dark/90 z-10 flex-shrink-0">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher..."
          className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text outline-none focus:border-cyber-cyan"
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
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded bg-cyber-dark border text-xs text-cyber-text">
          {alertMessage}
        </div>
      )}

      <div className="flex-1 min-h-0 relative w-full h-full">
        {/* Pas de clé dynamique ici, la carte reste fixe et stable dans le DOM */}
        <MapContainer
          center={[46.603354, 1.888334]}
          zoom={6}
          className="w-full h-full absolute inset-0"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OSM'
          />

          {/* Le contrôleur s'occupe de déplacer la carte proprement au changement d'état */}
          <MapController center={mapCenter} zoom={mapZoom} />

          <Marker key={`search-${markerKey}-${mapCenter[0]}-${mapCenter[1]}`} position={mapCenter} icon={redIcon}>
            <Popup>Search</Popup>
          </Marker>

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
    </div>
  );
}