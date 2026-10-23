/**
 * Telegram OSINT — lecture des métadonnées **publiques** de canaux, groupes
 * et comptes Telegram.
 *
 * ## Pourquoi un lecteur intermédiaire
 *
 * `t.me` ne renvoie **aucun en-tête CORS** : mesuré, un `GET https://t.me/durov`
 * avec `Origin: https://tracker.query-intel.com` répond `200` mais sans
 * `Access-Control-Allow-Origin`. Le navigateur jette donc la réponse et le
 * `fetch` échoue sur un « Failed to fetch » indiscernable d'une panne réseau.
 *
 * La parade est un **lecteur public** qui reflète l'origine de l'appelant :
 * `r.jina.ai` renvoie bien `access-control-allow-origin: <origine>` (vérifié
 * depuis deux origines distinctes), et son préflight autorise explicitement
 * l'en-tête `x-return-format`. On demande donc le **HTML d'origine** plutôt
 * qu'une conversion Markdown : le balisage de Telegram est stable et sans
 * ambiguïté, alors que le Markdown aplati rendait les blocs de messages
 * impossibles à délimiter proprement (les liens « 1 2 3 More » de navigation
 * étaient confondus avec les permaliens des posts).
 *
 * ⚠️ Ce lecteur a ses propres quotas. D'où le `rateLimited` ci-dessous :
 * toutes les requêtes passent par une file sérialisée, espacées d'au moins
 * `MIN_INTERVAL_MS`. Sans cela, une analyse de vingt handles prend un 429 en
 * plein milieu et l'analyste perd le fil.
 *
 * ## Ce que le module sait faire — et ce qu'il ne sait pas
 *
 * | Capacité | Statut |
 * |---|---|
 * | Résoudre un `@handle`, un lien `t.me/…`, un `tg://` | ✅ |
 * | Métadonnées publiques (titre, bio, abonnés, photo, vérifié) | ✅ |
 * | Rechercher un mot-clé **dans** un canal public | ✅ (`t.me/s/<canal>?q=`) |
 * | Recherche globale de mots-clés sur tout Telegram | ❌ aucun index public |
 * | Contenu d'un groupe privé (lien `+invite`) | ❌ non public par nature |
 *
 * Les deux dernières lignes ne sont pas des bugs : Telegram n'expose pas ces
 * données sans compte connecté. Le module le dit explicitement à l'analyste
 * au lieu de renvoyer un résultat vide qu'il interpréterait comme « rien à
 * trouver ».
 */

/* ------------------------------------------------------------------ *
 * Types publics
 * ------------------------------------------------------------------ */

/** Nature d'un identifiant saisi par l'analyste. */
export type TelegramTargetKind = 'handle' | 'invite';

/** Cible normalisée extraite d'une saisie libre. */
export interface TelegramTarget {
  kind: TelegramTargetKind;
  /** Handle sans `@`, en minuscules. Chaîne vide pour une invitation. */
  handle: string;
  /** URL canonique `https://t.me/…`. */
  url: string;
  /** Jeton d'invitation pour un lien `t.me/+…`. */
  invite?: string;
}

/** Nature de l'entité Telegram résolue. */
export type TelegramEntityKind = 'channel' | 'group' | 'user' | 'bot' | 'invite';

/** Fiche publique d'un canal, groupe, compte ou bot. */
export interface TelegramProfile {
  kind: TelegramEntityKind;
  handle: string;
  title: string;
  bio: string;
  photoUrl: string | null;
  /** Nombre d'abonnés/membres quand Telegram le publie, sinon `null`. */
  subscribers: number | null;
  /** Libellé d'origine (« 10 276 913 subscribers »), tel qu'affiché. */
  subscribersLabel: string;
  verified: boolean;
  url: string;
  /** `true` quand la page ne publie aucune métadonnée (compte discret ou inexistant). */
  noPublicData: boolean;
  fetchedAt: string;
}

/** Un message public extrait de la prévisualisation d'un canal. */
export interface TelegramPost {
  id: string;
  url: string;
  text: string;
  views: string | null;
  /** Horodatage ISO quand Telegram le publie. */
  time: string | null;
}

export type TelegramErrorCode =
  | 'invalid'
  | 'private'
  | 'rate-limit'
  | 'network'
  | 'blocked'
  | 'empty';

