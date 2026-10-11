/**
 * Relais CORS pour FreeLLMAPI — solution de repli.
 *
 * **À lire d'abord.** La cause réelle du message « FreeLLMAPI est injoignable »
 * n'est pas une absence d'en-têtes CORS, mais la **liste blanche d'origines** du
 * routeur. FreeLLMAPI exécute bien un middleware `cors()`, mais il n'autorise par
 * défaut que les ports de développement :
 *
 *     http://localhost:5173   http://127.0.0.1:5173   http://[::1]:5173
 *
 * Pour toute autre origine, le middleware se contente d'**omettre**
 * `Access-Control-Allow-Origin` : le navigateur jette la réponse et `fetch()`
 * rejette avec une erreur réseau générique. C'est pour cela que tout fonctionnait
 * en `npm run dev` (port 5173 autorisé) et que rien ne passait depuis
 * `https://tracker.prohacking77.me`. Ollama, à l'inverse, envoie
 * `Access-Control-Allow-Origin: *` — d'où son bon fonctionnement depuis le site
 * public.
 *
 * **La vraie correction** est donc de déclarer l'origine, sur la machine de
 * l'utilisateur, puis de relancer le routeur :
 *
 *     setx DASHBOARD_ORIGINS "https://ton-domaine.tld"     (Windows)
 *     export DASHBOARD_ORIGINS="https://ton-domaine.tld"   (macOS / Linux)
 *
 * Aucune dépendance, aucun processus supplémentaire. Voir le README.
 *
 * **Ce relais** reste utile quand la variable d'environnement n'est pas
 * accessible (machine verrouillée, routeur administré par un tiers, conteneur
 * Docker dont on ne maîtrise pas l'`environment:`). Il se place devant FreeLLMAPI
 * et réécrit les en-têtes CORS.
 *
 * ```
 *   navigateur  ->  http://127.0.0.1:31416/v1  ->  relais  ->  http://127.0.0.1:31415/v1
 * ```
 *
 * **Utilisation** (à laisser tourner à côté de FreeLLMAPI) :
 *
 * ```
 * node freellmapi-cors-relay.mjs
 * ```
 *
 * Puis, dans le panneau Avancé de Ghostint Tracker, mets comme **URL de base** :
 *
 * ```
 * http://127.0.0.1:31416/v1
 * ```
 *
 * La clé API reste celle de FreeLLMAPI (la « Unified key »), inchangée.
 *
 * **Réglages** (variables d'environnement) :
 *   RELAY_PORT       port d'écoute du relais          (défaut 31416)
 *   RELAY_TARGET     routeur à relayer                (défaut http://127.0.0.1:31415)
 *   RELAY_ORIGIN     origine autorisée, ou *          (défaut *)
 */

import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.RELAY_PORT ?? 31416);
const TARGET = (process.env.RELAY_TARGET ?? 'http://127.0.0.1:31415').replace(/\/+$/, '');
const ALLOW_ORIGIN = process.env.RELAY_ORIGIN ?? '*';

/** En-têtes CORS ajoutés à chaque réponse. */
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN === '*' ? '*' : origin || ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Accept, X-Requested-With, x-llm-target',
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length',
    'Access-Control-Max-Age': '600',
    // Requis par le Private Network Access de Chrome pour les navigateurs qui
    // l'appliquent encore. Inoffensif ailleurs.
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;

  // Préflight : on répond nous-mêmes, sans déranger le routeur.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  let upstream;
  try {
    upstream = new URL(TARGET + req.url);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: `URL cible invalide : ${TARGET}${req.url}` }));
    return;
  }

  const headers = { ...req.headers, host: upstream.host };
  delete headers.origin; // évite un double contrôle d'origine côté routeur
  delete headers.referer;

  if (process.env.RELAY_DEBUG) {
    console.log(`[relais] -> ${req.method} ${upstream.href}`);
    console.log(`[relais]    ${JSON.stringify(headers)}`);
  }

  const proxyReq = http.request(
    upstream,
    { method: req.method, headers },
    (proxyRes) => {
      proxyRes.on('error', (err) => {
        console.error(`[relais] flux interrompu : ${err.message}`);
        res.destroy();
      });
      res.on('error', () => {
        // Le client a coupé : on arrête l'amont, sans bruit.
        proxyReq.destroy();
      });
      res.writeHead(proxyRes.statusCode ?? 502, {
        ...proxyRes.headers,
        ...corsHeaders(origin),
      });
      proxyRes.pipe(res);
    }
  );

  // Si le client abandonne en cours de route, on ne laisse pas la requête amont
  // pendante — sinon le processus finit par accumuler des sockets mortes.
  req.on('error', () => proxyReq.destroy());

  proxyReq.on('error', (err) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const refused = err.code === 'ECONNREFUSED';
    console.error(`[relais] erreur vers ${upstream.href} : ${err.code || err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(
      JSON.stringify({
        error: refused
          ? `FreeLLMAPI ne répond pas sur ${TARGET}. Vérifie que l'application FreeLLMAPI est bien lancée.`
          : `Erreur du relais : ${err.message}`,
        code: err.code || 'UNKNOWN',
      })
    );
  });

  req.pipe(proxyReq);
});

// Une socket cassée côté client ne doit jamais faire tomber le relais.
server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  else socket.destroy();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Relais CORS FreeLLMAPI démarré');
  console.log(`  écoute   http://127.0.0.1:${PORT}/v1`);
  console.log(`  relaie   ${TARGET}/v1`);
  console.log(`  origine  ${ALLOW_ORIGIN}`);
  console.log('');
  console.log('  URL de base à mettre dans le panneau Avancé :');
  console.log(`  http://127.0.0.1:${PORT}/v1`);
  console.log('');
  console.log('  Laisse cette fenêtre ouverte. Ctrl+C pour arrêter.');
  console.log('');
});
