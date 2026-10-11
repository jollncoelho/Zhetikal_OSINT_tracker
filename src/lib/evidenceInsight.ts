import type { EvidenceArtifact } from '../types/investigation';

/* ------------------------------------------------------------------ *
 * Fiabilité d'une preuve
 * ------------------------------------------------------------------ */

export type ReliabilityLevel = 'verified' | 'partial' | 'weak';

export interface ReliabilityCheck {
  id: string;
  /** Clé i18n du libellé (`reliability.check.<id>`). */
  labelKey: string;
  ok: boolean;
}

export interface ReliabilityReport {
  level: ReliabilityLevel;
  score: number;
  checks: ReliabilityCheck[];
}

/**
 * Évalue la solidité d'une preuve sur sept critères objectifs.
 *
 * L'idée : une capture n'a de valeur probante que si l'on peut à la fois
 * prouver qu'elle n'a pas été modifiée (empreinte), qu'elle contient bien le
 * contenu observé, et qu'elle est horodatée.
 */
export function assessReliability(artifact: EvidenceArtifact): ReliabilityReport {
  const hasImage = Boolean(
    artifact.screenshot_preview || (artifact.screenshot_previews ?? []).some(Boolean),
  );
  const status = artifact.http_status ?? 0;
  const capturedAt = Date.parse(artifact.captured_at);
  const finalUrl = artifact.final_url || artifact.target_url || '';

  const checks: ReliabilityCheck[] = [
    { id: 'hash', labelKey: 'reliability.check.hash', ok: /^[a-f0-9]{128}$/i.test(artifact.sha512 || '') },
    { id: 'content', labelKey: 'reliability.check.content', ok: (artifact.raw_html || '').trim().length > 0 },
    { id: 'text', labelKey: 'reliability.check.text', ok: (artifact.extracted_text ?? []).length > 0 },
    { id: 'preview', labelKey: 'reliability.check.preview', ok: hasImage },
    { id: 'status', labelKey: 'reliability.check.status', ok: status >= 200 && status < 400 },
    { id: 'secure', labelKey: 'reliability.check.secure', ok: finalUrl.startsWith('https://') },
    { id: 'timestamp', labelKey: 'reliability.check.timestamp', ok: Number.isFinite(capturedAt) && capturedAt > 0 },
  ];

  // Les trois premiers critères pèsent le plus lourd : ce sont eux qui font
  // la valeur probante. Le reste affine.
  const weights: Record<string, number> = {
    hash: 22, content: 22, text: 14, preview: 12, status: 12, secure: 8, timestamp: 10,
  };
  const total = checks.reduce((sum, check) => sum + (weights[check.id] ?? 0), 0);
  const earned = checks.reduce((sum, check) => sum + (check.ok ? weights[check.id] ?? 0 : 0), 0);
  const score = Math.round((earned / total) * 100);

  const level: ReliabilityLevel = score >= 78 ? 'verified' : score >= 48 ? 'partial' : 'weak';
  return { level, score, checks };
}

export const RELIABILITY_LABEL_KEY: Record<ReliabilityLevel, string> = {
  verified: 'reliability.verified',
  partial: 'reliability.partial',
  weak: 'reliability.weak',
};

/** Classes Tailwind (littérales, pour que le JIT les génère). */
export const RELIABILITY_STYLE: Record<
  ReliabilityLevel,
  { text: string; border: string; bg: string; dot: string }
> = {
  verified: {
    text: 'text-cyber-green',
    border: 'border-cyber-green/40',
    bg: 'bg-cyber-green/10',
    dot: 'bg-cyber-green',
  },
  partial: {
    text: 'text-cyber-orange',
    border: 'border-cyber-orange/40',
    bg: 'bg-cyber-orange/10',
    dot: 'bg-cyber-orange',
  },
  weak: {
    text: 'text-cyber-red',
    border: 'border-cyber-red/40',
    bg: 'bg-cyber-red/10',
    dot: 'bg-cyber-red',
  },
};

/* ------------------------------------------------------------------ *
 * Extraction d'indicateurs (IOC) dans du texte libre
 * ------------------------------------------------------------------ */

export type IocKind =
  | 'url'
  | 'email'
  | 'onion'
  | 'hash'
  | 'crypto'
  | 'iban'
  | 'ip'
  | 'domain'
  | 'phone'
  | 'entity';

export interface IocMatch {
  kind: IocKind;
  value: string;
  start: number;
  end: number;
}

/** Couleur de surlignage par type d'indicateur (légende stable). */
export const IOC_COLORS: Record<IocKind, string> = {
  url: '#0ea5e9',
  email: '#f59e0b',
  onion: '#a855f7',
  hash: '#a3e635',
  crypto: '#fbbf24',
  iban: '#34d399',
  ip: '#ef4444',
  domain: '#22d3ee',
  phone: '#8b5cf6',
  entity: '#f472b6',
};

