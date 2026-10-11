import type { Connect, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Proxy même-origine vers un routeur LLM local (FreeLLMAPI, LM Studio, etc.).
 *
 * **Pourquoi c'est nécessaire.** Le routeur FreeLLMAPI est conçu pour des clients
 * *natifs* (Cursor, Cline, Claude Code) qui n'appliquent pas la politique
 * d'origine. Il n'émet donc **aucun en-tête CORS** — vérifié : `GET /v1/models`
 * renvoie `401` sans `Access-Control-Allow-Origin`, et le `OPTIONS` de
 * préflight ne renvoie aucun `Access-Control-Allow-*`. Un navigateur bloque
 * alors la requête, et `fetch()` rejette avec une erreur réseau générique que
 * l'application traduisait en « FreeLLMAPI est injoignable » — alors que le
 * routeur répond parfaitement.
 *
 * **Solution.** Le navigateur appelle `/api/llm` **sur sa propre origine**
 * (donc aucune requête cross-origin, aucun CORS à négocier), et ce middleware
 * relaie vers l'adresse réelle indiquée par l'en-tête `x-llm-target`. C'est le
 * même schéma que le moteur de capture locale (`/api/capture`).
 *
 * Fonctionne dans `vite dev` **et** dans `vite preview`.
 */

/** Endpoint exposé au navigateur. */
export const LLM_PROXY_PATH = '/api/llm';

/** En-tête portant l'URL réelle à joindre, inaccessible depuis le navigateur. */
export const LLM_TARGET_HEADER = 'x-llm-target';

/** Marqueur prouvant que la réponse vient de ce proxy et non du repli SPA. */
export const LLM_PROXY_MARKER = 'x-llm-proxy';

/**
 * Seules les adresses de bouclage sont acceptées. Le serveur de dev est lancé
 * avec `--host` (donc exposé sur le réseau local) : sans cette restriction, ce
 * middleware deviendrait un proxy ouvert utilisable pour du SSRF.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

/** Les réponses d'un LLM peuvent être longues à venir. */
const UPSTREAM_TIMEOUT_MS = 180_000;

/** En-têtes relayés vers le routeur. On ne transmet pas le reste aveuglément. */
const FORWARDED_REQUEST_HEADERS = ['authorization', 'content-type', 'accept'];

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(LLM_PROXY_MARKER, '1');
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}

const llmProxyMiddleware: Connect.NextHandleFunction = (req, res, _next) => {
  // Sonde de disponibilité : permet au client de savoir si le proxy est là.
  if (req.method === 'GET' && !req.headers[LLM_TARGET_HEADER]) {
    sendJson(res, 200, { ok: true, engine: 'zhetikal-llm-proxy', version: 1 });
    return;
  }

  const rawTarget = req.headers[LLM_TARGET_HEADER];
  const target = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
  if (!target) {
    sendJson(res, 400, { error: `Missing "${LLM_TARGET_HEADER}" header` });
    return;
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    sendJson(res, 400, { error: `Invalid target URL: ${target}` });
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    sendJson(res, 400, { error: 'Only http(s) targets can be proxied' });
    return;
  }
  if (!isLoopback(url)) {
    sendJson(res, 403, {
      error:
        `Refusé : « ${url.hostname} » n'est pas une adresse locale. ` +
        `Ce proxy n'accepte que 127.0.0.1, localhost et ::1.`,
    });
    return;
  }

  void (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const method = req.method ?? 'GET';
      const headers: Record<string, string> = {};
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name];
        if (typeof value === 'string') headers[name] = value;
        else if (Array.isArray(value)) headers[name] = value.join(', ');
      }

      const hasBody = method !== 'GET' && method !== 'HEAD';
      const body = hasBody ? await readBody(req) : undefined;

      const upstream = await fetch(url.toString(), {
        method,
        headers,
        body: body && body.length > 0 ? body : undefined,
        signal: controller.signal,
      });

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = upstream.status;
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') ?? 'application/json; charset=utf-8'
      );
      res.setHeader(LLM_PROXY_MARKER, '1');
      res.end(buffer);
    } catch (cause) {
      const error = cause as { name?: string; message?: string; cause?: { code?: string } };
      const code = error?.cause?.code ?? '';
      const aborted = error?.name === 'AbortError';
      sendJson(res, aborted ? 504 : 502, {
        error: aborted
          ? `Le routeur n'a pas répondu en ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} s (${url.toString()}).`
          : `Impossible de joindre le routeur (${url.toString()}) : ${error?.message ?? 'erreur inconnue'}${code ? ` (${code})` : ''}`,
        code: aborted ? 'TIMEOUT' : code || 'NETWORK',
      });
    } finally {
      clearTimeout(timer);
    }
  })();
};

/**
 * Vite plugin exposant le proxy LLM même-origine.
 * Actif dans `vite dev` et dans `vite preview` (application construite).
 */
export function llmProxyPlugin(): Plugin {
  return {
    name: 'zhetikal-llm-proxy',
    configureServer(server) {
      server.middlewares.use(LLM_PROXY_PATH, llmProxyMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(LLM_PROXY_PATH, llmProxyMiddleware);
    },
  };
}
