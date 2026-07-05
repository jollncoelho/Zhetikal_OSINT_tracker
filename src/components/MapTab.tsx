import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '../types';

// Fix icônes Leaflet
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
  const [isMounted, setIsMounted] = useState(false);

  // IMPORTANT: Attendre que le composant soit monté
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Navigation vers un pin
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
        console.error('Navigation error:', err);
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
        setAlertMessage(`✅ Trouvé: ${results[0].display_name}`);
        setTimeout(() => setAlertMessage(null), 4000);
      }
    } catch (err) {
      setAlertMessage('❌ Erreur de recherche');
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const safePins = Array.isArray(pins) ? pins.filter(p => 
    p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
  ) : [];

  // Ne pas rendre la carte avant qu'elle soit montée
  if (!isMounted) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-dark">
        <p className="text-cyber-text-dim font-mono">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative w-full h-full">
      {/* Barre de recherche */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-cyber-border bg-cyber-dark/90 z-10 flex-shrink-0">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher une adresse..."
          className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text outline-none focus:border-cyber-cyan font-mono"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-3 py-1.5 rounded bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan text-xs font-semibold hover:bg-cyber-cyan/30 disabled:opacity-40"
        >
          {searching ? '🔍...' : 'Rechercher'}
        </button>
      </div>

      {/* Alerte */}
      {alertMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded bg-cyber-dark/95 border border-cyber-border text-xs font-mono shadow-lg">
          {alertMessage}
        </div>
      )}

      {/* IMPORTANT: Conteneur de carte avec dimensions explicites */}
      <div className="flex-1 relative w-full h-full" style={{ minHeight: '400px', minWidth: '100%' }}>
        <div className="absolute inset-0 w-full h-full">
          <MapContainer
            key={markerKey}
            center={mapCenter}
            zoom={mapZoom}
            className="w-full h-full"
            style={{ minHeight: '100%', minWidth: '100%', zIndex: 1 }}
            worldCopyJump={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            
            {/* Marker de recherche */}
            <Marker 
              key={`search-${markerKey}`} 
              position={mapCenter} 
              icon={redIcon}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong>Position</strong><br/>
                  Lat: {mapCenter[0].toFixed(6)}<br/>
                  Lng: {mapCenter[1].toFixed(6)}
                </div>
              </Popup>
            </Marker>

            {/* Pins sauvegardés */}
            {safePins.map((pin) => (
              <Marker
                key={pin.id}
                position={[pin.lat, pin.lng]}
                eventHandlers={{ click: () => setSelectedPinId(pin.id) }}
              >
                <Popup>
                  <div className="text-xs font-mono">
                    <strong style={{ color: pin.color || '#3b82f6' }}>{pin.label}</strong><br/>
                    {pin.address && <span>{pin.address}<br/></span>}
                    {pin.notes && <span className="italic text-gray-600">{pin.notes}</span>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Liste des pins */}
      <div className="h-32 border-t border-cyber-border bg-cyber-dark/90 overflow-y-auto flex-shrink-0">
        <div className="p-2 space-y-1">
          {safePins.length === 0 ? (
            <p className="text-xs text-cyber-text-dim font-mono text-center py-4">Aucun pin sauvegardé</p>
          ) : (
            safePins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => {
                  setMapCenter([pin.lat, pin.lng]);
                  setMapZoom(15);
                  setSelectedPinId(pin.id);
                  setMarkerKey(Date.now());
                }}
                className={`w-full text-left px-2 py-1 rounded text-xs font-mono transition-colors ${
                  selectedPinId === pin.id
                    ? 'bg-cyber-cyan/15 border border-cyber-cyan/30 text-cyber-cyan'
                    : 'hover:bg-cyber-panel border border-transparent text-cyber-text-dim'
                }`}
              >
                <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: pin.color || '#3b82f6' }} />
                {pin.label}
                <span className="text-[10px] opacity-60 ml-2">
                  ({pin.lat.toFixed(4)}, {pin.lng.toFixed(4)})
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}