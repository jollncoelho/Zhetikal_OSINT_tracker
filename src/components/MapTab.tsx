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
  } catch (e) {}
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

function RecenterMap({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

interface MapTabProps {
  pins: MapPin[];
  nodes: EntityNode[];
  onUpdatePins: (pins: MapPin[]) => void;
  onGeocodeLocation?: (nodeId: string, lat: number, lng: number) => void;
}

export default function MapTab({ pins, nodes, onUpdatePins, onGeocodeLocation }: MapTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.603354, 1.888334]);
  const [mapZoom, setMapZoom] = useState(6);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  // Navigation depuis un pin
  useEffect(() => {
    const handleNavigate = (e: any) => {
      const { pinId, lat, lng } = e.detail || {};
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        setMapCenter([lat, lng]);
        setMapZoom(15);
        if (pinId) setSelectedPinId(pinId);
        setMapKey(prev => prev + 1);
      }
    };
    window.addEventListener('map-navigate-pin', handleNavigate);
    return () => window.removeEventListener('map-navigate-pin', handleNavigate);
  }, []);

  // ✅ FONCTION CLÉ : Géocoder une adresse et naviguer
  const geocodeAndNavigate = useCallback(async (address: string, nodeId: string) => {
    if (!address || address.trim() === '') {
      setAlertMessage('❌ Aucune adresse pour cette entité');
      setTimeout(() => setAlertMessage(null), 3000);
      return;
    }

    setGeocodingId(nodeId);
    setAlertMessage(`🔍 Recherche: ${address}`);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const results = await response.json();

      if (!results || results.length === 0) {
        setAlertMessage(`❌ Adresse introuvable: ${address}`);
        setTimeout(() => setAlertMessage(null), 4000);
        setGeocodingId(null);
        return;
      }

      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);

      if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
        setMapCenter([lat, lng]);
        setMapZoom(15);
        setMapKey(prev => prev + 1);
        setAlertMessage(`✅ ${results[0].display_name}`);
        setTimeout(() => setAlertMessage(null), 4000);

        // Sauvegarder les coordonnées dans le node
        if (onGeocodeLocation) {
          onGeocodeLocation(nodeId, lat, lng);
        }
      }
    } catch (err) {
      setAlertMessage('❌ Erreur de géocodage');
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setGeocodingId(null);
    }
  }, [onGeocodeLocation]);

  // ✅ Géocodage direct depuis un nœud Adresse (event envoyé par EntityNode via App)
  useEffect(() => {
    const handleGeocodeAddress = (e: any) => {
      const { nodeId, address } = e.detail || {};
      if (address && address.trim()) {
        geocodeAndNavigate(address.trim(), nodeId);
      }
    };
    window.addEventListener('map-geocode-address', handleGeocodeAddress);
    return () => window.removeEventListener('map-geocode-address', handleGeocodeAddress);
  }, [geocodeAndNavigate]);

  // Recherche manuelle
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
      setAlertMessage('❌ Erreur');
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Extraire les adresses
  const locationNodes = nodes.filter(n =>
    (n.data as EntityData)?.entityType === 'location'
  );

  const safePins = Array.isArray(pins) ? pins.filter(p => 
    p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
  ) : [];

  if (!isClient) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-dark" style={{ minHeight: '500px' }}>
        <p className="text-cyber-text-dim font-mono">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative w-full h-full" style={{ minHeight: '600px' }}>
      {/* Barre recherche */}
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

      {alertMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded bg-cyber-dark/95 border border-cyber-border text-xs font-mono shadow-lg max-w-md">
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
          
          <Marker position={mapCenter} icon={redIcon}>
            <Popup>
              <div className="text-xs font-mono">
                Position<br/>
                Lat: {mapCenter[0].toFixed(6)}<br/>
                Lng: {mapCenter[1].toFixed(6)}
              </div>
            </Popup>
          </Marker>

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

      {/* Liste des locations avec géocodage au clic */}
      <div className="h-32 border-t border-cyber-border bg-cyber-dark/90 overflow-y-auto flex-shrink-0">
        <div className="p-2">
          <p className="text-[10px] text-cyber-text-dim font-mono mb-1 uppercase">
            Entités Adresse ({locationNodes.length}) — clic pour géocoder
          </p>
          {locationNodes.length === 0 ? (
            <p className="text-xs text-cyber-text-dim text-center py-2">Aucune entité Adresse</p>
          ) : (
            <div className="space-y-1">
              {locationNodes.map((node) => {
                const data = node.data as EntityData;
                const address = data.label || data.fields?.address || data.notes;
                const hasCoords = data.fields?.lat && data.fields?.lng;
                const isGeocoding = geocodingId === node.id;

                return (
                  <button
                    key={node.id}
                    onClick={() => geocodeAndNavigate(address, node.id)}
                    disabled={isGeocoding}
                    className={`w-full text-left px-2 py-1 rounded text-xs font-mono transition-colors ${
                      isGeocoding 
                        ? 'bg-cyber-yellow/10 text-cyber-yellow' 
                        : hasCoords 
                          ? 'bg-cyber-green/10 text-cyber-green hover:bg-cyber-green/20' 
                          : 'hover:bg-cyber-panel text-cyber-text-dim'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full inline-block mr-2" 
                      style={{ background: hasCoords ? '#10b981' : '#6b7280' }} 
                    />
                    {isGeocoding ? '...' : address || 'Sans adresse'}
                    {hasCoords && <span className="ml-1 text-[10px]">✅</span>}
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