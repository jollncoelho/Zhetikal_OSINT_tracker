import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Share2, Camera,
  Server, Network, Fingerprint, ShieldCheck, Crosshair,
  Trash2, X, Check, NotebookPen,
  ExternalLink, SlidersHorizontal, Search, Satellite,
  Megaphone, Users, UserRound, Send,
  Car, Cpu, CalendarClock, LocateFixed, ShieldAlert
} from 'lucide-react';
import type { EntityData } from '../types';
import { ENTITY_FIELDS, admiraltyCode, admiraltyColor, readAdmiralty,
  admiraltySourceKey, admiraltyCredibilityKey } from '../types';
import { useStore } from '../store/useStore';
import { checkTorExit, TorListUnavailable, TOR_FIELD, TOR_CHECKED_FIELD, TOR_PUBLISHED_FIELD } from '../lib/torExit';
import { loadIcons } from './IconPicker';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { useGraphFilter } from './GraphFilter';
import { matchesQuery } from '../lib/graphFilter';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, User, Phone, MapPin, Building2,
  FileText, Link, Bitcoin, StickyNote, Share2, Camera,
  Server, Network, Fingerprint, ShieldCheck, Crosshair,
  Megaphone, Users, UserRound,
  Car, Cpu, CalendarClock, LocateFixed,
};

const TECH_TYPES = ['ip', 'domain', 'hostname', 'url', 'email', 'crypto', 'phone', 'username', 'asn', 'hash', 'sslcert', 'ttp', 'telegram_channel', 'telegram_group', 'telegram_user'];
const LINK_TYPES = ['url', 'domain', 'hostname'];
/** Types dont le nœud porte une URL Telegram ouvrable (`fields.url`). */
const TELEGRAM_TYPES = ['telegram_channel', 'telegram_group', 'telegram_user'];

const GODSEYE_BASE = import.meta.env.VITE_GODSEYE_URL || 'https://osintgodseye.query-intel.com';

/**
 * Poignées de connexion.
 *
 * Il y en avait **deux par côté** — une `source` et une `target` — posées au
 * même pixel. La cible étant rendue après la source, elle la recouvrait : on
 * tirait donc toujours depuis une poignée *cible*. En mode `Loose`, React Flow
 * accepte ce départ, enregistre l'arête avec `sourceHandle: 'left-in'`, puis
 * échoue à lui trouver une position de départ — une poignée cible n'en fournit
 * pas. L'arête finissait bien dans le dossier, mais n'était jamais dessinée :
 * c'est exactement le geste « je tire, je relâche, il ne se passe rien ».
 *
 * En mode `Loose`, une poignée unique sert de départ comme d'arrivée. Une seule
 * par côté supprime l'ambiguïté et rend les quatre côtés utilisables.
 */
/**
 * Taille **visible** de la pastille. 6 px : à 50 % de zoom c'est un point de
 * 3 px, donc une présence discrète plutôt qu'un bouton. La zone réellement
 * cliquable ne rétrécit pas pour autant — elle est portée par le `::after`
 * de `.ghost-handle` dans `index.css`, qui déborde de 10 px de chaque côté.
 */
const HANDLE_SIZE = 6;
const HANDLE_HALF = HANDLE_SIZE / 2;

function handleStyle(tone: string, side: 'left' | 'right' | 'top' | 'bottom'): React.CSSProperties {
  const base: React.CSSProperties = {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: 'var(--cyber-black)',
    border: `1.5px solid ${tone}`,
    borderRadius: 999,
    cursor: 'crosshair',
    zIndex: 5,
  };
  switch (side) {
    case 'left':
      return { ...base, left: -HANDLE_HALF, top: '50%', transform: 'translateY(-50%)' };
    case 'right':
      return { ...base, right: -HANDLE_HALF, top: '50%', transform: 'translateY(-50%)' };
    case 'top':
      return { ...base, top: -HANDLE_HALF, left: '50%', transform: 'translateX(-50%)' };
    default:
      return { ...base, bottom: -HANDLE_HALF, left: '50%', transform: 'translateX(-50%)' };
  }
}

