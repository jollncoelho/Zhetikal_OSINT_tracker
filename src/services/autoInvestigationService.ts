/* ------------------------------------------------------------------ *
 * Enquête automatique — « un pseudo, un graphe ».
 *
 * Le tracker est une application **statique** : il n'y a nulle part où cacher
 * un client HTTP capable de frapper 400 sites comme Sherlock le fait depuis un
 * serveur. Le navigateur n'autorise que les sources qui renvoient une en-tête
 * CORS, plus le lecteur public déjà utilisé par le module Telegram.
 *
 * Deux règles que ce service ne doit jamais transgresser :
 *   1. une source qui échoue ne doit pas empêcher les autres de rendre un
 *      résultat — chaque collecteur attrape donc sa propre erreur ;
 *   2. un compte non prouvé n'entre **pas** dans le graphe. Un pseudo tapé par
 *      l'analyste n'est pas une preuve d'existence sur une plateforme.
 * ------------------------------------------------------------------ */

import type { EntityType } from '../types';
import {
  entityTypeFor,
  fetchProfile,
  parseTarget,
  TelegramError,
} from '../services/telegramService';

export type AutoSourceId = 'telegram' | 'github' | 'hackernews' | 'mastodon';

export type AutoSourceStatus = 'idle' | 'running' | 'found' | 'absent' | 'error';

export interface AutoSourceState {
  id: AutoSourceId;
  status: AutoSourceStatus;
  /** Texte court affiché à côté de la source (trouvé / absent / erreur). */
  detail: string;
}

export interface AutoFinding {
  /** Clé locale, utilisée pour relier les arêtes avant création des IDs. */
  key: string;
  type: EntityType;
  label: string;
  source: AutoSourceId | 'input';
  url: string;
  fields: Record<string, unknown>;
  notes: string;
  /** Confiance faible par défaut : même pseudo ≠ même personne prouvée. */
  confidence: number;
  photoUrl?: string | null;
}

export interface AutoManualCheck {
  label: string;
  url: string;
}

export interface AutoInvestigationResult {
  username: string;
  findings: AutoFinding[];
  sources: AutoSourceState[];
  manualChecks: AutoManualCheck[];
}

export type AutoProgress = (states: AutoSourceState[]) => void;

/** Au-delà de ce délai une source est déclarée injoignable, sans bloquer les autres. */
const SOURCE_TIMEOUT_MS = 12_000;

/**
 * `fetch` sans signal peut rester ouvert indéfiniment quand un serveur accepte
 * la connexion sans jamais répondre (piège déjà rencontré sur l'analyse IA).
 * On borne donc **chaque** requête, tout en propageant l'annulation de l'UI.
 */
