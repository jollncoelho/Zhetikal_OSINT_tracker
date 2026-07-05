import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '../types';

// Fix icônes Leaflet de base
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

// Icône de recherche Rouge
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_LAT = 46.603354;
const DEFAULT_LNG = 1.888334;

// Contrôleur qui gère le déplacement de la carte sans détruire le conteneur HTML
function MapController({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    const isValidLat = typeof lat === 'number' && !isNaN(lat) && isFinite(lat) && lat >= -90 && lat <= 90;
    const isValidLng = typeof lng === 'number' && !isNaN(lng) && isFinite(lng) && lng >= -180 && lng <= 180;
    
    if (isValidLat && isValidLng) {
      map.flyTo([lat, lng], zoom, { duration: 1.5 });
    }
  }, [lat, lng, zoom, map]);
  
  return null;
}

interface MapTabProps {
  pins: MapPin[];
  onUpdatePins: (pins: MapPin[]) => void;
}

export default function MapTab({ pins: propPins, onUpdatePins }: MapTabProps) {
  const [localPins, setLocalPins] = useState<MapPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([DEFAULT_LAT, DEFAULT_LNG]);
  const [mapZoom, setMapZoom] = useState(6);
  const [markerKey, setMarkerKey] = useState(0);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const safePins = Array.isArray(propPins) ? propPins : [];
    setLocalPins(safePins);
    setIsReady(true);
  }, [propPins]);

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail || {};
        const lat = detail.lat;
        const lng = detail.lng;
        const pinId = detail.pinId;
        
        if (
          typeof lat !== 'number' || 
          typeof lng !== 'number' || 
          isNaN(lat) || 
          isNaN(lng) || 
          !isFinite(lat) || 
          !isFinite(lng) ||
          lat < -90 || lat > 90 ||
          lng < -180 || lng > 180
        ) {
          console.error('Coordonnées invalides reçues:', { lat, lng });
          setAlertMessage('⚠️ Position invalide');
          setTimeout(() => setAlertMessage(null), 3000);
          return;
        }
        
        setMapCenter([lat, lng]);
        setMapZoom(15);
        if (pinId) setSelectedPinId(pinId);
        setMarkerKey(Date.now());
      } catch (err) {
        console.error('Erreur handleNavigate:', err);
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
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`,
        { headers: { 'Accept-Language': 'fr' } }
      );

      if (!response.ok) throw new Error('Erreur réseau');
      const results = await response.json();

      if (!results || results.length === 0) {
        setAlertMessage(`❌ Adresse introuvable`);
        setTimeout(() => setAlertMessage(null), 4000);
        return;
      }

      const result = results[0];
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);

      if (
        isNaN(lat) || isNaN(lng) || 
        !isFinite(lat) || !isFinite(lng) ||
        lat < -90 || lat > 90 || 
        lng < -180 || lng > 180
      ) {
        setAlertMessage('⚠️ Coordonnées invalides');
        setTimeout(() => setAlertMessage(null), 4000);
        return;
      }

      setMapCenter([lat, lng]);
      setMapZoom(15);
      setMarkerKey(Date.now());
      setAlertMessage(`✅ ${result.display_name}`);
      setTimeout(() => setAlertMessage(null), 4000);
    } catch (err) {
      console.error('Erreur search:', err);
      setAlertMessage(`❌ Erreur de recherche`);
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const validPins = localPins.filter(pin => {
    if (!pin) return false;
    if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return false;
    if (isNaN(pin.lat) || isNaN(pin.lng)) return false;
    if (!isFinite(pin.lat) || !isFinite(pin.lng)) return false;
    if (pin.lat < -90 || pin.lat > 90) return false;
    if (pin.lng < -180 || pin.lng > 180) return false;
    return true;
  });

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-dark">
        <p className="text-cyber-text-dim font-mono text-sm">Chargement de la carte...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Barre de recherche */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-cyber-border bg-cyber-dark/90 backdrop-blur-sm z-10 flex-shrink-0">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher une adresse..."
          className="flex-1 bg-cyber-black border border-cyber-border rounded-lg px-3 py-1.5 text-xs text-cyber-text outline-none focus:border-cyber-cyan font-mono"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-3 py-1.5 rounded-lg bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan text-xs font-semibold hover:bg-cyber-cyan/30 transition-colors disabled:opacity-40"
        >
          {searching ? '🔍...' : 'Rechercher'}
        </button>
      </div>

      {/* Alerte */}
      {alertMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-cyber-dark/95 border border-cyber-border text-xs font-mono text-cyber-text shadow-lg max-w-md">
          {alertMessage}
        </div>
      )}

      {/* Conteneur de carte STABLE (Sans clé dynamique destructive) */}
      <div className="flex-1 min-h-0">
        <MapContainer
          center={[DEFAULT_LAT, DEFAULT_LNG]}
          zoom={mapZoom}
          className="w-full h-full"
          worldCopyJump={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Gère les déplacements de vue proprement via flyTo */}
          <MapController lat={mapCenter[0]} lng={mapCenter[1]} zoom={mapZoom} />
          
          {/* C'est ICI qu'on met la clé unique pour forcer le rafraîchissement de la goutte */}
          <Marker 
            key={`search-marker-${markerKey}-${mapCenter[0]}-${mapCenter[1]}`} 
            position={mapCenter} 
            icon={redIcon}
          >
            <Popup>
              <div className="text-xs font-mono">
                Position<br/>
                Lat: {mapCenter[0].toFixed(6)}<br/>
                Lng: {mapCenter[1].toFixed(6)}
              </div>
            </Popup>
          </Marker>

          {/* Rendu des autres pins enregistrés */}
          {validPins.map((pin) => (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              eventHandlers={{ click: () => setSelectedPinId(pin.id) }}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong style={{ color: pin.color || '#3b82f6' }}>{pin.label}</strong><br/>
                  {pin.address && <span>{pin.address}<br/></span>}
                  {pin.notes && <span className="italic text-cyber-text-dim">{pin.notes}</span>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Liste du bas */}
      <div className="h-32 border-t border-cyber-border bg-cyber-dark/90 overflow-y-auto flex-shrink-0">
        <div className="p-2 space-y-1">
          {validPins.length === 0 ? (
            <p className="text-xs text-cyber-text-dim font-mono text-center py-4">Aucun pin</p>
          ) : (
            validPins.map((pin) => (
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