function extractCoords(data: EntityData): { lat: number; lon: number } | null {
  const f = data.fields;
  if (f) {
    const lat = parseFloat(String(f.lat));
    const lon = parseFloat(String(f.lng ?? f.lon ?? f.longitude));
    if (!isNaN(lat) && !isNaN(lon) && isFinite(lat) && isFinite(lon)) {
      return { lat, lon };
    }
  }
  return null;
}

function buildGodsEyeUrl(data: EntityData): string | null {
  const coords = extractCoords(data);
  if (!coords) return null;
  const label = encodeURIComponent(data.label || '');
  const type = encodeURIComponent(data.entityType || '');
  return `${GODSEYE_BASE}/?lat=${coords.lat}&lon=${coords.lon}&zoom=16&label=${label}&type=${type}`;
}

async function geocodeAndOpenGodsEye(data: EntityData, id: string): Promise<void> {
  const coords = extractCoords(data);
  const label = encodeURIComponent(data.label || '');
  const type = encodeURIComponent(data.entityType || '');
  if (coords) {
    window.open(`${GODSEYE_BASE}/?lat=${coords.lat}&lon=${coords.lon}&zoom=16&label=${label}&type=${type}`, '_blank');
    return;
  }
  const address = data.label?.trim();
  if (!address) return;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
    const results = await res.json();
    if (Array.isArray(results) && results.length > 0) {
      const lat = parseFloat(results[0].lat);
      const lon = parseFloat(results[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        window.dispatchEvent(new CustomEvent('entity-update', { detail: { id, fields: { ...(data.fields || {}), lat: String(lat), lng: String(lon) } } }));
        window.open(`${GODSEYE_BASE}/?lat=${lat}&lon=${lon}&zoom=16&label=${label}&type=${type}`, '_blank');
        return;
      }
    }
  } catch (e) {
    console.error('Geocoding failed', e);
  }
  window.open(`${GODSEYE_BASE}/?label=${label}&type=${type}`, '_blank');
}

function buildOpenUrl(entityType: string, label: string): string | null {
  if (entityType === 'url') return label.startsWith('http') ? label : `https://${label}`;
  if (entityType === 'domain' || entityType === 'hostname') return `https://${label}`;
  return null;
}

// Fonction de routage OSINT globale pour pivoter vers les meilleurs outils tiers
function buildOsintPivotUrl(entityType: string, label: string): string | null {
  if (!label) return null;
  const cleanLabel = label.trim();

  switch (entityType.toLowerCase()) {
    case 'email':
      return `https://epieos.com/?q=${encodeURIComponent(cleanLabel)}`;
    case 'username':
      return `https://whatsmyname.app/?target=${encodeURIComponent(cleanLabel)}`;
    case 'domain':
    case 'hostname':
      return `https://www.virustotal.com/gui/domain/${encodeURIComponent(cleanLabel)}`;
    case 'phone': {
      const cleanPhone = cleanLabel.replace(/[^0-9+]/g, '');
      return `https://intelx.io/?s=${encodeURIComponent(cleanPhone)}`;
    }
    case 'ip':
    case 'ipaddress':
      return `https://iknowwhatyoudownload.com/en/peer/?ip=${encodeURIComponent(cleanLabel)}`;
    case 'asn': {
      const num = cleanLabel.replace(/[^0-9]/g, '');
      return `https://bgp.he.net/AS${encodeURIComponent(num)}`;
    }
    case 'hash':
      return `https://www.virustotal.com/gui/file/${encodeURIComponent(cleanLabel)}`;
    case 'sslcert':
      return `https://crt.sh/?q=${encodeURIComponent(cleanLabel)}`;
    case 'crypto':
      return `https://www.walletexplorer.com/?q=${encodeURIComponent(cleanLabel)}`;
    case 'url':
      return `https://www.virustotal.com/gui/url/${encodeURIComponent(cleanLabel)}`;
    default:
      return null;
  }
}

