/**
 * Zhetikal OSINT Tracker — Local page-capture engine.
 *
 * Serves `POST /api/capture` from the Vite dev/preview server so the OSINT
 * tracker can archive a live web page WITHOUT any third-party service and
 * WITHOUT CORS restrictions. Everything (HTTP fetch, HTML parsing, metadata
 * extraction, text-line extraction, link harvesting) happens in the local
 * Node process running the app.
 *
 * Response shape matches `MetadataResponse` in src/types/investigation.ts.
 */
import type { Connect, Plugin } from 'vite';

const MAX_HTML_BYTES = 3_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_LINKS = 2000;
const MAX_TEXT_LINES = 5000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** HTTP statuses that mean "the server deliberately refused us". */
const BLOCKING_STATUSES = new Set([401, 403, 405, 406, 429, 451, 503]);

/** Machine-readable reason codes so the UI can localise the message. */
export type CaptureErrorCode =
  | 'BLOCKED' | 'DNS' | 'REFUSED' | 'TIMEOUT' | 'TLS' | 'NETWORK' | 'UNKNOWN';

function captureError(code: CaptureErrorCode, message: string, status?: number): Error {
  const error = new Error(message) as Error & { captureCode: CaptureErrorCode; captureStatus?: number };
  error.captureCode = code;
  if (status) error.captureStatus = status;
  return error;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
  ugrave: 'ù', ecirc: 'ê', ocirc: 'ô', icirc: 'î', acirc: 'â', uuml: 'ü',
  ouml: 'ö', auml: 'ä', euro: '€', pound: '£', deg: '°', middot: '·',
  bull: '•', times: '×', frac12: '½', sup2: '²', sup3: '³', ordf: 'ª',
  ordm: 'º', plusmn: '±', para: '¶', sect: '§', dagger: '†', permil: '‰',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[\t\f\v\u00a0\u2000-\u200d\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/** Remove the parts of a document that never contribute visible text. */
function stripNonVisible(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<canvas\b[\s\S]*?<\/canvas>/gi, ' ');
}

/** Turn a raw HTML document into an ordered list of visible text lines. */
export function extractTextLines(html: string): string[] {
  const cleaned = stripNonVisible(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|main|nav|aside|li|ul|ol|tr|td|th|h[1-6]|blockquote|pre|figcaption|dd|dt|table|form|label|button|option)>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n');
  const text = decodeEntities(cleaned.replace(/<[^>]+>/g, ' '));
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let previous = '';
  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;
    if (line === previous) continue;
    previous = line;
    out.push(line);
    if (out.length >= MAX_TEXT_LINES) break;
  }
  return out;
}

function extractTitle(html: string, meta: Record<string, string>): string {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = titleMatch ? decodeEntities(titleMatch[1]) : '';
  const cleaned = normalizeWhitespace(raw);
  if (cleaned) return cleaned;
  return meta['og:title'] || meta['twitter:title'] || '';
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Collect every <meta> declaration (name / property / http-equiv / itemprop). */
export function extractMetadata(html: string, baseUrl = ''): Record<string, string> {
  const meta: Record<string, string> = {};
  const regex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const attributes = parseAttributes(match[0]);
    const key = (attributes.name || attributes.property || attributes['http-equiv'] || attributes.itemprop || '').trim().toLowerCase();
    const content = (attributes.content || '').trim();
    if (!key || !content) continue;
    if (meta[key] === undefined) meta[key] = content;
  }
  const canonical = /<link\b[^>]*rel\s*=\s*["']?canonical["']?[^>]*>/i.exec(html);
  if (canonical) {
    const href = parseAttributes(canonical[0]).href;
    if (href) meta.canonical = resolveUrl(href, baseUrl) ?? href;
  }
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z0-9-]+)/i.exec(html);
  if (lang) meta.lang = lang[1];
  const charset = /<meta\b[^>]*charset\s*=\s*["']?([a-zA-Z0-9-]+)/i.exec(html);
  if (charset) meta.charset = charset[1];
  return meta;
}

function resolveUrl(raw: string, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const resolved = new URL(raw, baseUrl || undefined).toString();
    return /^https?:/i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/** Harvest every <a href> plus <img src> / <link rel=stylesheet> style asset refs. */
export function extractLinks(html: string, baseUrl: string): { links: string[]; assets: string[] } {
  const links = new Set<string>();
  const assets = new Set<string>();
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html))) {
    const raw = decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel|data|blob):/i.test(raw)) continue;
    const resolved = resolveUrl(raw, baseUrl);
    if (resolved) links.add(resolved);
    if (links.size >= MAX_LINKS) break;
  }
  const assetRegex = /<(?:img|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/gi;
  while ((match = assetRegex.exec(html))) {
    const raw = decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!raw || /^(data|blob):/i.test(raw)) continue;
    const resolved = resolveUrl(raw, baseUrl);
    if (resolved) assets.add(resolved);
    if (assets.size >= 500) break;
  }
  return { links: [...links], assets: [...assets] };
}

