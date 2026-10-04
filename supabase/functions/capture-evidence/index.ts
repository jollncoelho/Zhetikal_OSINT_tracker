const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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
  if (host === '0.0.0.0' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return false;
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  return true;
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
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

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(/<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["']/gi)) {
    const key = match[1].toLowerCase();
    if (!meta[key]) meta[key] = match[2].trim();
  }
  return meta;
}

async function fetchTarget(targetUrl: string): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = targetUrl;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    if (!isSafeUrl(currentUrl)) throw new Error('Target URL is not allowed');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Ghostint Evidence Collector/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
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
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Capture timed out after 30 seconds');
      }
      if (error instanceof TypeError) {
        throw new Error('Network error: unable to reach the target (DNS failure, SSL error, or connection refused)');
      }
      throw error;
    }
  }
  throw new Error('Too many redirects');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const body = await request.json();
    const targetUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!targetUrl || !isSafeUrl(targetUrl)) {
      return new Response(JSON.stringify({ error: 'Enter a valid public HTTP or HTTPS URL.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { response, finalUrl } = await fetchTarget(targetUrl);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 15_000_000) throw new Error('Response is too large (over 15 MB)');
    const html = await response.text();
    if (html.length > 15_000_000) throw new Error('Response is too large (over 15 MB)');

    const contentType = response.headers.get('content-type') || '';
    const payload = {
      html,
      finalUrl,
      title: extractTitle(html),
      status: response.status,
      contentType,
      links: extractLinks(html, finalUrl),
      meta: extractMetaTags(html),
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The target could not be captured.';
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