interface EntityNodeProps {
  id: string;
  data: EntityData;
  selected?: boolean;
}

export default memo(function EntityNode({ id, data, selected }: EntityNodeProps) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const filter = useGraphFilter();
  // Teinte de l'entité, assombrie si le thème a un fond clair (lisibilité).
  const tone = entityTone(data.color);
  /* Cote amirauté : lue à travers `readAdmiralty` pour qu'un dossier importé
     avec une cote invalide n'affiche pas un badge trompeur. */
  const grade = readAdmiralty(data.admiralty);
  const gradeTone = grade ? entityTone(admiraltyColor(grade)) : null;
  // Estompe le nœud quand un filtre est actif et qu'il n'y correspond pas.
  const dimmed = filter.trim().length > 0 && !matchesQuery(data, filter);
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [addressInput, setAddressInput] = useState(data.label);
  const [torChecking, setTorChecking] = useState(false);
  const [torError, setTorError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const icons = loadIcons();
  const customIcon = data.customIconId ? icons.find((i) => i.id === data.customIconId) : null;

  useEffect(() => { setLabel(data.label); }, [data.label]);
  useEffect(() => { setAddressInput(data.label); }, [data.label]);

  useEffect(() => {
    if (renamingLabel && labelRef.current) { labelRef.current.focus(); labelRef.current.select(); }
  }, [renamingLabel]);

  // Focus auto sur le champ adresse quand un nœud Adresse est créé sans label
  useEffect(() => {
    if (data.entityType === 'location' && !data.label && addressRef.current) {
      addressRef.current.focus();
    }
  }, [data.entityType, data.label]);

  const handleSaveLabel = () => {
    window.dispatchEvent(new CustomEvent('entity-update', { detail: { id, label, notes: data.notes } }));
    setRenamingLabel(false);
  };

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('entity-delete', { detail: { id } }));
  };

  /**
   * Contrôle « sortie Tor ».
   *
   * Ce n'est pas un lien de plus : le bouton de pivot ouvre une recherche dans
   * le navigateur et n'en garde rien. Ici on compare l'adresse à la liste
   * publique du Project Tor et on écrit le constat — avec la date de la liste —
   * dans les champs de l'entité. C'est ce constat daté qui pourra soutenir une
   * phrase du rapport, et qui reste vrai même si la liste change demain.
   */
  const torFields = (data.fields ?? {}) as Record<string, unknown>;
  const torVerdict = typeof torFields[TOR_FIELD] === 'string' ? String(torFields[TOR_FIELD]) : '';
  const torCheckedAt = typeof torFields[TOR_CHECKED_FIELD] === 'string' ? String(torFields[TOR_CHECKED_FIELD]) : '';
  const torPublished = typeof torFields[TOR_PUBLISHED_FIELD] === 'string' ? String(torFields[TOR_PUBLISHED_FIELD]) : '';

  const handleTorCheck = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (torChecking) return;
    setTorChecking(true);
    setTorError(null);
    try {
      const result = await checkTorExit(data.label);
      useStore.getState().updateNodeData(id, {
        fields: {
          ...(data.fields ?? {}),
          [TOR_FIELD]: result.verdict,
          [TOR_CHECKED_FIELD]: result.checkedAt,
          [TOR_PUBLISHED_FIELD]: result.published,
        },
      });
    } catch (cause) {
      setTorError(cause instanceof TorListUnavailable ? t('node.torUnavailable') : t('node.torError'));
    } finally {
      setTorChecking(false);
    }
  };

  const handleExpandNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-expand-note', { detail: { id } }));
  };

  const handleOpenFields = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-open-fields', { detail: { id } }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveLabel(); }
    if (e.key === 'Escape') { setLabel(data.label); setRenamingLabel(false); }
  };

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingLabel(true);
  };

  const handleGoToMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('entity-go-to-map', { detail: { nodeId: id, address: data.label } }));
  };

  // Validation de l'adresse : le label du nœud prend la valeur de l'adresse saisie
  const handleSaveAddress = () => {
    const clean = addressInput.trim();
    if (clean && clean !== data.label) {
      window.dispatchEvent(new CustomEvent('entity-update', { detail: { id, label: clean, notes: data.notes } }));
    } else if (!clean) {
      setAddressInput(data.label);
    }
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
    if (e.key === 'Escape') { setAddressInput(data.label); (e.target as HTMLInputElement).blur(); }
  };

  const openUrl = buildOpenUrl(data.entityType, data.label);
  const pivotOsintUrl = buildOsintPivotUrl(data.entityType, data.label);
  const IconComponent = ICON_MAP[data.icon] || Globe;
  const isLocation = data.entityType === 'location';
  /** Les nœuds Telegram portent la photo publique du canal quand elle existe. */
  const telegramAvatar =
    TELEGRAM_TYPES.includes(data.entityType) && data.photoUrl ? data.photoUrl : null;

  /**
   * 2 à 3 champs clés remontés sur la carte : uniquement ceux réellement
   * renseignés, dans l'ordre du schéma du type d'entité.
   */
  const keyFields = useMemo(() => {
    const schema = ENTITY_FIELDS[data.entityType] ?? [];
    const values = (data.fields ?? {}) as Record<string, unknown>;
    return schema
      .filter(({ key }) => {
        const value = values[key];
        return value !== undefined && value !== null && String(value).trim() !== '';
      })
      .slice(0, 3)
      .map(({ key, label }) => ({ key, label, value: String(values[key]) }));
  }, [data.entityType, data.fields]);

  return (
    <div
      className="group relative rounded-xl bg-cyber-panel border transition-all duration-200 min-w-[200px] max-w-[280px]"
      style={{
        borderColor: selected ? tone : 'var(--cyber-border)',
        boxShadow: selected ? `0 0 16px ${tone}40` : 'none',
        opacity: dimmed ? 0.2 : 1,
      }}
    >
      {/* Barre latérale colorée — identifie le type d'entité d'un coup d'œil */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
        style={{ background: tone }}
      />
      {/* Une seule poignée par côté — voir la note de `handleStyle`.
          `ghost-handle` : la pastille reste effacée tant qu'on ne survole pas
          le nœud, pour ne pas hérisser le graphe de points colorés. */}
      <Handle type="source" position={Position.Left} id="left" className="ghost-handle" style={handleStyle(tone, 'left')} />
      <Handle type="source" position={Position.Right} id="right" className="ghost-handle" style={handleStyle(tone, 'right')} />
      <Handle type="source" position={Position.Top} id="top" className="ghost-handle" style={handleStyle(tone, 'top')} />
      <Handle type="source" position={Position.Bottom} id="bottom" className="ghost-handle" style={handleStyle(tone, 'bottom')} />

      {/* Contenu : occupe 100% de l'espace, aucune interférence */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: customIcon || telegramAvatar ? 'transparent' : `${tone}22` }}>
          {customIcon ? (
            <img src={customIcon.dataUrl} alt="" className="w-full h-full object-contain" />
          ) : telegramAvatar ? (
            <img
              src={telegramAvatar}
              alt=""
              className="w-full h-full object-cover rounded-lg"
              onError={(event) => {
                // Une photo distante peut expirer : on masque l'image cassée
                // plutôt que de laisser un carré vide.
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <IconComponent size={14} style={{ color: tone }} />
          )}
        </div>

        {isLocation ? (
          // Nœud Adresse : champ input propre, label = valeur saisie
          <input
            ref={addressRef}
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={handleAddressKeyDown}
            onBlur={handleSaveAddress}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder={t('node.addressPlaceholder')}
            className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-xs font-bold outline-none focus:border-cyber-cyan font-mono min-w-0"
            style={{ color: tone }}
          />
        ) : renamingLabel ? (
          <input ref={labelRef} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveLabel} onClick={(e) => e.stopPropagation()} className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-0.5 text-xs font-bold outline-none focus:border-cyber-cyan font-mono min-w-0" style={{ color: tone }} />
        ) : (
          <>
            <span className={`flex-1 text-xs font-bold truncate font-mono ${TECH_TYPES.includes(data.entityType) ? 'font-tech' : ''}`} style={{ color: tone }} onDoubleClick={handleLabelDoubleClick} title={t('node.rename')}>
              {data.label}
            </span>
            {/* Cote amirauté — deux caractères, colorés par la note combinée.
                Le titre porte le détail : la carte n'a pas la place pour les
                libellés complets, mais on ne doit pas avoir à ouvrir l'éditeur
                pour savoir ce que « C3 » veut dire. */}
            {grade && gradeTone && (
              <span
                data-testid="admiralty-badge"
                title={`${t('admiralty.title')} ${admiraltyCode(grade)} — ${t(admiraltySourceKey(grade.source))} · ${t(admiraltyCredibilityKey(grade.credibility))}`}
                className="flex-shrink-0 rounded px-1 py-[1px] font-mono text-[9px] font-bold leading-none"
                style={{ color: gradeTone, background: `${gradeTone}1f`, border: `1px solid ${gradeTone}55` }}
              >
                {admiraltyCode(grade)}
              </span>
            )}
            {/* Le constat Tor est un fait daté sur l'adresse : il se voit sur la
                carte, pas seulement dans un panneau qu'on oublie d'ouvrir. */}
            {data.entityType === 'ip' && torVerdict === 'exit' && (
              <span
                data-testid="tor-badge"
                title={`${t('node.torIsExit')}${torPublished ? ` — ${t('node.torListOf')} ${torPublished.slice(0, 10)}` : ''}`}
                className="flex-shrink-0 rounded px-1 py-[1px] font-mono text-[9px] font-bold leading-none"
                style={{
                  color: 'var(--cyber-orange)',
                  background: 'rgb(var(--cyber-orange-rgb) / 0.18)',
                  border: '1px solid rgb(var(--cyber-orange-rgb) / 0.55)',
                }}
              >
                TOR
              </span>
            )}
            {data.entityType === 'url' && openUrl && (
              <a
                href={data.label}
                target="_blank"
                rel="noopener noreferrer"
                title={t('node.openLink')}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-all duration-150"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </>
        )}
      </div>

      {/* Champs clés — 2 à 3 valeurs remontées sur la carte */}
      {keyFields.length > 0 && (
        <div className="space-y-0.5 px-3 pb-2">
          {keyFields.map((field) => (
            <div key={field.key} className="flex items-baseline gap-1.5 text-[10px] leading-4">
              <span className="shrink-0 uppercase tracking-wide text-cyber-text-dim/70">
                {field.label}
              </span>
              <span className="truncate font-mono text-cyber-text/90" title={field.value}>
                {field.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {torError && (
        <div data-testid="tor-error" className="px-3 pb-2 text-[9px] leading-tight" style={{ color: 'var(--cyber-red)' }}>
          {torError}
        </div>
      )}

      {data.entityType === 'photo' && data.photoUrl && (
        <div className="px-3 pt-2">
          <img
            src={data.photoUrl}
            alt=""
            className="w-full h-24 object-cover rounded border border-cyber-border cursor-pointer hover:border-cyber-cyan/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('entity-view-photo', { detail: { photoUrl: data.photoUrl, label: data.label } }));
            }}
          />
        </div>
      )}

      <div className="px-3 pb-3">
        <p className="text-xs font-mono text-cyber-text-dim italic line-clamp-2">
          {data.notes || <span className="opacity-40">{t('node.noNotes')}</span>}
        </p>
      </div>

      {renamingLabel && !isLocation && (
        <div className="flex gap-1 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={handleSaveLabel} className="flex items-center gap-1 px-2 py-1 rounded bg-cyber-green/20 border border-cyber-green/40 text-cyber-green text-[10px] font-medium hover:bg-cyber-green/30 transition-colors">
            <Check size={10} /> OK
          </button>
          <button onClick={() => { setLabel(data.label); setRenamingLabel(false); }} className="flex items-center gap-1 px-2 py-1 rounded bg-cyber-panel border border-cyber-border text-cyber-text-dim text-[10px] font-medium hover:bg-cyber-dark transition-colors">
            <X size={10} />
          </button>
        </div>
      )}

      {/* BARRE D'ACTIONS FLOTTANTE : apparaît uniquement au survol, à l'extérieur du nœud */}
      {!renamingLabel && (
        <div
          className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1 py-1 rounded-lg bg-cyber-dark/95 border border-cyber-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 pointer-events-auto whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleDelete} title={t('node.delete')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-red hover:bg-red-500/15 transition-colors">
            <Trash2 size={12} />
          </button>
          <button onClick={handleExpandNote} title={t('node.openNote')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
            <NotebookPen size={12} />
          </button>
          <button onClick={handleOpenFields} title={t('node.fields')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
            <SlidersHorizontal size={12} />
          </button>

          {isLocation && (
            <button onClick={handleGoToMap} title={t('node.viewMap')} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-green hover:bg-cyber-green/10 transition-colors">
              <MapPin size={12} />
            </button>
          )}

          {(() => {
            const gye = buildGodsEyeUrl(data);
            const canProject = isLocation || gye !== null;
            return canProject ? (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await geocodeAndOpenGodsEye(data, id);
                }}
                title="Projeter dans God's Eye"
                className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors"
              >
                <Satellite size={12} />
              </button>
            ) : null;
          })()}

          {pivotOsintUrl && (
            <a href={pivotOsintUrl} target="_blank" rel="noopener noreferrer" title={t('node.osint')} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
              <ExternalLink size={12} />
            </a>
          )}

          {/* Contrôle Tor : uniquement sur une adresse IP. La couleur du
              pictogramme porte le résultat — orange = sortie Tor, vert =
              vérifiée et absente de la liste, gris = jamais contrôlée. */}
          {data.entityType === 'ip' && (
            <button
              type="button"
              data-testid="tor-check"
              onClick={handleTorCheck}
              disabled={torChecking}
              title={
                torChecking
                  ? t('node.torChecking')
                  : torVerdict === 'exit'
                    ? `${t('node.torIsExit')}${torPublished ? ` — ${t('node.torListOf')} ${torPublished.slice(0, 10)}` : ''}`
                    : torVerdict === 'not-listed'
                      ? `${t('node.torNotListed')}${torCheckedAt ? ` — ${torCheckedAt.slice(0, 10)}` : ''}`
                      : t('node.torCheck')
              }
              className="w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-50"
              style={{
                color:
                  torVerdict === 'exit'
                    ? 'var(--cyber-orange)'
                    : torVerdict === 'not-listed'
                      ? 'var(--cyber-green)'
                      : 'var(--cyber-text-dim)',
                background: torVerdict === 'exit' ? 'rgb(var(--cyber-orange-rgb) / 0.16)' : 'transparent',
              }}
            >
              <ShieldAlert size={12} />
            </button>
          )}

          {TELEGRAM_TYPES.includes(data.entityType) && (() => {
            // `fields.url` est écrit par le module Telegram ; à défaut on
            // reconstruit l'adresse depuis le handle, pour qu'un nœud saisi à
            // la main reste ouvrable.
            const fields = (data.fields ?? {}) as Record<string, unknown>;
            const rawUrl = typeof fields.url === 'string' ? fields.url.trim() : '';
            const rawHandle = typeof fields.handle === 'string' ? fields.handle.trim().replace(/^@/, '') : '';
            const href = rawUrl || (rawHandle ? `https://t.me/${rawHandle}` : '');
            if (!href) return null;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" title={t('node.openTelegram')} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
                <Send size={12} />
              </a>
            );
          })()}

          {LINK_TYPES.includes(data.entityType) && openUrl && (
            <a href={data.entityType === 'url' ? data.label : openUrl} target="_blank" rel="noopener noreferrer" title={t('node.visitLink')} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors">
              <Search size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
});
