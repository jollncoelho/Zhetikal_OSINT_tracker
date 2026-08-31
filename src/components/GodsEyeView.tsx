import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onClick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

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
  onExit: () => void;
  onUpdatePins?: (pins: MapPin[]) => void;
}

export default function GodsEyeView({ pins, nodes, onExit, onUpdatePins }: GodsEyeViewProps) {
  const { t } = useLanguage();
  const [hudFilter, setHudFilter] = useState<HudFilter>('STD');
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('satellite');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [flyZoom, setFlyZoom] = useState(18);
  const [alert, setAlert] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [brusselsTime, setBrusselsTime] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({
    filters: true,
    baseMaps: true,
    layers: false,
  });
  const [cam3dOpen, setCam3dOpen] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Belgium clock
  useEffect(() => {
    const update = () => {
      setBrusselsTime(new Date().toLocaleTimeString('fr-BE', {
        timeZone: 'Europe/Brussels',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const showAlert = useCallback((msg: string, ms = 4000) => {
    setAlert(msg);
    setTimeout(() => setAlert(null), ms);
  }, []);

  // External navigation event
  useEffect(() => {
    const handler = (e: any) => {
      const { lat, lng } = e.detail || {};
      if (typeof lat === 'number' && !isNaN(lat)) {
        setFlyTarget([lat, lng]);
        setFlyZoom(18);
      }
    };
    window.addEventListener('map-navigate-pin', handler);
    return () => window.removeEventListener('map-navigate-pin', handler);
  }, []);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);

    const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        setFlyTarget([lat, lng]);
        setFlyZoom(18);
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
        setFlyTarget([lat, lng]);
        setFlyZoom(18);
        showAlert(data[0].display_name);
      }
    } catch { showAlert(t('map.error')); }
    finally { setSearching(false); }
  }, [searchQuery, showAlert, t]);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setFlyTarget([lat, lng]);
    setFlyZoom(18);
    setInspection({ lat, lng, placeName: '', weather: null, wiki: null, loading: true });

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

  const entityNodesWithCoords = nodes.filter(n => {
    const data = n.data as EntityData;
    const lat = data.fields?.lat;
    const lng = data.fields?.lng;
    return typeof lat === 'string' && typeof lng === 'string' && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));
  });

  const safePins = Array.isArray(pins)
    ? pins.filter(p => p && typeof p.lat === 'number' && !isNaN(p.lat) && isFinite(p.lat))
    : [];

  const toggleAccordion = (key: string) => {
    setAccordionOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isClient) {
    return (
      <div className="gods-eye-fullscreen gods-eye-loading">
        <p className="text-cyber-text-dim font-mono text-xs">{t('map.loading')}</p>
      </div>
    );
  }

  const layer = TILE_LAYERS[baseLayer];

  return (
    <div className={`gods-eye-fullscreen gods-eye-filter-${hudFilter}`}>
      {/* Top bar: clock + search + exit */}
      <div className="gods-eye-topbar">
        <div className="gods-eye-clock">
          <span className="gods-eye-clock-label">BRUSSELS</span>
          <span className="gods-eye-clock-time">{brusselsTime}</span>
        </div>
        <div className="gods-eye-search-wrapper">
          <span className="gods-eye-search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('godsEye.searchPlaceholder') || 'Search location or lat, lon…'}
            className="gods-eye-search-input"
          />
          <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="gods-eye-search-btn">
            {searching ? '…' : 'OK'}
          </button>
        </div>
        <button className="gods-eye-exit-btn" onClick={onExit}>
          ⬅ {t('godsEye.backToTracker') || 'RETOUR TRACKER'}
        </button>
      </div>

      {alert && <div className="gods-eye-alert">{alert}</div>}

      {/* Left sidebar accordion */}
      <div className={`gods-eye-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <button className="gods-eye-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '◀' : '▶'}
        </button>
        {sidebarOpen && (
          <div className="gods-eye-sidebar-content">
            {/* Filters accordion */}
            <div className="gods-eye-accordion">
              <button className="gods-eye-accordion-header" onClick={() => toggleAccordion('filters')}>
                <span className="gods-eye-accordion-arrow">{accordionOpen.filters ? '▼' : '▶'}</span>
                <span className="gods-eye-accordion-title">FILTRES HUD</span>
              </button>
              {accordionOpen.filters && (
                <div className="gods-eye-accordion-body">
                  {(['STD', 'NVG', 'FLIR', 'CRT'] as HudFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setHudFilter(f)}
                      className={`gods-eye-hud-btn ${hudFilter === f ? 'active' : ''}`}
                    >
                      <span className="gods-eye-hud-btn-key">{f}</span>
                      <span className="gods-eye-hud-btn-desc">
                        {f === 'STD' && 'Standard'}
                        {f === 'NVG' && 'Night Vision'}
                        {f === 'FLIR' && 'Thermal IR'}
                        {f === 'CRT' && 'Radar CRT'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Base maps accordion */}
            <div className="gods-eye-accordion">
              <button className="gods-eye-accordion-header" onClick={() => toggleAccordion('baseMaps')}>
                <span className="gods-eye-accordion-arrow">{accordionOpen.baseMaps ? '▼' : '▶'}</span>
                <span className="gods-eye-accordion-title">BASE MAPS</span>
              </button>
              {accordionOpen.baseMaps && (
                <div className="gods-eye-accordion-body">
                  {([
                    { id: 'satellite' as BaseLayer, label: 'SAT HD', desc: 'Esri Imagery' },
                    { id: 'dark' as BaseLayer, label: 'DRK', desc: 'Dark Canvas' },
                    { id: 'osm' as BaseLayer, label: 'OSM', desc: 'OpenStreetMap' },
                  ]).map(b => (
                    <button
                      key={b.id}
                      onClick={() => setBaseLayer(b.id)}
                      className={`gods-eye-hud-btn ${baseLayer === b.id ? 'active' : ''}`}
                    >
                      <span className="gods-eye-hud-btn-key">{b.label}</span>
                      <span className="gods-eye-hud-btn-desc">{b.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Layers accordion */}
            <div className="gods-eye-accordion">
              <button className="gods-eye-accordion-header" onClick={() => toggleAccordion('layers')}>
                <span className="gods-eye-accordion-arrow">{accordionOpen.layers ? '▼' : '▶'}</span>
                <span className="gods-eye-accordion-title">CALQUES</span>
              </button>
              {accordionOpen.layers && (
                <div className="gods-eye-accordion-body">
                  <div className="gods-eye-layer-row">
                    <span>Avions (ADS-B)</span>
                    <span className="gods-eye-layer-soon">Bientôt</span>
                  </div>
                  <div className="gods-eye-layer-row">
                    <span>Bateaux (Marine)</span>
                    <span className="gods-eye-layer-soon">Bientôt</span>
                  </div>
                  <div className="gods-eye-layer-row">
                    <span>Entités Tracker</span>
                    <span className="gods-eye-layer-active">{safePins.length + entityNodesWithCoords.length}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Map fills entire screen */}
      <div className="gods-eye-map-wrapper">
        <MapContainer
          center={[50.5039, 4.4699]}
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
          <FlyToTarget target={flyTarget} zoom={flyZoom} />
          <MapClickHandler onClick={handleMapClick} />

          {inspection && (
            <Marker position={[inspection.lat, inspection.lng]} icon={targetIcon} interactive={false} />
          )}

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
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

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

        {hudFilter === 'CRT' && <div className="gods-eye-scanlines" />}
      </div>

      {/* Right: Target inspection panel */}
      {inspection && (
        <div className="gods-eye-inspection">
          <div className="gods-eye-inspection-header">
            <span className="gods-eye-inspection-title">TARGET ACQUIRED</span>
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

      {/* Bottom-right: retractable 3D camera button */}
      <div className={`gods-eye-cam3d ${cam3dOpen ? 'open' : ''}`}>
        <button className="gods-eye-cam3d-toggle" onClick={() => setCam3dOpen(!cam3dOpen)}>
          {cam3dOpen ? '▼' : '🎥 3D'}
        </button>
        {cam3dOpen && (
          <div className="gods-eye-cam3d-panel">
            <p className="gods-eye-cam3d-text">Caméra 3D tactique</p>
            <p className="gods-eye-cam3d-soon">Bientôt disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}
