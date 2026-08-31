import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapTab.css';
import './GodsEyeView.css';
import type { MapPin, EntityNode, EntityData } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

// Fix Leaflet default icon paths
if (typeof window !== 'undefined') {
  try {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  } catch (_) {}
}

type HudFilter = 'STD' | 'NVG' | 'FLIR' | 'CRT';
type BaseLayer = 'satellite' | 'dark' | 'osm';

const FILTER_CSS: Record<HudFilter, string> = {
  STD: 'none',
  NVG: 'brightness(1.2) contrast(1.5) sepia(100%) hue-rotate(85deg) saturate(300%)',
  FLIR: 'invert(100%) contrast(180%) hue-rotate(180deg) saturate(200%)',
  CRT: 'brightness(0.9) contrast(1.3) sepia(60%) hue-rotate(120deg) saturate(200%)',
};

const TILE_LAYERS: Record<BaseLayer, { url: string; attribution: string; maxZoom: number; maxNativeZoom?: number; subdomains?: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 21,
    maxNativeZoom: 18,
  },
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri',
    maxZoom: 21,
    maxNativeZoom: 16,
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    subdomains: 'abc',
  },
};

// ── Tactical marker icon (gold/cyan diamond) ────────────────────────────────
const tacticalIcon = L.divIcon({
  className: 'tactical-marker',
  html: `<div class="tac-marker-inner"><div class="tac-marker-diamond"></div><div class="tac-marker-pulse"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const targetIcon = L.divIcon({
  className: 'target-marker',
  html: `<div class="target-reticle"><div class="target-ring"></div><div class="target-cross-h"></div><div class="target-cross-v"></div><div class="target-center"></div></div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

// ── Fly-to helper ────────────────────────────────────────────────────────────
interface FlyProps { target: [number, number] | null; zoom: number }
function FlyToTarget({ target, zoom }: FlyProps) {
  const map = useMap();
  const prev = useRef<string>('');
  useEffect(() => {
    if (!target) return;
    const key = `${target[0]},${target[1]},${zoom}`;
    if (key === prev.current) return;
    prev.current = key;
    map.flyTo(target, zoom, { duration: 1.5 });
  }, [target, zoom, map]);
  return null;
}

// ── Click handler component ─────────────────────────────────────────────────
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Inspection data types ────────────────────────────────────────────────────
interface InspectionData {
  lat: number;
  lng: number;
  placeName: string;
  weather: { temp: number; windspeed: number; weathercode: number; description: string } | null;
  wiki: { title: string; extract: string; thumbnail?: string } | null;
  loading: boolean;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

interface GodsEyeViewProps {
  pins: MapPin[];
  nodes: EntityNode[];
  onGeocodeLocation?: (nodeId: string, lat: number, lng: number) => void;
  onUpdatePins?: (pins: MapPin[]) => void;
  flyTarget: [number, number] | null;
  flyZoom: number;
}

export default function GodsEyeView({ pins, nodes, onUpdatePins, flyTarget, flyZoom }: GodsEyeViewProps) {
  const { t } = useLanguage();
  const [hudFilter, setHudFilter] = useState<HudFilter>('STD');
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('satellite');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [internalFlyTarget, setInternalFlyTarget] = useState<[number, number] | null>(null);
  const [internalFlyZoom, setInternalFlyZoom] = useState(18);
  const [alert, setAlert] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [inspection, setInspection] = useState<InspectionData | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  const showAlert = useCallback((msg: string, ms = 4000) => {
    setAlert(msg);
    setTimeout(() => setAlert(null), ms);
  }, []);

  // External navigation event
  useEffect(() => {
    const handler = (e: any) => {
      const { lat, lng } = e.detail || {};
      if (typeof lat === 'number' && !isNaN(lat)) {
        setInternalFlyTarget([lat, lng]);
        setInternalFlyZoom(18);
      }
    };
    window.addEventListener('map-navigate-pin', handler);
    return () => window.removeEventListener('map-navigate-pin', handler);
  }, []);

  // Search: Nominatim + coordinate detection
  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);

    // Check if it's a coordinate pair "lat, lon"
    const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        setInternalFlyTarget([lat, lng]);
        setInternalFlyZoom(18);
        showAlert(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        setSearching(false);
        return;
      }
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`
      );
      const data = await res.json();
      if (!data?.length) { showAlert(t('map.notFoundShort')); setSearching(false); return; }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (!isNaN(lat)) {
        setInternalFlyTarget([lat, lng]);
        setInternalFlyZoom(18);
        showAlert(data[0].display_name);
      }
    } catch { showAlert(t('map.error')); }
    finally { setSearching(false); }
  }, [searchQuery, showAlert, t]);

  // Click on map → target inspection
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setInternalFlyTarget([lat, lng]);
    setInternalFlyZoom(18);
    setInspection({ lat, lng, placeName: '', weather: null, wiki: null, loading: true });

    // Reverse geocode
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      const data = await res.json();
      const placeName = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setInspection(prev => prev ? { ...prev, placeName } : null);
    } catch {
      setInspection(prev => prev ? { ...prev, placeName: `${lat.toFixed(4)}, ${lng.toFixed(4)}` } : null);
    }

    // Weather
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`
      );
      const data = await res.json();
      if (data?.current_weather) {
        const cw = data.current_weather;
        setInspection(prev => prev ? {
          ...prev,
          weather: {
            temp: cw.temperature,
            windspeed: cw.windspeed,
            weathercode: cw.weathercode,
            description: WEATHER_CODES[cw.weathercode] || `Code ${cw.weathercode}`,
          },
        } : null);
      }
    } catch {}

    // Wikipedia
    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=5000&gslimit=1&format=json&origin=*`
      );
      const data = await res.json();
      const geopage = data?.query?.geosearch?.[0];
      if (geopage) {
        const pageRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&piprop=thumbnail&pithumbsize=400&pageids=${geopage.pageid}&format=json&origin=*`
        );
        const pageData = await pageRes.json();
        const page = pageData?.query?.pages?.[geopage.pageid];
        if (page) {
          setInspection(prev => prev ? {
            ...prev,
            wiki: {
              title: page.title || '',
              extract: page.extract || '',
              thumbnail: page.thumbnail?.source,
            },
          } : null);
        }
      }
    } catch {}

    setInspection(prev => prev ? { ...prev, loading: false } : null);
  }, []);

  // Entity nodes with coordinates for tactical overlay
  const entityNodesWithCoords = nodes.filter(n => {
    const data = n.data as EntityData;
    const lat = data.fields?.lat;
    const lng = data.fields?.lng;
    return typeof lat === 'string' && typeof lng === 'string' && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));
  });

  const safePins = Array.isArray(pins)
    ? pins.filter(p => p && typeof p.lat === 'number' && !isNaN(p.lat) && isFinite(p.lat))
    : [];

  const activeFlyTarget = flyTarget || internalFlyTarget;
  const activeFlyZoom = flyTarget ? flyZoom : internalFlyZoom;

  if (!isClient) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-dark">
        <p className="text-cyber-text-dim font-mono text-xs">{t('map.loading')}</p>
      </div>
    );
  }

  const layer = TILE_LAYERS[baseLayer];

  return (
    <div className={`gods-eye-root gods-eye-filter-${hudFilter}`}>
      {/* Search bar */}
      <div className="map-search-bar">
        <span className="map-search-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('godsEye.searchPlaceholder') || 'Search location or lat, lon…'}
          className="map-search-input"
        />
        <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="map-search-btn">
          {searching ? '…' : 'OK'}
        </button>
      </div>

      {/* HUD filter bar */}
      <div className="gods-eye-hud-bar">
        <div className="gods-eye-hud-group">
          <span className="gods-eye-hud-label">FILTERS</span>
          {(['STD', 'NVG', 'FLIR', 'CRT'] as HudFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setHudFilter(f)}
              className={`gods-eye-hud-btn ${hudFilter === f ? 'active' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="gods-eye-hud-group">
          <span className="gods-eye-hud-label">BASE</span>
          {([
            { id: 'satellite' as BaseLayer, label: 'SAT' },
            { id: 'dark' as BaseLayer, label: 'DRK' },
            { id: 'osm' as BaseLayer, label: 'OSM' },
          ]).map(b => (
            <button
              key={b.id}
              onClick={() => setBaseLayer(b.id)}
              className={`gods-eye-hud-btn ${baseLayer === b.id ? 'active' : ''}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {alert && <div className="map-alert">{alert}</div>}

      {/* Map */}
      <div className="map-leaflet-container gods-eye-map-container">
        <MapContainer
          center={[46.603354, 1.888334]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          zoomControl
        >
          <TileLayer
            url={layer.url}
            attribution={layer.attribution}
            maxZoom={layer.maxZoom}
            maxNativeZoom={layer.maxNativeZoom}
            subdomains={layer.subdomains || 'abc'}
          />
          {baseLayer === 'satellite' && (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution=""
              maxZoom={21}
              maxNativeZoom={18}
              opacity={0.7}
            />
          )}
          <FlyToTarget target={activeFlyTarget} zoom={activeFlyZoom} />
          <MapClickHandler onClick={handleMapClick} />

          {/* Target reticle at inspection point */}
          {inspection && (
            <Marker position={[inspection.lat, inspection.lng]} icon={targetIcon} interactive={false} />
          )}

          {/* Entity pins (tactical markers) */}
          {safePins.map(pin => (
            <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={tacticalIcon}>
              <Popup className="pin-popup-wrapper" minWidth={340} maxWidth={360}>
                <div className="pin-popup">
                  <div className="pin-popup-header">
                    <span className="pin-popup-dot" />
                    <span className="pin-popup-title">{pin.label || t('popup.place')}</span>
                  </div>
                  <div className="pin-popup-body">
                    <div className="pin-popup-section">
                      <div className="pin-popup-label">{t('popup.address')}</div>
                      <div className="pin-popup-address-box">
                        <p className="pin-popup-address">{pin.address || t('popup.addressEmpty')}</p>
                      </div>
                    </div>
                    <div className="pin-popup-section">
                      <div className="pin-popup-label">{t('popup.gpsCoords')}</div>
                      <div className="pin-popup-coords">
                        <span>{t('popup.lat')}: {pin.lat.toFixed(6)}</span>
                        <span>{t('popup.lng')}: {pin.lng.toFixed(6)}</span>
                      </div>
                    </div>
                    <div className="pin-popup-section">
                      <div className="pin-popup-label">{t('popup.notes')}</div>
                      <textarea
                        className="pin-popup-notes"
                        defaultValue={pin.notes || ''}
                        placeholder={t('popup.notesPlaceholder')}
                        onChange={e => {
                          const updated = pins.map(p => p.id === pin.id ? { ...p, notes: e.target.value, updatedAt: new Date().toISOString() } : p);
                          onUpdatePins?.(updated);
                        }}
                      />
                    </div>
                  </div>
                  <div className="pin-popup-actions">
                    <a
                      className="pin-popup-btn pin-popup-btn-gmaps"
                      href={`https://www.google.com/maps/search/?api=1&query=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('popup.googleMaps')}
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Entity nodes with coordinates as tactical markers */}
          {entityNodesWithCoords.map(node => {
            const data = node.data as EntityData;
            const lat = parseFloat(data.fields!.lat as string);
            const lng = parseFloat(data.fields!.lng as string);
            return (
              <Marker key={node.id} position={[lat, lng]} icon={tacticalIcon}>
                <Popup className="pin-popup-wrapper" minWidth={300}>
                  <div className="pin-popup">
                    <div className="pin-popup-header">
                      <span className="pin-popup-dot" style={{ background: data.color }} />
                      <span className="pin-popup-title">{data.label}</span>
                    </div>
                    <div className="pin-popup-body">
                      <div className="pin-popup-section">
                        <div className="pin-popup-label">{t('popup.gpsCoords')}</div>
                        <div className="pin-popup-coords">
                          <span>{t('popup.lat')}: {lat.toFixed(6)}</span>
                          <span>{t('popup.lng')}: {lng.toFixed(6)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* CRT scanline overlay */}
        {hudFilter === 'CRT' && <div className="gods-eye-scanlines" />}
      </div>

      {/* Target inspection HUD panel */}
      {inspection && (
        <div className="gods-eye-inspection">
          <div className="gods-eye-inspection-header">
            <span className="gods-eye-inspection-title">TARGET INSPECTION</span>
            <button className="gods-eye-inspection-close" onClick={() => setInspection(null)}>✕</button>
          </div>
          <div className="gods-eye-inspection-body">
            <div className="gods-eye-inspection-row">
              <span className="gods-eye-inspection-label">COORDS</span>
              <span className="gods-eye-inspection-value">
                {inspection.lat.toFixed(6)}, {inspection.lng.toFixed(6)}
              </span>
            </div>
            <div className="gods-eye-inspection-row">
              <span className="gods-eye-inspection-label">LOCATION</span>
              <span className="gods-eye-inspection-value">
                {inspection.loading ? '...' : inspection.placeName || 'N/A'}
              </span>
            </div>
            {inspection.weather && (
              <div className="gods-eye-inspection-row">
                <span className="gods-eye-inspection-label">WEATHER</span>
                <span className="gods-eye-inspection-value">
                  {inspection.weather.description} · {inspection.weather.temp}°C · {inspection.weather.windspeed} km/h
                </span>
              </div>
            )}
            {inspection.wiki && (
              <div className="gods-eye-inspection-wiki">
                {inspection.wiki.thumbnail && (
                  <img src={inspection.wiki.thumbnail} alt="" className="gods-eye-wiki-thumb" />
                )}
                <div>
                  <div className="gods-eye-wiki-title">{inspection.wiki.title}</div>
                  <p className="gods-eye-wiki-extract">{inspection.wiki.extract}</p>
                </div>
              </div>
            )}
            <a
              className="gods-eye-streetview-btn"
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${inspection.lat},${inspection.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              👁️ {t('godsEye.streetView') || 'STREET VIEW'}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
