/**
 * Une adresse est-elle un nœud de sortie Tor ?
 *
 * Pourquoi c'est un contrôle et pas un lien : ouvrir une page de recherche
 * n'apprend rien de défendable, et surtout ne laisse aucune trace dans le
 * dossier. Ici on télécharge **la liste publique** une fois, on compare en
 * local, et le constat est écrit sur l'entité avec sa date. C'est ce constat,
 * et non l'intuition, qui peut ensuite soutenir une phrase du rapport.
 *
 * Deux choix de conception :
 *
 * 1. **Aucune adresse du dossier ne sort.** On interroge onionoo pour la liste
 *    entière (une requête, la même pour tout le monde) puis on compare dans le
 *    navigateur. Un service de « check IP » aurait appris à un tiers quelle
 *    adresse vous intéresse — exactement ce qu'un enquêteur ne veut pas.
 * 2. **La liste est datée et mise en cache 24 h.** Les sorties Tor changent
 *    tous les jours : un constat sans date ne veut rien dire, et une liste
 *    périmée produirait des « non » qui n'en sont pas.
 *
 * `Access-Control-Allow-Origin: *` est bien renvoyé par onionoo (vérifié), ce
 * qui rend l'appel possible depuis une page statique, sans backend.
 */

const ONIONOO_URL =
  'https://onionoo.torproject.org/details?type=relay&flag=Exit&fields=exit_addresses';

const CACHE_KEY = 'ghostint-tor-exits';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface TorExitList {
  /** Adresses de sortie, en minuscules. */
  addresses: Set<string>;
  /** Date de publication annoncée par onionoo (ISO), pas celle du téléchargement. */
  published: string;
  /** Horodatage du téléchargement, pour décider du rafraîchissement. */
  fetchedAt: number;
}

export class TorListUnavailable extends Error {}

function parseOnionoo(raw: unknown): TorExitList {
  const data = raw as { relays?: { exit_addresses?: unknown }[]; relays_published?: unknown };
  const addresses = new Set<string>();
  for (const relay of data.relays ?? []) {
    const list = Array.isArray(relay?.exit_addresses) ? relay.exit_addresses : [];
    for (const value of list) {
      const address = String(value ?? '').trim().toLowerCase();
      if (address) addresses.add(address);
    }
  }
  if (addresses.size === 0) {
    // Une réponse vide n'est pas « aucune sortie Tor » : c'est une réponse
    // qu'on n'a pas comprise. La confondre avec un résultat négatif ferait
    // dire « pas Tor » à toutes les adresses du dossier.
    throw new TorListUnavailable('onionoo a répondu sans aucune adresse de sortie');
  }
  return {
    addresses,
    published: String(data.relays_published ?? '').trim() || new Date().toISOString(),
    fetchedAt: Date.now(),
  };
}

function readCache(): TorExitList | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { addresses?: unknown; published?: unknown; fetchedAt?: unknown };
    const addresses = new Set(
      (Array.isArray(parsed.addresses) ? parsed.addresses : []).map((value) => String(value).toLowerCase())
    );
    if (addresses.size === 0) return null;
    return {
      addresses,
      published: String(parsed.published ?? ''),
      fetchedAt: Number(parsed.fetchedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function writeCache(list: TorExitList): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        addresses: Array.from(list.addresses),
        published: list.published,
        fetchedAt: list.fetchedAt,
      })
    );
  } catch {
    // Quota plein : on continue avec la liste en mémoire, le constat reste juste.
  }
}

/** Version en cache sans réseau, pour afficher un état avant tout clic. */
export function peekTorExits(): TorExitList | null {
  return readCache();
}

/**
 * La liste des sorties, depuis le cache si elle a moins de 24 h.
 * `force` refait l'appel — utile quand l'analyste veut la liste du jour.
 */
export async function loadTorExits(force = false): Promise<TorExitList> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) return cached;

  let response: Response;
  try {
    response = await fetch(ONIONOO_URL, { headers: { Accept: 'application/json' } });
  } catch {
    // Hors ligne, ou CORS refusé : on préfère une liste ancienne à aucun
    // résultat, à condition de dire de quand elle date.
    if (cached) return cached;
    throw new TorListUnavailable('liste des sorties Tor injoignable');
  }

  if (!response.ok) {
    if (cached) return cached;
    throw new TorListUnavailable(`onionoo a répondu HTTP ${response.status}`);
  }

  const list = parseOnionoo(await response.json());
  writeCache(list);
  return list;
}

export type TorVerdict = 'exit' | 'not-listed';

export interface TorCheck {
  verdict: TorVerdict;
  /** Date de publication de la liste employée — le constat vaut pour ce jour. */
  published: string;
  checkedAt: string;
}

/** Le contrôle lui-même : une comparaison, sans aucun appel réseau supplémentaire. */
export async function checkTorExit(address: string, force = false): Promise<TorCheck> {
  const list = await loadTorExits(force);
  const key = String(address ?? '').trim().toLowerCase();
  return {
    verdict: list.addresses.has(key) ? 'exit' : 'not-listed',
    published: list.published,
    checkedAt: new Date().toISOString(),
  };
}

/** Champ d'entité où l'on conserve le constat, pour qu'il survive au rechargement. */
export const TOR_FIELD = 'torExit';
export const TOR_CHECKED_FIELD = 'torCheckedAt';
export const TOR_PUBLISHED_FIELD = 'torListPublished';
