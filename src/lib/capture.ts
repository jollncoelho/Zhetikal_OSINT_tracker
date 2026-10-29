import type { EvidenceArtifact, MetadataResponse } from '../types/investigation';

/** Local capture engine exposed by `vite-plugin-local-capture.ts`. */
export const LOCAL_CAPTURE_URL = '/api/capture';

export const LOCAL_CASES_KEY = 'zhetikal-investigation-cases-v1';
export const LOCAL_ARTIFACTS_KEY = 'zhetikal-investigation-artifacts-v1';

const SUPABASE_CAPTURE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-metadata`
  : '';

export const protectedHosts = ['youtube.com', 'facebook.com', 'twitter.com', 'x.com', 'google.com', 'linkedin.com', 'instagram.com'];

export function readLocalList<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (cause) {
    console.error(cause);
    return [];
  }
}

export function writeLocalList<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (cause) {
    console.error(cause);
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsText(file, 'utf-8');
  });
}

export function safeImageSource(value: string): string {
  return value.startsWith('data:image/') ? value : '';
}

export async function sha512(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isProtectedTarget(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return protectedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function artifactImages(artifact: EvidenceArtifact): string[] {
  const images = artifact.screenshot_previews?.filter(Boolean) ?? [];
  return images.length > 0 ? images : artifact.screenshot_preview ? [artifact.screenshot_preview] : [];
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

export function sanitizePreviewHtml(html: string, baseUrl = ''): string {
  if (typeof DOMParser === 'undefined') return html;
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, iframe, object, embed, form, link[rel="preload"]').forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
    }
  });
  if (baseUrl) {
    document.querySelectorAll('base').forEach((element) => element.remove());
    const base = document.createElement('base');
    base.href = baseUrl;
    document.head.prepend(base);
  }
  return document.documentElement.outerHTML;
}

export function isHtmlContent(html: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('xml') && !ct.includes('html')) return false;
  if (ct.includes('json')) return false;
  if (ct.includes('text/plain')) return false;
  if (ct.startsWith('image/')) return false;
  const trimmed = html.trimStart();
  if (trimmed.startsWith('<?xml')) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  return /<html[\s>]/i.test(trimmed) || /<(body|div|p|span|table|head)[\s>]/i.test(trimmed);
}

export function formatRawContent(content: string, contentType: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (contentType.toLowerCase().includes('json')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return content;
    }
  }
  return content;
}

export function emptyMetadata(url: string): MetadataResponse {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep raw */
  }
  return {
    finalUrl: url,
    title: host,
    status: 0,
    contentType: '',
    html: '',
    meta: {},
    links: [],
    text: [],
    textContent: '',
    assets: [],
    screenshotDataUrl: '',
  };
}

function resolveAgainst(raw: string | null, baseUrl: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.startsWith('#') || /^(javascript|mailto|tel|data|blob):/i.test(value)) return null;
  try {
    const resolved = new URL(value, baseUrl || undefined).toString();
    return /^https?:/i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * Client-side equivalent of the local capture engine: parses an HTML document
 * that the user imported (saved page from their browser, or pasted source) and
 * returns the same shape as `requestPageCapture`. Used when a site refuses a
 * server-side fetch (bot protection, login wall, offline target).
 */
export function parseHtmlDocument(html: string, baseUrl = ''): MetadataResponse {
  if (typeof DOMParser === 'undefined') {
    return { ...emptyMetadata(baseUrl), html, contentType: 'text/html', text: [html.slice(0, 400)] };
  }
  const document = new DOMParser().parseFromString(html, 'text/html');

  const meta: Record<string, string> = {};
  document.querySelectorAll('meta').forEach((element) => {
    const key = (element.getAttribute('name') || element.getAttribute('property') || element.getAttribute('http-equiv') || element.getAttribute('itemprop') || '').trim().toLowerCase();
    const content = (element.getAttribute('content') || '').trim();
    if (key && content && meta[key] === undefined) meta[key] = content;
  });
  const canonical = resolveAgainst(document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null, baseUrl);
  if (canonical) meta.canonical = canonical;
  const lang = document.documentElement.getAttribute('lang');
  if (lang) meta.lang = lang;
  const charset = document.querySelector('meta[charset]')?.getAttribute('charset');
  if (charset) meta.charset = charset;

  const title =
    (document.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim() ||
    meta['og:title'] ||
    meta['twitter:title'] ||
    '';

  const links = new Set<string>();
  document.querySelectorAll('a[href]').forEach((element) => {
    const resolved = resolveAgainst(element.getAttribute('href'), baseUrl);
    if (resolved) links.add(resolved);
  });

  const assets = new Set<string>();
  document.querySelectorAll('img[src], source[src]').forEach((element) => {
    const resolved = resolveAgainst(element.getAttribute('src'), baseUrl);
    if (resolved) assets.add(resolved);
  });

  // Extract visible text lines by rendering the body off-screen so that
  // block-level boundaries produce real newlines.
  const text: string[] = [];
  if (document.body) {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, template, svg, canvas').forEach((node) => node.remove());
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1280px;';
    host.appendChild(clone);
    document.body.appendChild(host);
    const rawText = (clone.innerText || clone.textContent || '');
    document.body.removeChild(host);
    let previous = '';
    for (const rawLine of rawText.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line || line === previous) continue;
      previous = line;
      text.push(line);
      if (text.length >= 5000) break;
    }
  }

  let host = baseUrl;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    /* keep raw */
  }

  return {
    finalUrl: baseUrl || host,
    title: title || host,
    status: 0,
    contentType: 'text/html',
    html,
    meta,
    links: [...links],
    text,
    textContent: text.join('\n'),
    assets: [...assets],
    screenshotDataUrl: '',
    bytes: html.length,
    truncated: false,
    redirects: [],
    capturedAt: new Date().toISOString(),
  };
}

function coerceMetadata(candidate: unknown): MetadataResponse {
  const value = candidate as Partial<MetadataResponse> | null;
  if (!value || typeof value !== 'object') throw new Error('Invalid page capture response');
  if (typeof value.finalUrl !== 'string' || typeof value.title !== 'string') throw new Error('Invalid page capture response');
  const text = Array.isArray(value.text) ? value.text.filter((line): line is string => typeof line === 'string') : [];
  return {
    finalUrl: value.finalUrl,
    title: value.title,
    status: typeof value.status === 'number' ? value.status : 0,
    contentType: typeof value.contentType === 'string' ? value.contentType : '',
    html: typeof value.html === 'string' ? value.html : '',
    meta: value.meta && typeof value.meta === 'object' ? value.meta : {},
    links: Array.isArray(value.links) ? value.links.filter((link): link is string => typeof link === 'string') : [],
    screenshotDataUrl: typeof value.screenshotDataUrl === 'string' ? value.screenshotDataUrl : '',
    text,
    textContent: typeof value.textContent === 'string' ? value.textContent : text.join('\n'),
    assets: Array.isArray(value.assets) ? value.assets.filter((asset): asset is string => typeof asset === 'string') : [],
    bytes: typeof value.bytes === 'number' ? value.bytes : undefined,
    elapsedMs: typeof value.elapsedMs === 'number' ? value.elapsedMs : undefined,
    truncated: value.truncated === true,
    redirects: Array.isArray(value.redirects) ? value.redirects.filter((item): item is string => typeof item === 'string') : [],
    capturedAt: typeof value.capturedAt === 'string' ? value.capturedAt : undefined,
  };
}

export type CaptureErrorCode = 'BLOCKED' | 'DNS' | 'REFUSED' | 'TIMEOUT' | 'TLS' | 'NETWORK' | 'UNKNOWN';

/** Error raised by the capture engine, carrying a translatable reason code. */
export class CaptureError extends Error {
  code: CaptureErrorCode;
  status: number | null;
  constructor(message: string, code: CaptureErrorCode = 'UNKNOWN', status: number | null = null) {
    super(message);
    this.name = 'CaptureError';
    this.code = code;
    this.status = status;
  }
}

async function postCapture(endpoint: string, url: string, headers: Record<string, string> = {}): Promise<MetadataResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ url }),
    });
  } catch {
    // The local engine itself is unreachable (static hosting, server stopped).
    throw new CaptureError('Capture engine unreachable', 'NETWORK');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = `Capture failed (HTTP ${response.status})`;
    let code: CaptureErrorCode = 'UNKNOWN';
    let status: number | null = response.status;
    try {
      const parsed = JSON.parse(detail) as { error?: string; code?: CaptureErrorCode; status?: number | null };
      if (parsed?.error) message = parsed.error;
      if (parsed?.code) code = parsed.code;
      if (parsed?.status !== undefined) status = parsed.status;
    } catch {
      if (detail && !detail.trimStart().startsWith('<')) message = detail.slice(0, 300);
    }
    throw new CaptureError(message, code, status);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) throw new CaptureError('Capture endpoint did not return JSON', 'UNKNOWN');
  return coerceMetadata(await response.json());
}

/**
 * Capture a page through the local engine first; if the local engine is not
 * available (static hosting without the Vite plugin) and a Supabase project is
 * configured, fall back to the remote Edge Function.
 */
export async function requestPageCapture(targetUrl: string): Promise<MetadataResponse> {
  const failures: string[] = [];
  let lastError: CaptureError | null = null;
  try {
    return await postCapture(LOCAL_CAPTURE_URL, targetUrl);
  } catch (cause) {
    lastError = cause instanceof CaptureError ? cause : new CaptureError(String(cause));
    failures.push(lastError.message);
  }
  if (SUPABASE_CAPTURE_URL) {
    try {
      return await postCapture(SUPABASE_CAPTURE_URL, targetUrl, {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      });
    } catch (cause) {
      const remoteError = cause instanceof CaptureError ? cause : new CaptureError(String(cause));
      failures.push(remoteError.message);
      lastError = remoteError;
    }
  }
  throw new CaptureError(failures.join(' · '), lastError?.code ?? 'UNKNOWN', lastError?.status ?? null);
}

export interface CaptureDraft {
  targetUrl: string;
  notes: string;
  imageFile?: File | null;
}

/** Build a fully local evidence artifact from a capture + optional image. */
export async function buildArtifact(caseId: string, draft: CaptureDraft, metadata: MetadataResponse, source = 'local-capture-engine'): Promise<EvidenceArtifact> {
  const capturedAt = new Date().toISOString();
  const preview = draft.imageFile && draft.imageFile.size > 0 ? await readFileAsDataUrl(draft.imageFile) : safeImageSource(metadata.screenshotDataUrl);
  return {
    id: crypto.randomUUID(),
    case_id: caseId,
    artifact_type: preview ? ('screenshot' as const) : ('downloaded_page' as const),
    target_url: draft.targetUrl,
    final_url: metadata.finalUrl || draft.targetUrl,
    title: metadata.title || draft.targetUrl,
    http_status: metadata.status || null,
    content_type: metadata.contentType,
    raw_html: metadata.html,
    sha512: await sha512(`${draft.targetUrl}|${metadata.finalUrl}|${capturedAt}`),
    captured_at: capturedAt,
    browser_metadata: {
      source,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      textLines: metadata.text?.length ?? 0,
      bytes: metadata.bytes ?? metadata.html.length,
      redirects: (metadata.redirects ?? []).length,
      elapsedMs: metadata.elapsedMs ?? 0,
    },
    meta: metadata.meta,
    screenshot_preview: preview,
    screenshot_previews: preview ? [preview] : [],
    extracted_links: metadata.links,
    extracted_text: metadata.text ?? [],
    extracted_assets: metadata.assets ?? [],
    notes: draft.notes,
    created_at: capturedAt,
  };
}

/* La persistance des preuves a quitté ce fichier : elle vit dans
   `evidenceStore.ts`, qui écrit en IndexedDB. `localStorage` plafonne autour de
   5 Mo pour l'origine entière, et une seule capture d'écran en `data:` URL
   suffisait à faire échouer l'écriture suivante — silencieusement. */
