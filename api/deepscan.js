/* ------------------------------------------------------------------ *
 * Balayage profond « côté serveur » — fonction Vercel.
 *
 * Elle tourne sur l'infrastructure Vercel et non dans le navigateur :
 *  - aucun problème CORS, aucune clé API, aucune installation ;
 *  - tous les visiteurs ont la même puissance, y compris sur mobile ;
 *  - les URL sont construites depuis une liste blanche : le pseudo ne
 *    peut jamais devenir une URL arbitraire (pas de SSRF).
 * ------------------------------------------------------------------ */
import { DEEP_SCAN_SITES } from './deepscan-sites.js';

export const config = { maxDuration: 240 };

const USER_AGENT =
  'Mozilla/5.0 (compatible; GhostintOSINT/1.0; +https://tracker.query-intel.com)';
const PER_SITE_TIMEOUT_MS = 6000;
const CONCURRENCY = 32;

// Ces sites rendent une page avec le pseudo demandé même quand le profil
// n'existe pas (SPA côté client). Les garder créerait des comptes fantômes.
const UNRELIABLE_SITES = new Set(['codolio']);

function normalizeUsername(raw) {
  let value = String(raw ?? '').trim();
  value = value.replace(/^@/, '').split(/[/?#\s]/)[0];
  value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  value = value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);
  return value;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(html, tag) {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html);
  return match ? decodeEntities(match[1].replace(/<[^>]*>/g, ' ')) : '';
}

async function checkSite(site, username, token) {
  if (UNRELIABLE_SITES.has(site.id)) return { state: 'unknown' };
  const url = site.url.replace('{}', encodeURIComponent(username));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_SITE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    });
    const status = response.status;
    if (status === 404 || status === 410) return { state: 'absent' };
    if (status < 200 || status >= 400) return { state: 'unknown', status };

    const html = (await response.text()).slice(0, 250000);
    const title = firstTag(html, 'title').slice(0, 200);
    const heading = firstTag(html, 'h1').slice(0, 200);

    // Les sites « message » de Sherlock signalent l'absence par un texte
    // explicite, parfois avec un code 200.
    const messages = Array.isArray(site.errorMsg) ? site.errorMsg : site.errorMsg ? [site.errorMsg] : [];
    if (messages.some((message) => html.toLowerCase().includes(String(message).toLowerCase()))) {
      return { state: 'absent' };
    }
    // Les sites « response_url » renvoient vers l'accueil quand le profil n'existe pas.
    if (site.errorType === 'response_url' && response.url) {
      const finalPath = new URL(response.url).pathname.toLowerCase();
      if (!finalPath.includes(username.toLowerCase())) return { state: 'absent' };
    }
    if (
      /page not found|404 not found|user not found|profile not found|doesn.t exist|not found/i.test(title)
    ) {
      return { state: 'absent' };
    }

    // Preuve positive : le pseudo apparaît dans le <title> ou le <h1>.
    // Ne pas fouiller tout le HTML évite de compter un simple mentions
    // « bienvenue, connectez-vous » comme un profil existant.
    if (token.test(title) || token.test(heading)) {
      return {
        state: 'found',
        title: title || heading,
        url: response.url || url,
      };
    }
    return { state: 'unknown', status, title };
  } catch {
    return { state: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const raw = req.method === 'POST'
    ? (typeof req.body === 'object' && req.body ? req.body.username : undefined)
    : req.query?.u;
  const username = normalizeUsername(raw);
  if (!username) return res.status(400).json({ ok: false, error: 'invalid_username' });

  const started = Date.now();
  const token = new RegExp(`(^|[^a-z0-9])@?${escapeRegex(username.toLowerCase())}([^a-z0-9]|$)`, 'i');
  const results = await mapLimit(DEEP_SCAN_SITES, CONCURRENCY, (site) =>
    checkSite(site, username, token)
  );

  const found = [];
  const counts = { absent: 0, unknown: 0, error: 0 };
  results.forEach((result, index) => {
    if (result.state === 'found') {
      found.push({
        id: DEEP_SCAN_SITES[index].id,
        label: DEEP_SCAN_SITES[index].label,
        url: result.url,
        title: result.title,
      });
    } else {
      counts[result.state] = (counts[result.state] ?? 0) + 1;
    }
  });
  found.sort((a, b) => a.label.localeCompare(b.label));

  return res.status(200).json({
    ok: true,
    username,
    scanned: DEEP_SCAN_SITES.length,
    durationMs: Date.now() - started,
    found,
    ...counts,
  });
}
