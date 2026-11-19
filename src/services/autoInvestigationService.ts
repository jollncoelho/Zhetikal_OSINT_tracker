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
import { PUBLIC_SITES, evaluatePublicSite, type PublicSite } from './publicSites';
import { runDeepScan } from './deepScanService';

export type AutoSourceId =
  | 'telegram' | 'github' | 'hackernews' | 'mastodon' | 'gitlab' | 'devto'
  | 'bluesky' | 'pastebin' | 'web' | 'search'
  | 'bitbucket' | 'codeberg' | 'stackexchange' | 'wikipedia' | 'keybase'
  | 'deepscan';

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
  // Un pseudo accentué (`zhétikal`) doit devenir `zhetikal`, pas `zhtikal` :
  // on retire les diacritiques avant de filtrer les caractères.
  value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

/** GitLab : la recherche par username renvoie `[]` si le compte n'existe pas. */
async function collectGitlab(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (!response.ok) {
      return { state: { id: 'gitlab', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown>[];
    const user = Array.isArray(data) ? data[0] : null;
    // GitLab est insensible à la casse sur la recherche mais renvoie parfois
    // plusieurs comptes : on ne garde qu'une correspondance exacte.
    const exact = user && typeof user.username === 'string' &&
      user.username.toLowerCase() === username.toLowerCase() ? user : null;
    if (!exact) {
      return { state: { id: 'gitlab', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    const fields: Record<string, unknown> = {
      plateforme: 'GitLab',
      handle: exact.username,
      nom: exact.name || null,
      profil: exact.web_url || null,
      _consulteLe: new Date().toISOString(),
    };
    return {
      state: { id: 'gitlab', status: 'found', detail: `@${exact.username}` },
      finding: {
        key: 'gitlab',
        type: 'username',
        label: `@${exact.username}`,
        source: 'gitlab',
        url: typeof exact.web_url === 'string' ? exact.web_url : `https://gitlab.com/${exact.username}`,
        fields,
        notes: stripHtml(exact.bio),
        confidence: 0.55,
        photoUrl: typeof exact.avatar_url === 'string' ? exact.avatar_url : null,
      },
    };
  } catch {
    return { state: { id: 'gitlab', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

/** DEV Community : profil public par username, sans clé ni authentification. */
async function collectDevTo(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (response.status === 404) {
      return { state: { id: 'devto', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    if (!response.ok) {
      return { state: { id: 'devto', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.username !== 'string') {
      return { state: { id: 'devto', status: 'absent', detail: 'réponse inattendue' }, finding: null };
    }
    const fields: Record<string, unknown> = {
      plateforme: 'DEV Community',
      handle: data.username,
      nom: data.name || null,
      twitter: data.twitter_username || null,
      github: data.github_username || null,
      _consulteLe: new Date().toISOString(),
    };
    return {
      state: { id: 'devto', status: 'found', detail: `@${data.username}` },
      finding: {
        key: 'devto',
        type: 'username',
        label: `@${data.username}`,
        source: 'devto',
        url: typeof data.url === 'string' ? data.url : `https://dev.to/${data.username}`,
        fields,
        notes: stripHtml(data.summary),
        confidence: 0.55,
        photoUrl: typeof data.profile_image === 'string' ? data.profile_image : null,
      },
    };
  } catch {
    return { state: { id: 'devto', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

/** Évite qu'un `neo` soit accepté pour `néon` ou `neon_backup`. */
function hasExactHandle(value: unknown, username: string): boolean {
  return typeof value === 'string' && value.toLowerCase() === username.toLowerCase();
}

/**
 * Sources supplémentaires vérifiées comme CORS-open en production :
 * un 404 explicite = absent, une réponse valide = compte prouvé.
 */
async function collectBitbucket(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://api.bitbucket.org/2.0/users/${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (response.status === 404) {
      return { state: { id: 'bitbucket', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    if (!response.ok) {
      return { state: { id: 'bitbucket', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (!hasExactHandle(data.username, username)) {
      return { state: { id: 'bitbucket', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    const links = data.links as Record<string, { href?: string }> | undefined;
    return {
      state: { id: 'bitbucket', status: 'found', detail: `@${data.username}` },
      finding: {
        key: 'bitbucket',
        type: 'username',
        label: `@${data.username}`,
        source: 'bitbucket',
        url: links?.html?.href ?? `https://bitbucket.org/${data.username}/`,
        fields: {
          plateforme: 'Bitbucket',
          handle: data.username,
          nom: data.display_name || null,
          creeLe: typeof data.created_on === 'string' ? data.created_on.slice(0, 10) : '',
          _consulteLe: new Date().toISOString(),
        },
        notes: '',
        confidence: 0.5,
      },
    };
  } catch {
    return { state: { id: 'bitbucket', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

async function collectCodeberg(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://codeberg.org/api/v1/users/${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (response.status === 404) {
      return { state: { id: 'codeberg', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    if (!response.ok) {
      return { state: { id: 'codeberg', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (!hasExactHandle(data.login, username)) {
      return { state: { id: 'codeberg', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    return {
      state: { id: 'codeberg', status: 'found', detail: `@${data.login}` },
      finding: {
        key: 'codeberg',
        type: 'username',
        label: `@${data.login}`,
        source: 'codeberg',
        url: typeof data.html_url === 'string' ? data.html_url : `https://codeberg.org/${data.login}`,
        fields: {
          plateforme: 'Codeberg',
          handle: data.login,
          nom: data.full_name || null,
          _consulteLe: new Date().toISOString(),
        },
        notes: '',
        confidence: 0.5,
      },
    };
  } catch {
    return { state: { id: 'codeberg', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

/** Une seule source, trois sites : le pseudo peut exister sur l'un d'eux. */
const STACK_SITES = [
  { id: 'stackoverflow', label: 'Stack Overflow' },
  { id: 'superuser', label: 'Super User' },
  { id: 'serverfault', label: 'Server Fault' },
];

async function collectStackExchange(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; findings: AutoFinding[] }> {
  try {
    const matches = await Promise.all(
      STACK_SITES.map(async (site) => {
        const response = await boundedFetch(
          `https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(username)}` +
            `&site=${site.id}&filter=default&pagesize=25`,
          { headers: { Accept: 'application/json' } },
          signal
        );
        if (!response.ok) return null;
        const data = (await response.json()) as { items?: Record<string, unknown>[] };
        const items = Array.isArray(data.items) ? data.items : [];
        // `inname` est une recherche partielle : on exige une correspondance exacte.
        return items.find((item) => hasExactHandle(item.display_name, username)) ?? null;
      })
    );
    const findings: AutoFinding[] = [];
    matches.forEach((user, index) => {
      if (!user) return;
      const site = STACK_SITES[index];
      findings.push({
        key: `stackexchange-${site.id}`,
        type: 'username',
        label: `@${user.display_name} · ${site.label}`,
        source: 'stackexchange',
        url: typeof user.link === 'string' ? user.link : `https://${site.id}.com/users`,
        fields: {
          plateforme: site.label,
          handle: user.display_name,
          reputation: user.reputation ?? null,
          inscritLe: unixToIso(user.creation_date),
          _consulteLe: new Date().toISOString(),
        },
        notes: '',
        confidence: 0.45,
      });
    });
    return {
      state: findings.length
        ? { id: 'stackexchange', status: 'found', detail: `${findings.length} profil(s)` }
        : { id: 'stackexchange', status: 'absent', detail: 'introuvable' },
      findings,
    };
  } catch {
    return { state: { id: 'stackexchange', status: 'error', detail: 'requête bloquée' }, findings: [] };
  }
}

async function collectWikipedia(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=users&ususers=${encodeURIComponent(username)}` +
        '&format=json&origin=*',
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (!response.ok) {
      return { state: { id: 'wikipedia', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as { query?: { users?: Record<string, unknown>[] } };
    const user = data.query?.users?.[0];
    if (!user || 'missing' in user || !hasExactHandle(user.name, username)) {
      return { state: { id: 'wikipedia', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    return {
      state: { id: 'wikipedia', status: 'found', detail: `@${user.name}` },
      finding: {
        key: 'wikipedia',
        type: 'username',
        label: `@${user.name} · Wikipédia`,
        source: 'wikipedia',
        url: `https://en.wikipedia.org/wiki/User:${encodeURIComponent(String(user.name))}`,
        fields: {
          plateforme: 'Wikipédia',
          handle: user.name,
          contributions: user.editcount ?? null,
          inscritLe: user.registration || null,
          _consulteLe: new Date().toISOString(),
        },
        notes: '',
        confidence: 0.45,
      },
    };
  } catch {
    return { state: { id: 'wikipedia', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

async function collectKeybase(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const response = await boundedFetch(
      `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json' } },
      signal
    );
    if (!response.ok) {
      return { state: { id: 'keybase', status: 'error', detail: `HTTP ${response.status}` }, finding: null };
    }
    const data = (await response.json()) as { them?: { basics?: Record<string, unknown> }[] };
    const them = Array.isArray(data.them) ? data.them : [];
    // Un pseudo inconnu renvoie `[null]`, pas `[]` : sans optional chaining le
    // collecteur levait et la source passait « bloquée » au lieu d'« absente ».
    const basics = them
      .map((item) => item?.basics)
      .find((item) => hasExactHandle(item?.username, username));
    if (!basics) {
      return { state: { id: 'keybase', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    return {
      state: { id: 'keybase', status: 'found', detail: `@${basics.username}` },
      finding: {
        key: 'keybase',
        type: 'username',
        label: `@${basics.username} · Keybase`,
        source: 'keybase',
        url: `https://keybase.io/${encodeURIComponent(username)}`,
        fields: {
          plateforme: 'Keybase',
          handle: basics.username,
          nom: basics.full_name || null,
          twitter: basics.twitter || null,
          github: basics.github || null,
          site: basics.website || null,
          _consulteLe: new Date().toISOString(),
        },
        notes: typeof basics.bio === 'string' ? basics.bio : '',
        confidence: 0.5,
      },
    };
  } catch {
    return { state: { id: 'keybase', status: 'error', detail: 'requête bloquée' }, finding: null };
  }
}

/**
 * Lit une page publique via r.jina.ai — le même lecteur que le module Telegram.
 * CORS ouvert, aucune clé requise (mais une clé fournie dans le module Telegram
 * est réutilisée pour ne pas dépendre du quota anonyme partagé).
 */
async function readPublicPage(
  targetUrl: string,
  signal?: AbortSignal
): Promise<string> {
  let key = '';
  try {
    key = localStorage.getItem('telegram_reader_key')?.trim() ?? '';
  } catch {
    /* localStorage indisponible : lecture anonyme. */
  }
  const response = await boundedFetch(
    `https://r.jina.ai/${targetUrl}`,
    {
      headers: {
        Accept: 'text/plain',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
    },
    signal
  );
  if (!response.ok) throw new Error(`reader HTTP ${response.status}`);
  return response.text();
}

/**
 * Bluesky : un profil réel publie un identifiant `did:plc:` et une bio. Une
 * page inexistante affiche le fil « Trending » et aucun DID — sans ce test,
 * n'importe quel pseudo deviendrait un compte trouvé.
 */
async function collectBluesky(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const text = await readPublicPage(
      `https://bsky.app/profile/${encodeURIComponent(username)}.bsky.social`,
      signal
    );
    const did = /did:plc:[a-z0-9]+/i.exec(text)?.[0] ?? '';
    if (!did) {
      return { state: { id: 'bluesky', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    const display = /Profile\s*\n([^\n]{1,80})/.exec(text)?.[1]?.trim() || `@${username}`;
    const bio = /did:plc:[a-z0-9]+\s*\n([^\n]{1,300})/.exec(text)?.[1]?.trim() ?? '';
    return {
      state: { id: 'bluesky', status: 'found', detail: display },
      finding: {
        key: 'bluesky',
        type: 'username',
        label: display,
        source: 'bluesky',
        url: `https://bsky.app/profile/${encodeURIComponent(username)}.bsky.social`,
        fields: {
          plateforme: 'Bluesky',
          handle: `${username}.bsky.social`,
          did,
          _consulteLe: new Date().toISOString(),
        },
        notes: bio,
        confidence: 0.55,
      },
    };
  } catch {
    return { state: { id: 'bluesky', status: 'error', detail: 'lecture impossible' }, finding: null };
  }
}

/** Pastebin : le titre d'une page inexistante est explicite (« Not Found (#404) »). */
async function collectPastebin(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; finding: AutoFinding | null }> {
  try {
    const text = await readPublicPage(
      `https://pastebin.com/u/${encodeURIComponent(username)}`,
      signal
    );
    if (/Not Found\s*\(?#?404/i.test(text) || /Target URL returned error 404/i.test(text)) {
      return { state: { id: 'pastebin', status: 'absent', detail: 'introuvable' }, finding: null };
    }
    const title = /^Title:\s*(.+)$/im.exec(text)?.[1]?.trim() ?? '';
    if (!title) {
      return { state: { id: 'pastebin', status: 'absent', detail: 'réponse inattendue' }, finding: null };
    }
    return {
      state: { id: 'pastebin', status: 'found', detail: title.replace(/'s Pastebin.*$/i, '') },
      finding: {
        key: 'pastebin',
        type: 'username',
        label: title.replace(/\s*- Pastebin\.com$/i, ''),
        source: 'pastebin',
        url: `https://pastebin.com/u/${encodeURIComponent(username)}`,
        fields: {
          plateforme: 'Pastebin',
          handle: username,
          _consulteLe: new Date().toISOString(),
        },
        notes: '',
        confidence: 0.5,
      },
    };
  } catch {
    return { state: { id: 'pastebin', status: 'error', detail: 'lecture impossible' }, finding: null };
  }
}

/**
 * Interroge les sites publics en petit nombre (2 à la fois) : le lecteur
 * anonyme compte 20 requêtes/minute par IP, un balayage massif en parallèle
 * se ferait bloquer et ne rendrait rien.
 */
async function collectWebProfiles(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; findings: AutoFinding[] }> {
  const findings: AutoFinding[] = [];
  let checked = 0;
  let errors = 0;

  const checkOne = async (site: PublicSite) => {
    if (signal?.aborted) return;
    try {
      const raw = await readPublicPage(site.url(username), signal);
      const verdict = evaluatePublicSite(site, raw);
      checked += 1;
      if (verdict.found) {
        findings.push({
          key: `web-${site.id}`,
          type: 'username',
          label: `${site.label} : ${verdict.title.slice(0, 60)}`,
          source: 'web',
          url: site.url(username),
          fields: {
            plateforme: site.label,
            handle: username,
            titre: verdict.title,
            _consulteLe: new Date().toISOString(),
          },
          notes: `Profil public détecté sur ${site.label} via lecteur. À confirmer de visu.`,
          confidence: 0.45,
        });
      }
    } catch {
      checked += 1;
      errors += 1;
    }
  };

  // Lots de deux : assez lent pour le quota, assez rapide pour rester
  // supportable (~10 s pour l'ensemble).
  for (let i = 0; i < PUBLIC_SITES.length; i += 2) {
    await Promise.all(PUBLIC_SITES.slice(i, i + 2).map(checkOne));
  }

  return {
    state: {
      id: 'web',
      status: findings.length > 0 ? 'found' : errors === checked ? 'error' : 'absent',
      detail: findings.length > 0
        ? `${findings.length} profil(s)`
        : errors === checked ? 'lecture bloquée' : 'aucun profil prouvé',
    },
    findings,
  };
}

/**
 * Découverte par moteur de recherche : une seule requête peut révéler des
 * profils hébergés sur des sites que le lecteur ne peut pas ouvrir (Instagram,
 * LinkedIn…). C'est le complément le plus rentable du balayage site par site.
 *
 * Règle anti-faux-positif : le résultat doit venir d'une plateforme connue,
 * son chemin doit contenir exactement le pseudo, ET son titre doit le citer.
 * Un lien vers un dépôt `github.com/pseudo/projet` n'est donc pas un profil.
 */
const escRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hostIs = (url: URL, ...hosts: string[]) => {
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
};
const pathIs = (pathname: string, pattern: string) =>
  new RegExp(`^${pattern}/?$`, 'i').test(pathname);
const subdomainIs = (url: URL, username: string, domain: string) =>
  url.hostname.toLowerCase() === `${username.toLowerCase()}.${domain}`;

interface SearchPlatform {
  id: string;
  label: string;
  match: (url: URL, username: string) => boolean;
}

const SEARCH_PLATFORMS: SearchPlatform[] = [
  { id: 'reddit', label: 'Reddit', match: (x, u) => hostIs(x, 'reddit.com') && pathIs(x.pathname, `/user/${escRegex(u)}`) },
  { id: 'github', label: 'GitHub', match: (x, u) => hostIs(x, 'github.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'gitlab', label: 'GitLab', match: (x, u) => hostIs(x, 'gitlab.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'bitbucket', label: 'Bitbucket', match: (x, u) => hostIs(x, 'bitbucket.org') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'codeberg', label: 'Codeberg', match: (x, u) => hostIs(x, 'codeberg.org') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'telegram', label: 'Telegram', match: (x, u) => hostIs(x, 't.me') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'x', label: 'X', match: (x, u) => hostIs(x, 'x.com', 'twitter.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'instagram', label: 'Instagram', match: (x, u) => hostIs(x, 'instagram.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'tiktok', label: 'TikTok', match: (x, u) => hostIs(x, 'tiktok.com') && pathIs(x.pathname, `/@${escRegex(u)}`) },
  { id: 'linkedin', label: 'LinkedIn', match: (x, u) => hostIs(x, 'linkedin.com') && pathIs(x.pathname, `/in/${escRegex(u)}`) },
  { id: 'youtube', label: 'YouTube', match: (x, u) => hostIs(x, 'youtube.com') && pathIs(x.pathname, `/@${escRegex(u)}`) },
  { id: 'twitch', label: 'Twitch', match: (x, u) => hostIs(x, 'twitch.tv') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'medium', label: 'Medium', match: (x, u) => hostIs(x, 'medium.com') && pathIs(x.pathname, `/@${escRegex(u)}`) },
  { id: 'devto', label: 'DEV', match: (x, u) => hostIs(x, 'dev.to') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'keybase', label: 'Keybase', match: (x, u) => hostIs(x, 'keybase.io') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'huggingface', label: 'Hugging Face', match: (x, u) => hostIs(x, 'huggingface.co') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'pastebin', label: 'Pastebin', match: (x, u) => hostIs(x, 'pastebin.com') && pathIs(x.pathname, `/u/${escRegex(u)}`) },
  { id: 'pinterest', label: 'Pinterest', match: (x, u) => hostIs(x, 'pinterest.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'deviantart', label: 'DeviantArt', match: (x, u) => hostIs(x, 'deviantart.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'wordpress', label: 'WordPress', match: (x, u) => subdomainIs(x, u, 'wordpress.com') },
  { id: 'blogger', label: 'Blogger', match: (x, u) => subdomainIs(x, u, 'blogspot.com') },
  { id: 'tumblr', label: 'Tumblr', match: (x, u) => subdomainIs(x, u, 'tumblr.com') },
  { id: 'linktree', label: 'Linktree', match: (x, u) => hostIs(x, 'linktr.ee') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'facebook', label: 'Facebook', match: (x, u) => hostIs(x, 'facebook.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'vk', label: 'VK', match: (x, u) => hostIs(x, 'vk.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'flickr', label: 'Flickr', match: (x, u) => hostIs(x, 'flickr.com') && pathIs(x.pathname, `/photos/${escRegex(u)}`) },
  { id: 'spotify', label: 'Spotify', match: (x, u) => hostIs(x, 'spotify.com') && pathIs(x.pathname, `/user/${escRegex(u)}`) },
  { id: 'soundcloud', label: 'SoundCloud', match: (x, u) => hostIs(x, 'soundcloud.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'steam', label: 'Steam', match: (x, u) => hostIs(x, 'steamcommunity.com') && pathIs(x.pathname, `/id/${escRegex(u)}`) },
  { id: 'aboutme', label: 'About.me', match: (x, u) => hostIs(x, 'about.me') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'patreon', label: 'Patreon', match: (x, u) => hostIs(x, 'patreon.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
  { id: 'kickstarter', label: 'Kickstarter', match: (x, u) => hostIs(x, 'kickstarter.com') && pathIs(x.pathname, `/profile/${escRegex(u)}`) },
  { id: 'openstreetmap', label: 'OpenStreetMap', match: (x, u) => hostIs(x, 'openstreetmap.org') && pathIs(x.pathname, `/user/${escRegex(u)}`) },
  { id: 'quora', label: 'Quora', match: (x, u) => hostIs(x, 'quora.com') && pathIs(x.pathname, `/profile/${escRegex(u)}`) },
  { id: 'bandcamp', label: 'Bandcamp', match: (x, u) => hostIs(x, 'bandcamp.com') && pathIs(x.pathname, `/${escRegex(u)}`) },
];

function decodeDdgUrl(raw: string): string {
  try {
    const link = new URL(raw);
    if (/(^|\.)duckduckgo\.com$/.test(link.hostname) && link.pathname === '/l/') {
      return link.searchParams.get('uddg') ?? '';
    }
    return link.href;
  } catch {
    return raw;
  }
}

function titleMentions(title: string, username: string): boolean {
  const plain = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return new RegExp(`(^|[^a-z0-9])@?${escRegex(username.toLowerCase())}([^a-z0-9]|$)`, 'i').test(plain);
}

export interface SearchHit {
  key: string;
  label: string;
  platform: string;
  title: string;
  url: string;
}

/** Exporté pour les tests : vérifie qu'un faux positif ne passe pas. */
export function parseSearchResults(markdown: string, username: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split('\n')) {
    const match = /^##\s+\[([^\]]{2,180})\]\((https?:\/\/[^)]+)\)/.exec(line.trim());
    if (!match) continue;
    const title = match[1].trim();
    if (/definition|dictionary|meaning|what is/i.test(title)) continue;
    let url: URL;
    try {
      url = new URL(decodeDdgUrl(match[2]));
    } catch {
      continue;
    }
    if (!titleMentions(title, username)) continue;
    for (const platform of SEARCH_PLATFORMS) {
      if (!platform.match(url, username)) continue;
      const key = `search-${platform.id}`;
      if (seen.has(key)) break;
      seen.add(key);
      hits.push({
        key,
        label: `${platform.label} : ${title.slice(0, 60)}`,
        platform: platform.label,
        title,
        url: url.href,
      });
      break;
    }
  }
  return hits;
}

async function collectSearch(
  username: string,
  signal?: AbortSignal
): Promise<{ state: AutoSourceState; findings: AutoFinding[] }> {
  // Trois requêtes seulement : le lecteur public a un quota anonyme.
  const queries = [`"${username}"`, `"${username}" site:reddit.com`, `"${username}" site:instagram.com`];
  try {
    const pages = await Promise.all(
      queries.map((query) =>
        readPublicPage(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          signal
        ).catch(() => '')
      )
    );
    if (pages.every((page) => !page)) {
      return { state: { id: 'search', status: 'error', detail: 'moteur bloqué' }, findings: [] };
    }
    const findings: AutoFinding[] = [];
    const seen = new Set<string>();
    for (const page of pages) {
      for (const hit of parseSearchResults(page, username)) {
        if (seen.has(hit.key)) continue;
        seen.add(hit.key);
        findings.push({
          key: hit.key,
          type: 'username',
          label: hit.label,
          source: 'search',
          url: hit.url,
          fields: {
            plateforme: hit.platform,
            handle: username,
            titre: hit.title,
            _consulteLe: new Date().toISOString(),
          },
          notes: `Résultat indexé par DuckDuckGo (${hit.title}). Index potentiellement obsolète : à confirmer de visu.`,
          confidence: 0.4,
        });
      }
    }
    return {
      state: findings.length
        ? { id: 'search', status: 'found', detail: `${findings.length} résultat(s)` }
        : { id: 'search', status: 'absent', detail: 'aucun profil indexé' },
      findings,
    };
  } catch {
    return { state: { id: 'search', status: 'error', detail: 'recherche impossible' }, findings: [] };
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
    { label: 'GitLab', url: `https://gitlab.com/${u}` },
    { label: 'DEV', url: `https://dev.to/${u}` },
    { label: 'Twitch', url: `https://www.twitch.tv/${u}` },
    { label: 'Bluesky', url: `https://bsky.app/profile/${u}.bsky.social` },
    { label: 'Pastebin', url: `https://pastebin.com/u/${u}` },
    { label: 'Hugging Face', url: `https://huggingface.co/${u}` },
    { label: 'Docker Hub', url: `https://hub.docker.com/u/${u}` },
    { label: 'Minds', url: `https://www.minds.com/${u}` },
    { label: 'Facebook', url: `https://www.facebook.com/${u}` },
    { label: 'Quora', url: `https://www.quora.com/profile/${u}` },
    { label: 'Flickr', url: `https://www.flickr.com/photos/${u}/` },
    { label: 'Steam', url: `https://steamcommunity.com/id/${u}/` },
    { label: 'Spotify', url: `https://open.spotify.com/user/${u}` },
    { label: 'SoundCloud', url: `https://soundcloud.com/${u}` },
    { label: 'VK', url: `https://vk.com/${u}` },
    { label: 'Tumblr', url: `https://${u}.tumblr.com/` },
    { label: 'About.me', url: `https://about.me/${u}` },
    { label: 'Codeberg', url: `https://codeberg.org/${u}` },
    { label: 'Bitbucket', url: `https://bitbucket.org/${u}/` },
    { label: 'OpenStreetMap', url: `https://www.openstreetmap.org/user/${u}` },
    { label: 'Patreon', url: `https://www.patreon.com/${u}` },
  ];
}

export const AUTO_SOURCES: { id: AutoSourceId; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'github', label: 'GitHub' },
  { id: 'gitlab', label: 'GitLab' },
  { id: 'bitbucket', label: 'Bitbucket' },
  { id: 'codeberg', label: 'Codeberg' },
  { id: 'devto', label: 'DEV' },
  { id: 'stackexchange', label: 'Stack Exchange' },
  { id: 'wikipedia', label: 'Wikipédia' },
  { id: 'keybase', label: 'Keybase' },
  { id: 'bluesky', label: 'Bluesky' },
  { id: 'pastebin', label: 'Pastebin' },
  { id: 'search', label: 'Moteur de recherche' },
  { id: 'web', label: 'Web public' },
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'mastodon', label: 'Mastodon' },
  { id: 'deepscan', label: 'Serveur 476 sites' },
];

export interface AutoRunOptions {
  /** Active le balayage via la fonction Vercel. Faux = 100 % local. */
  deepScan?: boolean;
}

/** Lance toutes les sources en parallèle et publie l'état après chacune. */
export async function runAutoInvestigation(
  rawUsername: string,
  onProgress?: AutoProgress,
  signal?: AbortSignal,
  options: AutoRunOptions = {}
): Promise<AutoInvestigationResult> {
  const username = normalizeUsername(rawUsername);
  if (!username) throw new Error('empty_username');

  const states: AutoSourceState[] = AUTO_SOURCES
    .filter(({ id }) => id !== 'deepscan' || options.deepScan)
    .map(({ id }) => ({ id, status: 'running' as const, detail: '' }));
  onProgress?.([...states]);

  const set = (next: AutoSourceState) => {
    const index = states.findIndex((item) => item.id === next.id);
    if (index >= 0) states[index] = next;
    onProgress?.([...states]);
  };

  // Le mode serveur est lancé en même temps que les sources locales, mais
  // uniquement si l'analyste l'a activé : sinon aucun octet ne quitte l'appareil.
  const deepPromise = options.deepScan ? runDeepScan(username, signal) : null;

  // Treize sources directes (dont Stack Exchange, qui rend plusieurs profils),
  // puis le balayage site par site et la recherche indexée. Chaque collecteur
  // gère sa propre erreur : une source bloquée n'en empêche aucune autre.
  const directResults = await Promise.all(
    [
      collectTelegram(username, signal),
      collectGithub(username, signal),
      collectGitlab(username, signal),
      collectDevTo(username, signal),
      collectBluesky(username, signal),
      collectPastebin(username, signal),
      collectHackerNews(username, signal),
      collectMastodon(username, signal),
      collectBitbucket(username, signal),
      collectCodeberg(username, signal),
      collectStackExchange(username, signal),
      collectWikipedia(username, signal),
      collectKeybase(username, signal),
    ].map(async (collector) => {
      const result = await collector;
      set(result.state);
      if ('findings' in result) return result.findings;
      return result.finding ? [result.finding] : [];
    })
  );
  const directFindings = directResults.flat();

  const [web, search] = await Promise.all([
    collectWebProfiles(username, signal),
    collectSearch(username, signal),
  ]);
  set(web.state);
  set(search.state);

  const deep = deepPromise ? await deepPromise : null;
  if (deep) set(deep.state);

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

  // Une plateforme ne produit qu'un seul nœud : on garde la source la plus
  // fiable (API directe > page lue > résultat indexé) et on écarte les doublons.
  const claimed = new Set(directFindings.map((finding) => finding.key));
  const webFindings = web.findings.filter((finding) => {
    const key = finding.key.replace(/^web-/, '');
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  });
  const searchFindings = search.findings.filter((finding) => {
    const key = finding.key.replace(/^search-/, '');
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  });
  const deepFindings = (deep?.findings ?? []).filter((finding) => {
    const key = finding.key.replace(/^deepscan-/, '');
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  });

  return {
    username,
    findings: [
      root,
      ...directFindings,
      ...webFindings,
      ...searchFindings,
      ...deepFindings,
    ],
    sources: [...states],
    manualChecks: manualChecksFor(username),
  };
}