interface CaptureResult {
  finalUrl: string;
  title: string;
  status: number;
  contentType: string;
  html: string;
  meta: Record<string, string>;
  links: string[];
  text: string[];
  textContent: string;
  assets: string[];
  screenshotDataUrl: string;
  bytes: number;
  elapsedMs: number;
  capturedAt: string;
  truncated: boolean;
  redirects: string[];
}

async function capturePage(targetUrl: string): Promise<CaptureResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const redirects: string[] = [];
  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        DNT: '1',
        Connection: 'keep-alive',
      },
    });
    if (BLOCKING_STATUSES.has(response.status)) {
      throw captureError(
        'BLOCKED',
        `The site answered HTTP ${response.status} and refused the automated request ` +
          `(anti-bot protection or rate limiting). Open the page in your browser and import the saved HTML instead.`,
        response.status,
      );
    }
    if (response.url && response.url !== targetUrl) redirects.push(response.url);
    const contentType = response.headers.get('content-type') || '';
    const rawBuffer = Buffer.from(await response.arrayBuffer());
    const truncated = rawBuffer.byteLength > MAX_HTML_BYTES;
    const body = rawBuffer.subarray(0, MAX_HTML_BYTES).toString('utf8');
    const looksLikeHtml = /html|xml|text\/plain|javascript|json/i.test(contentType) || /<html[\s>]/i.test(body.slice(0, 4096));
    const meta = looksLikeHtml ? extractMetadata(body, response.url || targetUrl) : {};
    const title = looksLikeHtml ? extractTitle(body, meta) : '';
    const { links, assets } = looksLikeHtml ? extractLinks(body, response.url || targetUrl) : { links: [], assets: [] };
    const text = looksLikeHtml ? extractTextLines(body) : [];
    const screenshotTemplate = process.env.ZHETIKAL_SCREENSHOT_URL || '';
    const screenshotDataUrl = screenshotTemplate
      ? screenshotTemplate.replace('{url}', encodeURIComponent(response.url || targetUrl))
      : '';
    return {
      finalUrl: response.url || targetUrl,
      title: title || new URL(response.url || targetUrl).hostname,
      status: response.status,
      contentType,
      html: body,
      meta,
      links,
      text,
      textContent: text.join('\n'),
      assets,
      screenshotDataUrl,
      bytes: rawBuffer.byteLength,
      elapsedMs: Date.now() - startedAt,
      capturedAt: new Date().toISOString(),
      truncated,
      redirects,
    };
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const captureMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  if (req.method !== 'POST') {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, engine: 'zhetikal-local-capture', version: 1 });
      return;
    }
    next();
    return;
  }
  void (async () => {
    try {
      const raw = await readBody(req);
      let parsed: { url?: unknown } = {};
      try {
        parsed = JSON.parse(raw || '{}') as { url?: unknown };
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      const target = typeof parsed.url === 'string' ? parsed.url.trim() : '';
      if (!target) {
        sendJson(res, 400, { error: 'Missing "url"' });
        return;
      }
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        sendJson(res, 400, { error: 'Invalid URL' });
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        sendJson(res, 400, { error: 'Only http(s) URLs can be captured' });
        return;
      }
      const result = await capturePage(url.toString());
      sendJson(res, 200, result);
    } catch (cause) {
      const error = cause as { message?: string; captureCode?: CaptureErrorCode; captureStatus?: number; cause?: { code?: string; message?: string } };
      if (error.captureCode) {
        sendJson(res, 502, { error: error.message, code: error.captureCode, status: error.captureStatus ?? null });
        return;
      }
      const raw = error?.cause?.message || error?.message || 'Capture failed';
      const code = error?.cause?.code || '';
      let captureCode: CaptureErrorCode = 'UNKNOWN';
      if (raw.toLowerCase().includes('abort')) captureCode = 'TIMEOUT';
      else if (/ENOTFOUND|EAI_AGAIN/.test(code)) captureCode = 'DNS';
      else if (/ECONNREFUSED/.test(code)) captureCode = 'REFUSED';
      else if (/CERT|TLS|SSL/.test(code) || /certificate/i.test(raw)) captureCode = 'TLS';
      else if (/ECONNRESET|EPIPE|socket hang up|fetch failed/i.test(`${code} ${raw}`)) captureCode = 'NETWORK';
      sendJson(res, captureCode === 'TIMEOUT' ? 504 : 502, {
        error: `${raw}${code ? ` (${code})` : ''}`,
        code: captureCode,
      });
    }
  })();
};

/**
 * Vite plugin exposing the local capture engine.
 * Works in `vite dev` and in `vite preview` (built app).
 */
export function localCapturePlugin(): Plugin {
  return {
    name: 'zhetikal-local-capture',
    configureServer(server) {
      server.middlewares.use('/api/capture', captureMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/capture', captureMiddleware);
    },
  };
}