export class TelegramError extends Error {
  code: TelegramErrorCode;
  constructor(code: TelegramErrorCode, message: string) {
    super(message);
    this.name = 'TelegramError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Configuration du lecteur
 * ------------------------------------------------------------------ */

/**
 * Lecteur par défaut. Surchargeable au build (`VITE_TELEGRAM_READER`) ou au
 * runtime (`localStorage['telegram_reader_base']`) pour qui héberge son propre
 * proxy CORS — même logique que `VITE_GODSEYE_URL`.
 *
 * Le lecteur doit accepter l'en-tête `X-Return-Format: html` et refléter
 * l'origine de l'appelant.
 */
export const DEFAULT_TELEGRAM_READER = 'https://r.jina.ai/';

export function getReaderBase(): string {
  try {
    const override = localStorage.getItem('telegram_reader_base');
    if (override && override.trim()) return override.trim();
  } catch {
    /* localStorage indisponible (mode privé strict) : on garde le défaut. */
  }
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return env?.VITE_TELEGRAM_READER?.trim() || DEFAULT_TELEGRAM_READER;
}

/* ------------------------------------------------------------------ *
 * Normalisation des saisies
 * ------------------------------------------------------------------ */

const HANDLE_RE = /^[A-Za-z0-9_]{3,64}$/;

/**
 * Extrait une cible d'une saisie libre. Accepte, entre autres :
 * `@durov`, `durov`, `t.me/durov`, `https://t.me/s/durov`,
 * `https://t.me/durov/123` (lien de post), `tg://resolve?domain=durov`,
 * `https://t.me/+AbCdEf` (invitation).
 *
 * Renvoie `null` si la chaîne n'a rien d'un identifiant Telegram — on préfère
 * le silence à une requête vouée à l'échec.
 */
export function parseTarget(raw: string): TelegramTarget | null {
  let value = (raw ?? '').trim();
  if (!value) return null;

  // `tg://resolve?domain=x` et `tg://join?invite=y`
  const tgScheme = /^tg:\/\/resolve\?domain=([A-Za-z0-9_]+)/i.exec(value);
  if (tgScheme) {
    const handle = tgScheme[1].toLowerCase();
    return { kind: 'handle', handle, url: `https://t.me/${handle}` };
  }
  const tgInvite = /^tg:\/\/join\?invite=([A-Za-z0-9_-]+)/i.exec(value);
  if (tgInvite) {
    return {
      kind: 'invite',
      handle: '',
      invite: tgInvite[1],
      url: `https://t.me/+${tgInvite[1]}`,
    };
  }

  // Débarrasse des schémas et des hôtes connus.
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, '');
  value = value.replace(/^s\//i, ''); // `t.me/s/<canal>` → prévisualisation
  value = value.replace(/^@/, '');
  value = value.replace(/\/+$/, '');

  // Invitation : `+jeton` ou `joinchat/jeton`.
  const invite = /^(?:\+|joinchat\/)([A-Za-z0-9_-]{8,})$/i.exec(value);
  if (invite) {
    return {
      kind: 'invite',
      handle: '',
      invite: invite[1],
      url: `https://t.me/+${invite[1]}`,
    };
  }

  // Lien de post `canal/123` → on ne garde que le canal.
  const postLink = /^([A-Za-z0-9_]+)\/\d+$/.exec(value);
  if (postLink) value = postLink[1];

  // Paramètres éventuels (`?q=…`, `#…`).
  value = value.split(/[?#]/)[0];

  if (!HANDLE_RE.test(value)) return null;

  const handle = value.toLowerCase();
  return { kind: 'handle', handle, url: `https://t.me/${handle}` };
}

/** Découpe une saisie multi-lignes en cibles uniques, dans l'ordre. */
export function parseTargets(input: string): TelegramTarget[] {
  const seen = new Set<string>();
  const out: TelegramTarget[] = [];
  for (const chunk of (input ?? '').split(/[\s,;]+/)) {
    const target = parseTarget(chunk);
    if (!target) continue;
    const key = `${target.kind}:${target.handle || target.invite}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Limitation de débit — file sérialisée
 * ------------------------------------------------------------------ */

/** Espacement minimal entre deux requêtes vers le lecteur. */
export const MIN_INTERVAL_MS = 1200;

let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Exécute `fn` après toutes les requêtes déjà programmées, en respectant
 * l'espacement minimal. La file est **globale au module** : deux composants
 * qui interrogent Telegram en même temps ne peuvent pas se doubler.
 */
function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  // La chaîne ne doit jamais rester rejetée, sinon tout ce qui suit meurt.
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/* ------------------------------------------------------------------ *
 * Requête vers le lecteur
 * ------------------------------------------------------------------ */

async function readHtml(targetUrl: string, signal?: AbortSignal): Promise<string> {
  const endpoint = `${getReaderBase()}${targetUrl}`;

  const attempt = async (): Promise<Response> =>
    fetch(endpoint, {
      method: 'GET',
      signal,
      headers: {
        Accept: 'text/html',
        // Le lecteur rend le HTML d'origine au lieu d'un Markdown aplati.
        'X-Return-Format': 'html',
      },
    });

  let response: Response;
  try {
    response = await attempt();
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    // Un `TypeError: Failed to fetch` côté navigateur recouvre deux causes très
    // différentes : pas de réseau, ou réponse rejetée faute de CORS. On ne peut
    // pas les distinguer ici, donc on donne la piste la plus probable.
    throw new TelegramError(
      'blocked',
      'Lecture impossible : la requête a été bloquée ou le réseau est coupé. ' +
        'Vérifie ta connexion, un éventuel bloqueur, puis réessaie.'
    );
  }

  if (response.status === 429) {
    // Le lecteur public limite le débit. On retente une fois, plus tard.
    await sleep(3000);
    try {
      response = await attempt();
    } catch {
      throw new TelegramError('network', 'Le lecteur public ne répond plus.');
    }
    if (response.status === 429) {
      throw new TelegramError(
        'rate-limit',
        'Le lecteur public limite le débit. Patiente une minute avant de relancer.'
      );
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new TelegramError(
      'blocked',
      `Le lecteur a refusé la requête (HTTP ${response.status}). ` +
        'Un quota a peut-être été atteint ; réessaie plus tard.'
    );
  }

  if (!response.ok) {
    throw new TelegramError('network', `Le lecteur a répondu HTTP ${response.status}.`);
  }

  return response.text();
}

/* ------------------------------------------------------------------ *
 * Parsing du HTML
 * ------------------------------------------------------------------ */

function parseDocument(html: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new TelegramError('network', 'Parseur HTML indisponible dans cet environnement.');
  }
  return new DOMParser().parseFromString(html, 'text/html');
}

const clean = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

/** « 10 276 913 subscribers », « 1.2M members » → nombre. */
export function parseCount(label: string): number | null {
  const compact = /([\d.,]+)\s*([KMB])\b/i.exec(label);
  if (compact) {
    const base = parseFloat(compact[1].replace(',', '.'));
    const factor = { k: 1e3, m: 1e6, b: 1e9 }[compact[2].toLowerCase() as 'k' | 'm' | 'b'];
    return Number.isFinite(base) ? Math.round(base * factor) : null;
  }
  const digits = label.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** Déduit la nature de l'entité depuis le libellé du compteur. */
function kindFromCounter(label: string): TelegramEntityKind {
  if (/subscribers/i.test(label)) return 'channel';
  if (/members/i.test(label)) return 'group';
  if (/monthly users/i.test(label)) return 'bot';
  return 'user';
}

/**
 * Retire la prose d'invitation que Telegram ajoute aux pages sans description.
 * Sans ce filtre, un handle inexistant produisait une « bio » de la forme
 * « If you have Telegram, you can contact @x right away. » — l'analyste y
 * aurait vu une information alors que c'est du remplissage.
 */
function stripBoilerplate(text: string): string {
  return text
    .replace(/If you have \**Telegram\**,? you can (?:view and join|contact)[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Transforme le HTML d'une page `t.me/<handle>` en fiche structurée.
 *
 * Telegram distingue les natures d'entité par le libellé de la ligne
 * « compteur » — c'est le seul marqueur fiable et stable :
 *   `N subscribers` → canal · `N members` → groupe · `N monthly users` → bot
 *   aucune ligne    → compte utilisateur (ou handle inexistant, indissociables)
 */
export function parseProfileHtml(html: string, handle: string): TelegramProfile {
  const doc = parseDocument(html);
  const fetchedAt = new Date().toISOString();

  const titleEl = doc.querySelector('.tgme_page_title');
  const verified = !!titleEl?.querySelector('.verified-icon');
  // Le badge « ✔ » est un `<i class="verified-icon">` **à l'intérieur** du
  // titre : sans le retirer, le titre devient « Pavel Durov ✔ ».
  let rawTitle = '';
  if (titleEl) {
    const clone = titleEl.cloneNode(true) as Element;
    clone.querySelectorAll('.verified-icon').forEach((node) => node.remove());
    rawTitle = clean(clone.textContent);
  }

  // Telegram émet **deux** `.tgme_page_extra` sur certains comptes : le premier
  // porte le handle (« @botfather »), le second le compteur. Et sur d'autres
  // pages le premier est vide. On ne retient donc pas « le premier non vide »
  // mais **la ligne qui est réellement un compteur** — sinon BotFather était
  // classé « utilisateur » et son nombre d'utilisateurs perdu.
  const subscribersLabel =
    Array.from(doc.querySelectorAll('.tgme_page_extra'))
      .map((el) => clean(el.textContent))
      .find((text) => /(subscribers|members|monthly users)/i.test(text)) ?? '';
  const subscribers = subscribersLabel ? parseCount(subscribersLabel) : null;

  const bio = stripBoilerplate(clean(doc.querySelector('.tgme_page_description')?.textContent));

  const photoUrl =
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ??
    doc.querySelector('.tgme_page_photo_image img')?.getAttribute('src') ??
    null;

  // Invitation privée : la page ne dit que « Join group chat on Telegram ».
  const isInvitePage =
    /Join (group|channel) chat/i.test(rawTitle) || !!doc.querySelector('a[href^="tg://join"]');

  if (isInvitePage) {
    return {
      kind: 'invite',
      handle: '',
      title: handle ? `@${handle}` : 'Invitation privée',
      bio: '',
      photoUrl: null,
      subscribers: null,
      subscribersLabel: '',
      verified: false,
      url: `https://t.me/${handle || ''}`,
      noPublicData: true,
      fetchedAt,
    };
  }

  const kind = kindFromCounter(subscribersLabel);

  // Quand Telegram ne connaît pas le handle, il renvoie « Telegram: Contact @x ».
  // On préfère le handle nu : plus honnête qu'un faux titre.
  const unknownHandle = /^Telegram:\s*Contact\s*@/i.test(rawTitle);
  const title = unknownHandle || !rawTitle ? `@${handle}` : rawTitle;

  // Un compte sans aucune métadonnée publique est indissociable d'un handle
  // inexistant : Telegram sert exactement la même page. On le signale au lieu
  // d'affirmer une existence qu'on ne peut pas prouver.
  const noPublicData = !subscribersLabel && !bio && !verified;

  return {
    kind,
    handle,
    title,
    bio,
    photoUrl,
    subscribers,
    subscribersLabel,
    verified,
    url: `https://t.me/${handle}`,
    noPublicData,
    fetchedAt,
  };
}

/**
 * Telegram colle une barre de pagination (« 1 • 2 • 3 • More ») **à la fin du
 * dernier bloc de texte** de la page de résultats. Elle n'appartient pas au
 * message : sans ce nettoyage, chaque message finissait par
 * « …October Features1 • 2 • 3 • 4 • 5 • 6 • 7 • 8 • 9 • More ».
 *
 * On ne retire la barre que si elle est bien terminale : après le « More » il ne
 * doit rester que des espaces, des `<br>` ou le `<span>` masqué que Telegram
 * ajoute pour réserver la place. Un message qui contiendrait un lien « More »
 * au milieu n'est donc pas amputé.
 */
function stripPagination(root: Element) {
  const more = Array.from(root.querySelectorAll('a, b')).find(
    (el) => clean(el.textContent).toLowerCase() === 'more'
  );
  if (!more) return;

  for (let after = more.nextSibling; after; after = after.nextSibling) {
    if (after.nodeType === 3) {
      if (!/^[\s\u00a0•]*$/.test(after.textContent ?? '')) return;
      continue;
    }
    if (after.nodeType !== 1) continue;
    const el = after as Element;
    const hidden = /visibility:\s*hidden/i.test(el.getAttribute('style') ?? '');
    if (!hidden && el.nodeName !== 'BR') return;
  }

  const run: Node[] = [more];
  for (let prev = more.previousSibling; prev; prev = prev.previousSibling) {
    const gap = prev.nodeType === 3 && /^[\s\u00a0•]*$/.test(prev.textContent ?? '');
    // La page courante est un `<b>`, les autres des `<a>` : les deux comptent.
    const num =
      prev.nodeType === 1 &&
      (prev.nodeName === 'A' || prev.nodeName === 'B') &&
      /^\d{1,3}$/.test(clean(prev.textContent));
    const brk = prev.nodeType === 1 && prev.nodeName === 'BR';
    if (!gap && !num && !brk) break;
    run.push(prev);
  }
  run.forEach((node) => node.parentNode?.removeChild(node));
}

/** Texte lisible d'un bloc : pagination retirée, `<br>` rendus comme des espaces. */
function blockText(element: Element | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  stripPagination(clone);
  const doc = clone.ownerDocument;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith(doc.createTextNode(' ')));
  return clean(clone.textContent);
}

/**
 * Extrait les messages publics d'une page `t.me/s/<canal>` (éventuellement
 * filtrée par `?q=mot-clé`).
 *
 * Le HTML de Telegram donne chaque message dans un `.tgme_widget_message`
 * porteur de `data-post="<canal>/<id>"` — bien plus sûr que de découper du
 * texte, où les liens de pagination « 1 2 3 » ressemblent aux permaliens.
 */
export function parsePostsHtml(html: string, handle: string, limit = 24): TelegramPost[] {
  const doc = parseDocument(html);
  const nodes = Array.from(doc.querySelectorAll('.tgme_widget_message'));
  const posts: TelegramPost[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (posts.length >= limit) break;

    const dataPost = node.getAttribute('data-post') ?? '';
    const id = dataPost.includes('/') ? dataPost.split('/').pop() ?? '' : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const text = blockText(node.querySelector('.tgme_widget_message_text'));
    if (!text) continue;

    const views = clean(node.querySelector('.tgme_widget_message_views')?.textContent) || null;
    const datetime = node.querySelector('.tgme_widget_message_date time')?.getAttribute('datetime');

    posts.push({
      id,
      url: `https://t.me/${handle}/${id}`,
      text: text.length > 420 ? `${text.slice(0, 417)}…` : text,
      views,
      time: datetime ?? null,
    });
  }

  return posts;
}

/* ------------------------------------------------------------------ *
 * API de haut niveau
 * ------------------------------------------------------------------ */

/** Résout un handle ou un lien d'invitation en fiche publique. */
export async function fetchProfile(
  target: TelegramTarget,
  signal?: AbortSignal
): Promise<TelegramProfile> {
  if (target.kind === 'invite') {
    // Une invitation ne publie ni titre, ni bio, ni compteur : on le dit au
    // lieu de laisser croire à un échec de lecture.
    return {
      kind: 'invite',
      handle: '',
      title: `Invitation ${target.invite ?? ''}`.trim(),
      bio: '',
      photoUrl: null,
      subscribers: null,
      subscribersLabel: '',
      verified: false,
      url: target.url,
      noPublicData: true,
      fetchedAt: new Date().toISOString(),
    };
  }

  return rateLimited(async () => {
    const html = await readHtml(`https://t.me/${target.handle}`, signal);
    const profile = parseProfileHtml(html, target.handle);
    // Un lien d'invitation saisi comme handle garde son URL d'origine.
    return { ...profile, url: profile.url || target.url };
  });
}

/** Récupère les messages publics d'un canal, éventuellement filtrés. */
export async function fetchPosts(
  handle: string,
  keyword?: string,
  signal?: AbortSignal
): Promise<TelegramPost[]> {
  const normalized = handle.replace(/^@/, '').toLowerCase();
  if (!HANDLE_RE.test(normalized)) {
    throw new TelegramError('invalid', 'Handle de canal invalide.');
  }
  const query = keyword?.trim() ? `?q=${encodeURIComponent(keyword.trim())}` : '';
  return rateLimited(async () => {
    const html = await readHtml(`https://t.me/s/${normalized}${query}`, signal);
    const posts = parsePostsHtml(html, normalized);
    if (posts.length === 0) {
      throw new TelegramError(
        'empty',
        keyword?.trim()
          ? 'Aucun message public ne contient ce mot-clé dans ce canal.'
          : 'Ce canal ne publie pas de prévisualisation web (ou il est vide).'
      );
    }
    return posts;
  });
}

/**
 * Analyse une saisie multi-lignes. Renvoie les fiches obtenues **et** les
 * échecs, pour que l'interface puisse afficher les deux sans masquer l'un.
 */
export async function resolveMany(
  input: string,
  signal?: AbortSignal
): Promise<{
  results: TelegramProfile[];
  failures: { input: string; message: string; code: TelegramErrorCode }[];
}> {
  const targets = parseTargets(input);
  const results: TelegramProfile[] = [];
  const failures: { input: string; message: string; code: TelegramErrorCode }[] = [];

  for (const target of targets) {
    if (signal?.aborted) break;
    try {
      results.push(await fetchProfile(target, signal));
    } catch (error) {
      if ((error as Error).name === 'AbortError') break;
      const err = error as TelegramError;
      failures.push({
        input: target.handle ? `@${target.handle}` : target.url,
        message: err.message || 'Échec de lecture.',
        code: err.code || 'network',
      });
    }
  }

  return { results, failures };
}

/** Traduit une nature d'entité en type d'entité du graphe. */
export function entityTypeFor(
  kind: TelegramEntityKind
): 'telegram_channel' | 'telegram_group' | 'telegram_user' {
  if (kind === 'channel') return 'telegram_channel';
  if (kind === 'group' || kind === 'invite') return 'telegram_group';
  return 'telegram_user';
}