export const IOC_LABEL_KEY: Record<IocKind, string> = {
  url: 'ioc.url',
  email: 'ioc.email',
  onion: 'ioc.onion',
  hash: 'ioc.hash',
  crypto: 'ioc.crypto',
  iban: 'ioc.iban',
  ip: 'ioc.ip',
  domain: 'ioc.domain',
  phone: 'ioc.phone',
  entity: 'ioc.entity',
};

export const IOC_KINDS = Object.keys(IOC_LABEL_KEY) as IocKind[];

/**
 * Motifs ordonnés du plus spécifique au plus générique : l'alternance étant
 * évaluée de gauche à droite, une URL ne sera jamais re-découpée en domaine.
 */
const IOC_PATTERNS: { kind: IocKind; source: string }[] = [
  { kind: 'url', source: 'https?:\\/\\/[^\\s"\'<>()\\[\\]]+' },
  { kind: 'email', source: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' },
  { kind: 'onion', source: '\\b[a-z0-9]{12,62}\\.onion\\b' },
  { kind: 'hash', source: '\\b[a-fA-F0-9]{128}\\b' },
  { kind: 'hash', source: '\\b[a-fA-F0-9]{64}\\b' },
  { kind: 'hash', source: '\\b[a-fA-F0-9]{40}\\b' },
  { kind: 'hash', source: '\\b[a-fA-F0-9]{32}\\b' },
  { kind: 'crypto', source: '\\b(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40})\\b' },
  { kind: 'iban', source: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b' },
  { kind: 'ip', source: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
  {
    kind: 'domain',
    source:
      '\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+(?:com|net|org|io|ru|cn|fr|de|uk|nl|eu|me|xyz|top|info|biz|site|online|shop|app|dev|cc|su|ws)\\b',
  },
  { kind: 'phone', source: '(?:\\+\\d{1,3}[\\s.-]?)?(?:\\(\\d{1,4}\\)[\\s.-]?)?\\d[\\d\\s.-]{6,}\\d' },
];

const IOC_REGEX = new RegExp(IOC_PATTERNS.map((p) => `(${p.source})`).join('|'), 'gi');

function isPlausibleIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => Number(part) <= 255);
}

function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return false;
  // Écarte les dates ISO et les horodatages.
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value.trim())) return false;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) return false;
  return true;
}

function accept(kind: IocKind, value: string): boolean {
  if (kind === 'ip') return isPlausibleIpv4(value);
  if (kind === 'phone') return isPlausiblePhone(value);
  return true;
}

/**
 * Repère les indicateurs d'une chaîne.
 * `extraTerms` permet de surligner en plus les libellés d'entités du dossier
 * graphique actif (sans casse ni accents).
 */
export function findIocs(text: string, extraTerms: string[] = []): IocMatch[] {
  if (!text) return [];
  const found: IocMatch[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(IOC_REGEX)) {
    const value = match[0];
    if (!value || match.index === undefined) continue;
    let kind: IocKind | null = null;
    for (let i = 0; i < IOC_PATTERNS.length; i += 1) {
      if (match[i + 1] !== undefined) {
        kind = IOC_PATTERNS[i].kind;
        break;
      }
    }
    if (!kind || !accept(kind, value)) continue;
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ kind, value, start: match.index, end: match.index + value.length });
  }

  // Termes additionnels (entités du dossier) : recherche littérale, en
  // ignorant les zones déjà couvertes par un indicateur détecté.
  for (const term of extraTerms) {
    const needle = term.trim();
    if (needle.length < 3) continue;
    const haystack = text.toLowerCase();
    const lower = needle.toLowerCase();
    let from = 0;
    let guard = 0;
    while (guard < 200) {
      const index = haystack.indexOf(lower, from);
      if (index < 0) break;
      const end = index + needle.length;
      const overlaps = found.some((item) => index < item.end && end > item.start);
      const key = `entity:${lower}`;
      if (!overlaps && !seen.has(key)) {
        seen.add(key);
        found.push({ kind: 'entity', value: text.slice(index, end), start: index, end });
      }
      from = end;
      guard += 1;
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Répartition par type, pour la légende. */
export function summarizeIocs(matches: IocMatch[]): { kind: IocKind; count: number }[] {
  const counts = new Map<IocKind, number>();
  for (const match of matches) counts.set(match.kind, (counts.get(match.kind) ?? 0) + 1);
  return IOC_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({ kind, count: counts.get(kind) ?? 0 }));
}

/* ------------------------------------------------------------------ *
 * Chronologie
 * ------------------------------------------------------------------ */

export interface TimelineDay {
  /** Clé `YYYY-MM-DD`. */
  day: string;
  items: EvidenceArtifact[];
}

/** Regroupe les preuves par jour, du plus récent au plus ancien. */
export function groupByDay(artifacts: EvidenceArtifact[]): TimelineDay[] {
  const buckets = new Map<string, EvidenceArtifact[]>();
  for (const artifact of artifacts) {
    const day = (artifact.captured_at || '').slice(0, 10) || 'unknown';
    const list = buckets.get(day);
    if (list) list.push(artifact);
    else buckets.set(day, [artifact]);
  }
  return [...buckets.entries()]
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => b.captured_at.localeCompare(a.captured_at)),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
