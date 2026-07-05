import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '../types';

// Fix icône Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ✅ COMPOSANT SÉCURISÉ
function MapController({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    // ✅ VÉRIFICATION STRICTE avant de déplacer la carte
    if (
      typeof lat === 'number' && 
      typeof lng === 'number' && 
      !isNaN(lat) && 
      !isNaN(lng) && 
      isFinite(lat) && 
      isFinite(lng) &&
      lat >= -90 && 
      lat <= 90 && 
      lng >= -180 && 
      lng <= 180
    ) {
      map.flyTo([lat, lng], zoom, { duration: 1.5 });
    } else {
      console.warn('MapController: Coordonnées invalides ignorées:', { lat, lng });
    }
  }, [lat, lng, zoom, map]);
  
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
  // ✅ État initial valide (centre de la France)
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.603354, 1.888334]);
  const [mapZoom, setMapZoom] = useState(6);
  const [markerKey, setMarkerKey] = useState(Date.now());
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Sécurité pour pins
  const safePins = Array.isArray(pins) ? pins : [];

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const { pinId, lat, lng } = (e as CustomEvent).detail;
      
      // ✅ Vérification stricte
      if (
        typeof lat !== 'number' || 
        typeof lng !== 'number' || 
        isNaN(lat) || 
        isNaN(lng) || 
        !isFinite(lat) || 
        !isFinite(lng)
      ) {
        setAlertMessage(`⚠️ Coordonnées invalides (NaN détecté)`);
        setTimeout(() => setAlertMessage(null), 4000);
        return;
      }
      
      setMapCenter([lat, lng]);
      setMapZoom(15);
      setSelectedPinId(pinId);
      setMarkerKey(Date.now());
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
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`
      );

      if (!response.ok) throw new Error('Erreur réseau');

      const results = await response.json();

      if (!results || results.length === 0) {
        setAlertMessage(`❌ Adresse introuvable : "${searchQuery}"`);
        setTimeout(() => setAlertMessage(null), 5000);
        setSearching(false);
        return;
      }

      const result = results[0];
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);

      // ✅ Vérification complète des coordonnées
      if (
        isNaN(lat) || 
        isNaN(lng) || 
        !isFinite(lat) || 
        !isFinite(lng) || 
        lat < -90 || 
        lat > 90 || 
        lng < -180 || 
        lng > 180
      ) {
        setAlertMessage(`⚠️ Coordonnées invalides reçues`);
        setTimeout(() => setAlertMessage(null), 5000);
        setSearching(false);
        return;
      }

      setMapCenter([lat, lng]);
      setMapZoom(15);
      setMarkerKey(Date.now());
      setAlertMessage(`✅ Trouvé: ${result.display_name}`);
      setTimeout(() => setAlertMessage(null), 4000);
    } catch (err) {
      setAlertMessage(`❌ Erreur: ${err instanceof Error ? err.message : 'Inconnue'}`);
      setTimeout(() => setAlertMessage(null), 5000);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ✅ Filtrer uniquement les pins valides
  const validPins = safePins.filter(pin => 
    pin && 
    typeof pin.lat === 'number' && 
    typeof pin.lng === 'number' && 
    !isNaN(pin.lat) && 
    !isNaN(pin.lng) && 
    isFinite(pin.lat) && 
    isFinite(pin.lng)
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="h-12 flex items-center gap-2 px-4 border-b border-cyber-border bg-cyber-dark/90 backdrop-blur-sm z-10 flex-shrink-0">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher une adresse (international)..."
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

      {alertMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-cyber-dark/95 border border-cyber-border text-xs font-mono text-cyber-text shadow-lg animate-fade-in max-w-md">
          {alertMessage}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="w-full h-full"
          worldCopyJump={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController lat={mapCenter[0]} lng={mapCenter[1]} zoom={mapZoom} />
          <Marker key={`search-${markerKey}`} position={mapCenter} icon={redIcon}>
            <Popup>Position: {mapCenter[0].toFixed(6)}, {mapCenter[1].toFixed(6)}</Popup>
          </Marker>
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

      {/* Liste des pins */}
      <div className="h-32 border-t border-cyber-border bg-cyber-dark/90 overflow-y-auto flex-shrink-0">
        <div className="p-2 space-y-1">
          {validPins.length === 0 ? (
            <p className="text-xs text-cyber-text-dim font-mono text-center py-4">Aucun pin sauvegardé</p>
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