async function boundedFetch(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) controller.abort();
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Les bios Mastodon/HN arrivent en HTML : on ne garde que le texte. */
function stripHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Date UNIX Hacker News → ISO lisible, sans timezone ambiguë. */
function unixToIso(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Normalise une saisie : pseudo nu, @pseudo, ou URL de profil copiée depuis la
 * barre d'adresse. Sans le cas URL, coller `https://x.com/pseudo` recherchait
 * le compte `x.com` — exactement le genre d'erreur invisible qui ruine une
 * enquête avant même la première requête.
 */
export function normalizeUsername(raw: string): string {
  let value = (raw ?? '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split('/').filter(Boolean);
      // `t.me/s/canal` est un aperçu, pas le pseudo.
      if (/t\.me$/i.test(url.hostname) && parts[0]?.toLowerCase() === 's') parts.shift();
      value = parts[0] ?? url.hostname;
    } catch {
      value = value.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
    }
  } else {
    value = value.replace(
      /^(?:www\.)?(?:t\.me|telegram\.me|x\.com|twitter\.com|instagram\.com|tiktok\.com|github\.com|reddit\.com|linkedin\.com|mastodon\.social|news\.ycombinator\.com)\//i,
      ''
    );
  }

  value = value.replace(/^@/, '');
  value = value.split(/[/?#\s]/)[0];
  return value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);
}

async function collectTelegram(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  const target = parseTarget(`@${username}`);
  if (!target || target.kind !== 'handle') {
    return {
      state: { id: 'telegram', status: 'absent', detail: 'pseudo invalide' },
      finding: null,
    };
  }
  try {
    const profile = await fetchProfile(target, signal);
    // Un handle inexistant et un compte sans métadonnée publique renvoient la
    // même page : dans les deux cas on ne peut pas affirmer qu'il existe.
    if (profile.noPublicData) {
      return {
        state: { id: 'telegram', status: 'absent', detail: 'aucune donnée publique' },
        finding: null,
      };
    }
    const fields: Record<string, unknown> = {
      plateforme: 'Telegram',
      handle: profile.handle,
      titre: profile.title,
      abonnes: profile.subscribersLabel || null,
      verifie: profile.verified,
      nature: profile.kind,
     _consulteLe: profile.fetchedAt,
    };
    return {
      state: { id: 'telegram', status: 'found', detail: profile.title },
      finding: {
        key: 'telegram',
        type: entityTypeFor(profile.kind) as EntityType,
        label: profile.title || `@${profile.handle}`,
        source: 'telegram',
        url: profile.url,
        fields,
        notes: profile.bio ? `Bio publique : ${profile.bio}` : '',
        confidence: profile.verified ? 0.65 : 0.5,
        photoUrl: profile.photoUrl,
      },
    };
  } catch (error) {
    const detail = error instanceof TelegramError ? error.code : 'lecture impossible';
    return { state: { id: 'telegram', status: 'error', detail }, finding: null };
  }
}

async function collectGithub(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/vnd.github+json' } },
      signal
    );
    if (response.status === 404) {
      return { state: { id: 'github', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    if (response.status === 403 || response.status === 429) {
      return {
        state: { id: 'github', status: 'error', detail: 'limite API atteinte (60/h)' },
        finding: null,
      };
    }
    if (!response.ok) {
      return { state: { id: 'github', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.login !== 'string') {
      return { state: { id: 'github', status: 'absent', detail: 'réponse inattendue' }, finding: null };
    }
    const fields: Record<string, unknown> = {
      plateforme: 'GitHub',
      handle: data.login,
      nom: data.name || null,
      localisation: data.location || null,
      site: data.blog || null,
      twitter: data.twitter_username || null,
      abonnes: data.followers ?? null,
      repositories: data.public_repos ?? null,
      creeLe: typeof data.created_at === 'string' ? data.created_at.slice(0, 10) : '',
      _consulteLe: new Date().toISOString(),
    };
    return {
      state: { id: 'github', status: 'found', detail: `@${data.login}` },
      finding: {
        key: 'github',
        type: 'username',
        label: `@${data.login}`,
        source: 'github',
        url: typeof data.html_url === 'string' ? data.html_url : `https://github.com/${data.login}`,
        fields,
        notes: stripHtml(data.bio),
        confidence: 0.6,
        photoUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
      },
    };
  } catch {
    return { state: { id: 'github', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

async function collectHackerNews(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`,
      {},
      signal
    );
    if (!response.ok) {
      return { state: { id: 'hackernews', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown> | null;
    if (!data || typeof data.id !== 'string') {
      return { state: { id: 'hackernews', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    const fields: Record<string, unknown> = {
      plateforme: 'Hacker News',
      handle: data.id,
      karma: data.karma ?? null,
      inscritLe: unixToIso(data.created),
      soumissions: Array.isArray(data.submitted) ? data.submitted.length : 0,
      _consulteLe: new Date().toISOString(),
    };
    return {
      state: { id: 'hackernews', status: 'found', detail: `@${data.id}` },
      finding: {
        key: 'hackernews',
        type: 'username',
        label: `@${data.id}`,
        source: 'hackernews',
        url: `https://news.ycombinator.com/user?id=${encodeURIComponent(String(data.id))}`,
        fields,
        notes: stripHtml(data.about),
        confidence: 0.5,
      },
    };
  } catch {
    return { state: { id: 'hackernews', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

async function collectMastodon(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://mastodon.social/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (response.status === 404) {
      return { state: { id: 'mastodon', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    if (!response.ok) {
      return { state: { id: 'mastodon', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.acct !== 'string') {
      return { state: { id: 'mastodon', status: 'absent', detail: 'réponse inattendue' }, finding: null };
    }
    const fields: Record<string, unknown> = {
      plateforme: 'Mastodon',
      handle: data.acct,
      nom: data.display_name || null,
      abonnes: data.followers_count ?? null,
      suivis: data.following_count ?? null,
      publications: data.statuses_count ?? null,
      bot: data.bot === true,
      _consulteLe: new Date().toISOString(),
    };
    return {
      state: { id: 'mastodon', status: 'found', detail: `@${data.acct}` },
      finding: {
        key: 'mastodon',
        type: 'username',
        label: `@${data.acct}`,
        source: 'mastodon',
        url: typeof data.url === 'string' ? data.url : `https://mastodon.social/@${data.acct}`,
        fields,
        notes: stripHtml(data.note),
        confidence: 0.5,
        photoUrl: typeof data.avatar === 'string' ? data.avatar : null,
      },
    };
  } catch {
    return { state: { id: 'mastodon', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

/**
 * Sites dont l'existence d'un profil ne peut pas être prouvée depuis un
 * navigateur (CORS fermé, login obligatoire, ou page générique renvoyée à
 * n'importe quel pseudo). On les propose comme **liens à vérifier à la main**,
 * jamais comme nœuds du graphe : c'est la ligne entre piste et affirmation.
 */
export function manualChecksFor(username: string): AutoManualCheck[] {
  const u = encodeURIComponent(username);
  return [
    { label: 'Telegram', url: `https://t.me/${u}` },
    { label: 'GitHub', url: `https://github.com/${u}` },
    { label: 'X', url: `https://x.com/${u}` },
    { label: 'Instagram', url: `https://www.instagram.com/${u}/` },
    { label: 'TikTok', url: `https://www.tiktok.com/@${u}` },
    { label: 'Reddit', url: `https://www.reddit.com/user/${u}/` },
    { label: 'LinkedIn', url: `https://www.linkedin.com/in/${u}/` },
    { label: 'Hacker News', url: `https://news.ycombinator.com/user?id=${u}` },
    { label: 'Mastodon', url: `https://mastodon.social/@${u}` },
  ];
}

export const AUTO_SOURCES: { id: AutoSourceId; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'github', label: 'GitHub' },
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'mastodon', label: 'Mastodon' },
];

/** Lance toutes les sources en parallèle et publie l'état après chacune. */
export async function runAutoInvestigation(
  rawUsername: string,
  onProgress?: AutoProgress,
  signal?: AbortSignal
): Promise<AutoInvestigationResult> {
  const username = normalizeUsername(rawUsername);
  if (!username) throw new Error('empty_username');

  const states: AutoSourceState[] = AUTO_SOURCES.map(({ id }) => ({
    id,
    status: 'running',
    detail: '',
  }));
  onProgress?.([...states]);

  const set = (next: AutoSourceState) => {
    const index = states.findIndex((item) => item.id === next.id);
    if (index >= 0) states[index] = next;
    onProgress?.([...states]);
  };

  const collectors = [
    collectTelegram(username, signal),
    collectGithub(username, signal),
    collectHackerNews(username, signal),
    collectMastodon(username, signal),
  ];

  const results = await Promise.all(
    collectors.map(async (collector, index) => {
      const { state, finding } = await collector;
      set(state);
      return finding ? { finding, order: index } : null;
    })
  );

  const root: AutoFinding = {
    key: 'root',
    type: 'username',
    label: `@${username}`,
    source: 'input',
    url: '',
    fields: {
      origine: 'Recherche automatique',
      identifiant: username,
      _date: new Date().toISOString(),
    },
    notes: `Point de départ de l'enquête automatique. Les comptes reliés ont le même identifiant ; l'appartenance à une même personne reste à vérifier.`,
    confidence: 1,
  };

  return {
    username,
    findings: [root, ...results.filter(Boolean).map((item) => item!.finding)],
    sources: [...states],
    manualChecks: manualChecksFor(username),
  };
}
