import type { Node, Edge } from '@xyflow/react';

export type EntityType =
  | 'ip'
  | 'domain'
  | 'hostname'
  | 'email'
  | 'username'
  | 'phone'
  | 'asn'
  | 'location'
  | 'organization'
  | 'person'
  | 'file'
  | 'hash'
  | 'sslcert'
  | 'url'
  | 'crypto'
  | 'iban'
  | 'note'
  | 'social'
  | 'ttp'
  | 'photo'
  /* Trois natures qui manquaient à la taxonomie et qui reviennent sans arrêt
     sur une enquête de terrain : un véhicule (plaque), un appareil (MAC, IMEI,
     SSID) et un événement daté (incident, transaction, déplacement). Les ranger
     dans « note » ou « fichier » perdait la plaque et la date, c'est-à-dire
     exactement ce qu'on vient y chercher. */
  | 'vehicle'
  | 'device'
  | 'event'
  /* Telegram — trois natures distinctes plutôt qu'un seul type « social » :
     un canal, un groupe et un compte n'ont ni les mêmes métadonnées ni la même
     valeur d'enquête. Les séparer permet de les filtrer et de les colorer
     indépendamment dans le graphe. */
  | 'telegram_channel'
  | 'telegram_group'
  | 'telegram_user';
export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'x';

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; color: string }[] = [
  { id: 'facebook',  label: 'Facebook',  color: '#1877f2' },
  { id: 'instagram', label: 'Instagram', color: '#e1306c' },
  { id: 'tiktok',    label: 'TikTok',    color: '#00f2ea' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0a66c2' },
  { id: 'x',         label: 'X',         color: '#e7e9ea' },
];

/* ------------------------------------------------------------------ *
 * Cotation amirauté (OTAN) — fiabilité de la source × crédibilité de
 * l'information.
 *
 * Deux axes indépendants, notés par l'**analyste** :
 *   - la source (A à F) dit d'où vient l'information ;
 *   - l'information (1 à 6) dit à quel point elle est corroborée.
 *
 * C'est un standard du renseignement, et il ne se calcule pas : deux analystes
 * peuvent noter différemment la même source. Le tracker avait déjà une
 * « fiabilité de preuve » **calculée** (checksum, horodatage, cohérence) — les
 * deux ne disent pas la même chose et ne doivent pas être confondus : l'une
 * juge le fichier, l'autre juge le renseignement.
 * ------------------------------------------------------------------ */

export type AdmiraltySource = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type AdmiraltyCredibility = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdmiraltyGrade {
  source: AdmiraltySource;
  credibility: AdmiraltyCredibility;
}

export const ADMIRALTY_SOURCES: AdmiraltySource[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export const ADMIRALTY_CREDIBILITY: AdmiraltyCredibility[] = [1, 2, 3, 4, 5, 6];

/** Clé i18n de la description d'une lettre de source. */
export function admiraltySourceKey(source: AdmiraltySource): string {
  return `admiralty.source${source}`;
}

/** Clé i18n de la description d'un niveau de crédibilité. */
export function admiraltyCredibilityKey(credibility: AdmiraltyCredibility): string {
  return `admiralty.cred${credibility}`;
}

/**
 * Valide une cote venue du stockage (dossiers importés, anciennes versions).
 * Toute valeur douteuse est écartée plutôt que réparée en silence : une cote
 * fausse orienterait la confiance accordée à une entité.
 */
export function readAdmiralty(value: unknown): AdmiraltyGrade | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AdmiraltyGrade>;
  const source = typeof raw.source === 'string' ? raw.source.toUpperCase() : '';
  const credibility = Number(raw.credibility);
  if (!ADMIRALTY_SOURCES.includes(source as AdmiraltySource)) return null;
  if (!ADMIRALTY_CREDIBILITY.includes(credibility as AdmiraltyCredibility)) return null;
  return { source: source as AdmiraltySource, credibility: credibility as AdmiraltyCredibility };
}

/** Code affiché sur la carte : « B2 ». */
export function admiraltyCode(grade: AdmiraltyGrade): string {
  return `${grade.source}${grade.credibility}`;
}

/**
 * Note de 0 à 1, pour colorer le badge. Les deux axes pèsent pareil : A=6 … F=1
 * et 1=6 … 6=1, moyenne, puis ramenée sur 0–1. Le décalage de 2 est nécessaire :
 * sans lui le pire cas (F6) tombait à 0,167 au lieu de 0, et toute l'échelle
 * restait comprimée dans le haut. Sert uniquement à l'affichage — ce n'est pas
 * un jugement, seulement une réduction d'une échelle à deux dimensions.
 */
export function admiraltyWeight(grade: AdmiraltyGrade): number {
  const sourceWeight = 7 - (ADMIRALTY_SOURCES.indexOf(grade.source) + 1);
  const credibilityWeight = 7 - grade.credibility;
  return (sourceWeight + credibilityWeight - 2) / 10;
}

/** Couleur de légende du badge, assombrie à l'affichage via `entityTone`. */
export function admiraltyColor(grade: AdmiraltyGrade): string {
  const weight = admiraltyWeight(grade);
  if (weight >= 0.75) return '#22c55e';
  if (weight >= 0.5) return '#f59e0b';
  return '#ef4444';
}

export interface EntityData extends Record<string, unknown> {
  label: string;
  entityType: EntityType;
  notes: string;
  color: string;
  icon: string;
  socialPlatform?: SocialPlatform;
  fields?: Record<string, unknown>;
  customIconId?: string | null;
  photoUrl?: string;
  /** Cotation de l'analyste (code amirauté). Absente = non cotée. */
  admiralty?: AdmiraltyGrade | null;
}

export interface EntityNode extends Node {
  type: 'entity' | 'social';
  data: EntityData;
}

export interface MapPin {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  visitedAt?: string;
  withWho?: string;
  notes: string;
  color: string;
  iconId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PinLink {
  id: string;
  pinId: string;
  identifierId: string;
  context: string;
}

export interface CaseData {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  nodes: EntityNode[];
  edges: Edge[];
  caseNotes?: string;
  caseTitle?: string;
  projectPath?: string;
  locations?: MapPin[];
  pinLinks?: PinLink[];
}

export const ENTITY_LABELS: Record<EntityType, string> = {
  ip: 'IP Address',
  domain: 'Domain',
  hostname: 'Hostname',
  email: 'Email',
  username: 'Username',
  phone: 'Phone',
  asn: 'ASN',
  location: 'Adresse',
  organization: 'Organization',
  person: 'Person',
  file: 'File',
  hash: 'Hash',
  sslcert: 'SSL Cert',
  url: 'URL',
  crypto: 'Crypto',
  iban: 'IBAN',
  note: 'Note',
  social: 'Social Media',
  ttp: 'TTP',
  photo: 'Photo',
  vehicle: 'Vehicle',
  device: 'Device',
  event: 'Event',
  telegram_channel: 'Telegram Channel',
  telegram_group: 'Telegram Group',
  telegram_user: 'Telegram User',
};

export const ENTITY_COLORS: Record<EntityType, string> = {
  ip: '#ef4444',
  domain: '#0ea5e9',
  hostname: '#38bdf8',
  email: '#f59e0b',
  username: '#8b5cf6',
  phone: '#8b5cf6',
  asn: '#fb7185',
  location: '#10b981',
  organization: '#0ea5e9',
  person: '#f59e0b',
  file: '#94a3b8',
  hash: '#a3e635',
  sslcert: '#22d3ee',
  url: '#0ea5e9',
  crypto: '#f59e0b',
  iban: '#34d399',
  note: '#94a3b8',
  social: '#1877f2',
  ttp: '#f472b6',
  photo: '#f43f5e',
  vehicle: '#fbbf24',
  device: '#94a3b8',
  event: '#a78bfa',
  /* Famille bleue Telegram. Les trois teintes restent assez éloignées pour
     qu'on distingue un canal d'un groupe d'un compte sans lire l'étiquette. */
  telegram_channel: '#229ed9',
  telegram_group: '#0088cc',
  telegram_user: '#5fb8e8',
};

export const ENTITY_ICON_NAMES: Record<EntityType, string> = {
  ip: 'Globe',
  domain: 'Globe',
  hostname: 'Server',
  email: 'Mail',
  username: 'User',
  phone: 'Phone',
  asn: 'Network',
  location: 'MapPin',
  organization: 'Building2',
  person: 'User',
  file: 'FileText',
  hash: 'Fingerprint',
  sslcert: 'ShieldCheck',
  url: 'Link',
  crypto: 'Bitcoin',
  iban: 'Building2',
  note: 'StickyNote',
  social: 'Share2',
  ttp: 'Crosshair',
  photo: 'Camera',
  vehicle: 'Car',
  device: 'Cpu',
  event: 'CalendarClock',
  telegram_channel: 'Megaphone',
  telegram_group: 'Users',
  telegram_user: 'UserRound',
};

export const ENTITY_FIELDS: Record<EntityType, { key: string; label: string; type: 'text' | 'number' }[]> = {
  ip: [
    { key: 'asn',     label: 'ASN',          type: 'text' },
    { key: 'isp',     label: 'ISP',          type: 'text' },
    { key: 'country', label: 'Country',      type: 'text' },
    { key: 'city',    label: 'City',         type: 'text' },
    { key: 'org',     label: 'Organization', type: 'text' },
  ],
  domain: [
    { key: 'registrar',   label: 'Registrar',   type: 'text' },
    { key: 'created',     label: 'Created',     type: 'text' },
    { key: 'expires',     label: 'Expires',     type: 'text' },
    { key: 'registrant',  label: 'Registrant',  type: 'text' },
    { key: 'nameservers', label: 'Nameservers', type: 'text' },
  ],
  email: [
    { key: 'breach',    label: 'Breach',     type: 'text' },
    { key: 'provider',  label: 'Provider',   type: 'text' },
    { key: 'firstName', label: 'First Name', type: 'text' },
    { key: 'lastName',  label: 'Last Name',  type: 'text' },
  ],
  username: [
    { key: 'platform',  label: 'Platform',    type: 'text' },
    { key: 'realName',  label: 'Real Name',   type: 'text' },
    { key: 'url',       label: 'Profile URL', type: 'text' },
    { key: 'followers', label: 'Followers',   type: 'number' },
  ],
  phone: [
    { key: 'carrier',  label: 'Carrier',  type: 'text' },
    { key: 'country',  label: 'Country',  type: 'text' },
    { key: 'location', label: 'Adresse', type: 'text' },
    { key: 'type',     label: 'Type',     type: 'text' },
  ],
  location: [
    { key: 'address', label: 'Address',   type: 'text' },
    { key: 'lat',     label: 'Latitude',  type: 'text' },
    { key: 'lng',     label: 'Longitude', type: 'text' },
    { key: 'country', label: 'Country',   type: 'text' },
    { key: 'city',    label: 'City',      type: 'text' },
  ],
  organization: [
    { key: 'industry',  label: 'Industry',   type: 'text' },
    { key: 'website',   label: 'Website',    type: 'text' },
    { key: 'founded',   label: 'Founded',    type: 'text' },
    { key: 'country',   label: 'Country',    type: 'text' },
    { key: 'employees', label: 'Employees',  type: 'number' },
  ],
  person: [
    { key: 'dob',         label: 'Date of Birth', type: 'text' },
    { key: 'nationality', label: 'Nationality',   type: 'text' },
    { key: 'occupation',  label: 'Occupation',    type: 'text' },
    { key: 'address',     label: 'Address',       type: 'text' },
    { key: 'aliases',     label: 'Aliases',       type: 'text' },
  ],
  file: [
    { key: 'hash',     label: 'Hash (MD5/SHA)', type: 'text' },
    { key: 'size',     label: 'Size',           type: 'text' },
    { key: 'type',     label: 'File Type',      type: 'text' },
    { key: 'created',  label: 'Created',        type: 'text' },
    { key: 'modified', label: 'Modified',       type: 'text' },
  ],
  url: [
    { key: 'status', label: 'HTTP Status', type: 'number' },
    { key: 'server', label: 'Server',      type: 'text' },
    { key: 'ip',     label: 'Resolved IP', type: 'text' },
    { key: 'title',  label: 'Page Title',  type: 'text' },
  ],
  crypto: [
    { key: 'blockchain', label: 'Blockchain',   type: 'text' },
    { key: 'balance',    label: 'Balance',      type: 'text' },
    { key: 'txCount',    label: 'Transactions', type: 'number' },
    { key: 'firstSeen',  label: 'First Seen',   type: 'text' },
  ],
  iban: [
    { key: 'bank',    label: 'Bank Name',    type: 'text' },
    { key: 'bic',     label: 'BIC / SWIFT',  type: 'text' },
    { key: 'country', label: 'Country',      type: 'text' },
    { key: 'holder',  label: 'Account Holder', type: 'text' },
    { key: 'balance', label: 'Balance',      type: 'text' },
  ],
  note: [],
  social: [
    { key: 'followers', label: 'Followers', type: 'number' },
    { key: 'following', label: 'Following', type: 'number' },
    { key: 'joined',    label: 'Joined',    type: 'text' },
    { key: 'realName',  label: 'Real Name', type: 'text' },
    { key: 'bio',       label: 'Bio',       type: 'text' },
  ],
  photo: [],
  /* Ordre volontaire, comme pour Telegram : la carte ne montre que les trois
     premiers champs renseignés. Plaque → modèle → couleur donne une fiche
     lisible d'un coup d'œil ; VIN reste en bas, c'est une valeur de recoupement. */
  vehicle: [
    { key: 'plate', label: 'Plate',  type: 'text' },
    { key: 'make',  label: 'Make',   type: 'text' },
    { key: 'model', label: 'Model',  type: 'text' },
    { key: 'color', label: 'Colour', type: 'text' },
    { key: 'vin',   label: 'VIN',    type: 'text' },
  ],
  /* Même logique : l'adresse réseau d'abord, le matériel ensuite. */
  device: [
    { key: 'mac',    label: 'MAC',    type: 'text' },
    { key: 'imei',   label: 'IMEI',   type: 'text' },
    { key: 'serial', label: 'Serial', type: 'text' },
    { key: 'ssid',   label: 'SSID',   type: 'text' },
    { key: 'os',     label: 'OS',     type: 'text' },
  ],
  event: [
    { key: 'date',     label: 'Date',         type: 'text' },
    { key: 'place',    label: 'Place',        type: 'text' },
    { key: 'kind',     label: 'Kind',         type: 'text' },
    { key: 'people',   label: 'Participants', type: 'text' },
    { key: 'source',   label: 'Source',       type: 'text' },
  ],
  asn: [
    { key: 'number',   label: 'AS Number',  type: 'text' },
    { key: 'holder',   label: 'AS Holder',  type: 'text' },
    { key: 'country',  label: 'Country',    type: 'text' },
    { key: 'prefixes', label: 'Prefixes',   type: 'text' },
  ],
  hash: [
    { key: 'algorithm', label: 'Algorithm',  type: 'text' },
    { key: 'value',     label: 'Hash Value', type: 'text' },
    { key: 'fileType',  label: 'File Type',  type: 'text' },
    { key: 'source',    label: 'Source',     type: 'text' },
  ],
  sslcert: [
    { key: 'issuer',    label: 'Issuer',     type: 'text' },
    { key: 'subject',   label: 'Subject',    type: 'text' },
    { key: 'validFrom', label: 'Valid From', type: 'text' },
    { key: 'validTo',   label: 'Valid To',   type: 'text' },
    { key: 'serial',    label: 'Serial',     type: 'text' },
  ],
  hostname: [
    { key: 'resolvedIp', label: 'Resolved IP', type: 'text' },
    { key: 'provider',   label: 'Provider',    type: 'text' },
    { key: 'os',         label: 'OS',          type: 'text' },
    { key: 'country',    label: 'Country',     type: 'text' },
  ],
  ttp: [
    { key: 'id',          label: 'Tactic ID',   type: 'text' },
    { key: 'tactic',      label: 'Tactic',      type: 'text' },
    { key: 'technique',   label: 'Technique',   type: 'text' },
    { key: 'platform',    label: 'Platform',    type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
  ],
  /* Ordre volontaire : la carte n'affiche que les **trois premiers** champs
     renseignés, donc handle → audience → description donne une fiche lisible
     d'un coup d'œil. */
  telegram_channel: [
    { key: 'telegramId',  label: 'Telegram ID', type: 'text' },
    { key: 'handle',      label: 'Handle',      type: 'text' },
    { key: 'subscribers', label: 'Subscribers', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'verified',    label: 'Verified',    type: 'text' },
    { key: 'url',         label: 'Channel URL', type: 'text' },
  ],
  telegram_group: [
    { key: 'telegramId',  label: 'Telegram ID', type: 'text' },
    { key: 'handle',      label: 'Handle',      type: 'text' },
    { key: 'members',     label: 'Members',     type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'verified',    label: 'Verified',    type: 'text' },
    { key: 'url',         label: 'Invite URL',  type: 'text' },
  ],
  telegram_user: [
    { key: 'telegramId',  label: 'Telegram ID', type: 'text' },
    { key: 'displayName', label: 'Display name', type: 'text' },
    { key: 'handle',   label: 'Handle',   type: 'text' },
    { key: 'verified', label: 'Verified', type: 'text' },
    { key: 'bio',      label: 'Bio',      type: 'text' },
    { key: 'url',      label: 'Profile URL', type: 'text' },
  ],
};

/* ------------------------------------------------------------------ *
 * Liens du graphe : nature de la relation + niveau de confiance.
 * Stockés dans `edge.data`, ce qui reste rétro-compatible avec les
 * dossiers existants (données absentes → relation « related », 70 %).
 * ------------------------------------------------------------------ */

export type RelationType =
  | 'related'
  | 'owns'
  | 'operates'
  | 'communicates'
  | 'hosts'
  | 'uses'
  | 'member'
  | 'alias'
  | 'located'
  | 'evidence';

export interface RelationData {
  relation: RelationType;
  /** Confiance de l'analyste, de 0 à 1. Pilote l'épaisseur de l'arête. */
  confidence: number;
}

export const DEFAULT_RELATION: RelationType = 'related';
export const DEFAULT_CONFIDENCE = 0.7;

/**
 * Palette des relations. Comme `ENTITY_COLORS`, c'est une **légende** :
 * la teinte est stable d'un thème à l'autre (assombrie en thème clair
 * via `entityTone`).
 */
export const RELATION_COLORS: Record<RelationType, string> = {
  related: '#64748b',
  owns: '#f59e0b',
  operates: '#0ea5e9',
  communicates: '#8b5cf6',
  hosts: '#22d3ee',
  uses: '#a3e635',
  member: '#f472b6',
  alias: '#fb7185',
  located: '#10b981',
  evidence: '#ef4444',
};

export const RELATION_TYPES = Object.keys(RELATION_COLORS) as RelationType[];

/** Normalise `edge.data` en une relation complète et valide. */
export function readRelation(data: unknown): RelationData {
  const raw = (data ?? {}) as Partial<RelationData>;
  const relation =
    raw.relation && raw.relation in RELATION_COLORS ? raw.relation : DEFAULT_RELATION;
  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : DEFAULT_CONFIDENCE;
  return { relation, confidence };
}


