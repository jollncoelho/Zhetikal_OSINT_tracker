const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MAX_HTML_BYTES = 5_000_000;
const MAX_SCREENSHOT_BYTES = 4_000_000;

function isSafeUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(host.replace(/:/g, ''))) return false;
  return true;
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(/<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["']/gi)) {
    const key = match[1].toLowerCase();
    if (!meta[key]) meta[key] = match[2].trim().slice(0, 1000);
  }
  return meta;
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 500) || '';
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (['http:', 'https:'].includes(url.protocol)) links.add(url.href);
    } catch {
      continue;
    }
  }
  return [...links].slice(0, 500);
}

async function fetchPage(targetUrl: string): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = targetUrl;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    if (!isSafeUrl(currentUrl)) throw new Error('Target URL is not allowed');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Ghostint Evidence Collector/1.0)', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      });
      clearTimeout(timeout);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { response, finalUrl: currentUrl };
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }
      return { response, finalUrl: currentUrl };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Metadata capture timed out');
      throw error;
    }
  }
  throw new Error('Too many redirects');
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  return `data:${contentType || 'image/png'};base64,${btoa(binary)}`;
}

async function fetchScreenshot(targetUrl: string): Promise<string> {
  const screenshotUrl = `https://image.thum.io/get/fullpage/${encodeURIComponent(targetUrl)}`;
  const response = await fetch(screenshotUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Screenshot service unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) throw new Error('Screenshot is unavailable');
  return bytesToDataUrl(bytes, response.headers.get('content-type') || 'image/png');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const body = await request.json();
    const targetUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!targetUrl || !isSafeUrl(targetUrl)) return new Response(JSON.stringify({ error: 'Enter a valid public HTTP or HTTPS URL.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { response, finalUrl } = await fetchPage(targetUrl);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_HTML_BYTES) throw new Error('Page metadata is too large');
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const contentType = response.headers.get('content-type') || '';
    let screenshotDataUrl = '';
    try {
      screenshotDataUrl = await fetchScreenshot(finalUrl);
    } catch (error) {
      console.warn('external screenshot fallback failed', error);
    }
    const payload = {
      finalUrl,
      title: extractTitle(html),
      status: response.status,
      contentType,
      html,
      meta: extractMetaTags(html),
      links: extractLinks(html, finalUrl),
      screenshotDataUrl,
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('metadata capture failed', error);
    return new Response(JSON.stringify({ error: 'The page could not be captured.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
