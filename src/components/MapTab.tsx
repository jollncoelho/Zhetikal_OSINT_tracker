import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin, EntityNode, EntityData } from '../types';

// Fix icônes Leaflet
if (typeof window !== 'undefined') {
  try {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  } catch (e) {
    console.error('Leaflet icon error:', e);
  }
}

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Composant pour recentrer la carte
function RecenterMap({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1] && !isNaN(center[0]) && !isNaN(center[1])) {
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

interface MapTabProps {
  pins: MapPin[];
  nodes: EntityNode[];
  onUpdatePins: (pins: MapPin[]) => void;
}

export default function MapTab({ pins, nodes, onUpdatePins }: MapTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.603354, 1.888334]);
  const [mapZoom, setMapZoom] = useState(6);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // ✅ Écouter l'événement de navigation
  useEffect(() => {
    const handleNavigate = (e: any) => {
      console.log('[MapTab] Navigation event received:', e.detail);
      const { pinId, lat, lng } = e.detail || {};
      
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        console.log('[MapTab] Moving to:', { lat, lng });
        setMapCenter([lat, lng]);
        setMapZoom(15);
        if (pinId) setSelectedPinId(pinId);
        setMapKey(prev => prev + 1);
        setAlertMessage(`📍 Position: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setTimeout(() => setAlertMessage(null), 3000);
      } else {
        console.error('[MapTab] Invalid coordinates:', { lat, lng });
        setAlertMessage('❌ Coordonnées invalides');
        setTimeout(() => setAlertMessage(null), 3000);
      }
    };

    window.addEventListener('map-navigate-pin', handleNavigate);
    return () => window.removeEventListener('map-navigate-pin', handleNavigate);
  }, []);

  // Recherche d'adresse
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
        return;
      }

      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);

      if (!isNaN(lat) && !isNaN(lng)) {
        setMapCenter([lat, lng]);
        setMapZoom(15);
        setMapKey(prev => prev + 1);
        setAlertMessage(`✅ ${results[0].display_name}`);
        setTimeout(() => setAlertMessage(null), 4000);
      }
    } catch (err) {
      setAlertMessage('❌ Erreur de recherche');
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Extraire les adresses des nodes Location
  const locationNodes = nodes.filter(n => 
    (n.data as EntityData)?.entityType === 'location'
  );

  const safePins = Array.isArray(pins) ? pins.filter(p => 
    p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
  ) : [];

  if (!isClient) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-dark" style={{ minHeight: '500px' }}>
        <p className="text-cyber-text-dim font-mono">Chargement de la carte...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative w-full h-full" style={{ minHeight: '600px' }}>
      {/* Barre de recherche */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-cyber-border bg-cyber-dark/90 z-20 flex-shrink-0">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher une adresse..."
          className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text outline-none focus:border-cyber-cyan"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-3 py-1.5 rounded bg-cyber-cyan/20 text-cyber-cyan text-xs disabled:opacity-40"
        >
          {searching ? '🔍...' : 'OK'}
        </button>
      </div>

      {/* Alerte */}
      {alertMessage && (
        <div className="absolute top-14 left-1/2 z-30 px-4 py-2 rounded bg-cyber-dark/95 border border-cyber-border text-xs font-mono shadow-lg">
          {alertMessage}
        </div>
      )}

      {/* Carte */}
      <div className="flex-1 relative" style={{ height: 'calc(100% - 180px)', minHeight: '400px' }}>
        <MapContainer
          key={mapKey}
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%', zIndex: 1 }}
          className="z-0"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OSM"
          />
          <RecenterMap center={mapCenter} zoom={mapZoom} />
          
          {/* Marqueur de recherche */}
          <Marker position={mapCenter} icon={redIcon}>
            <Popup>
              <div className="text-xs font-mono">
                Position<br/>
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
              icon={blueIcon}
              eventHandlers={{
                click: () => {
                  setSelectedPinId(pin.id);
                  setMapCenter([pin.lat, pin.lng]);
                  setMapZoom(15);
                  setMapKey(prev => prev + 1);
                }
              }}
            >
              <Popup>
                <div className="text-xs font-mono">
                  <strong>{pin.label}</strong><br/>
                  {pin.address && <span className="text-gray-600">{pin.address}</span>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Liste des locations */}
      <div className="h-32 border-t border-cyber-border bg-cyber-dark/90 overflow-y-auto flex-shrink-0">
        <div className="p-2">
          <p className="text-[10px] text-cyber-text-dim font-mono mb-1 uppercase">
            Entités Location ({locationNodes.length})
          </p>
          {locationNodes.length === 0 ? (
            <p className="text-xs text-cyber-text-dim text-center py-2">Aucune entité Location</p>
          ) : (
            <div className="space-y-1">
              {locationNodes.map((node) => {
                const data = node.data as EntityData;
                const address = data.fields?.address || data.notes || data.label;
                return (
                  <button
                    key={node.id}
                    onClick={() => {
                      console.log('[MapTab] Click on location:', { 
                        id: node.id, 
                        label: data.label,
                        fields: data.fields,
                        notes: data.notes 
                      });
                      // Déclencher l'événement de navigation
                      window.dispatchEvent(new CustomEvent('entity-go-to-map', {
                        detail: { nodeId: node.id }
                      }));
                    }}
                    className="w-full text-left px-2 py-1 rounded text-xs font-mono hover:bg-cyber-panel transition-colors text-cyber-text-dim"
                  >
                    <span className="w-2 h-2 rounded-full inline-block mr-2 bg-cyber-green" />
                    {address || 'Sans adresse'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}