import type { AnalysisMode, HermesDiscovery, HermesEntity, HermesRelation } from './types/hermes';

// ── Legacy chat interface (kept for backward compatibility) ──────────────────

export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  message: {
    content: string;
  };
}

const CHAT_URL = 'http://localhost:11434/api/chat';
const CHAT_MODEL = 'gemma4';

export const queryHermes = async (messages: HermesMessage[], workdir?: string): Promise<string> => {
  try {
    const effectiveMessages: HermesMessage[] = workdir
      ? [
          {
            role: 'system',
            content: `Tu travailles EXCLUSIVEMENT dans le répertoire suivant : ${workdir}\nN'accède à aucun autre répertoire. Toutes tes opérations sur le système de fichiers doivent rester dans ce dossier.`,
          },
          ...messages,
        ]
      : messages;

    const body: Record<string, unknown> = {
      model: CHAT_MODEL,
      messages: effectiveMessages,
      stream: false,
    };

    if (workdir) {
      body.cwd = workdir;
    }

    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Erreur Ollama: ${response.status}`);

    const data: OllamaResponse = await response.json();
    return data.message.content.trim();
  } catch (error) {
    console.error(error);
    const base = 'Impossible de joindre Hermes Core. Assure-toi que Ollama tourne bien en arrière-plan (port 11434).';
    const suffix = workdir ? ` — Vérifie que le dossier existe toujours : ${workdir}` : '';
    throw new Error(base + suffix);
  }
};

// ── Analysis backends ────────────────────────────────────────────────────────

const OLLAMA_GENERATE_URL = 'http://localhost:11434/api/generate';

export const RECOMMENDED_MODELS = [
  { id: 'nemotron-3.5-lightning', label: 'nemotron-3.5-lightning (NVIDIA — Recommandé pour l\'extraction d\'entités)' },
  { id: 'gemma:2b', label: 'gemma:2b' },
  { id: 'llama3.2', label: 'llama3.2' },
  { id: 'hermes3', label: 'hermes3' },
];

const LS_MODEL_KEY = 'ollama_model';

export function getOllamaModel(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LS_MODEL_KEY);
    if (stored?.trim()) return stored.trim();
  }
  return '';
}

export function setOllamaModel(model: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_MODEL_KEY, model.trim());
  }
}

function buildGraphPrompt(graphData: { nodes: any[]; edges: any[] }, analystName?: string): string {
  const analyst = analystName?.trim() || 'Analyste';
  const nodeLines = graphData.nodes
    .map((n) => {
      const type = n.data?.entityType ?? n.type ?? 'unknown';
      const label = n.data?.label ?? n.id;
      const fields = n.data?.fields ? Object.entries(n.data.fields).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') : '';
      return `- [${type}] ${label}${fields ? ` (${fields})` : ''}`;
    })
    .join('\n');
  const edgeLines = graphData.edges
    .map((e) => {
      const src = graphData.nodes.find((n) => n.id === e.source)?.data?.label ?? e.source;
      const tgt = graphData.nodes.find((n) => n.id === e.target)?.data?.label ?? e.target;
      return `- ${src} → ${tgt}`;
    })
    .join('\n');

  // Liste brute des valeurs déjà présentes pour la déduplication
  const existingValues = graphData.nodes
    .map((n) => String(n.data?.label ?? '').trim())
    .filter(Boolean)
    .join(' | ');

  return `Tu es un expert d'élite en OSINT et en investigation numérique. Tu agis comme le co-enquêteur de ${analyst}. Ton but est d'analyser les entités fournies issues d'un graphique d'investigation, de croiser les données de manière logique et de proposer de nouvelles pistes d'enquêtes ultra-précises. Tu ne résumes JAMAIS ce qui est déjà visible — tu vas au-delà : croisements de registres, DNS, géolocalisation, réseaux sociaux, banques, structures offshore, incohérences, hypothèses de relocalisation.

Voici les données actuelles du graphique sous forme d'entités :

ENTITÉS:
${nodeLines || '(aucune)'}

LIENS:
${edgeLines || '(aucun)'}

VALEURS DÉJÀ PRÉSENTES (NE PAS REPROPOSER):
${existingValues || '(aucune)'}

---

Tu dois générer une réponse STRICTEMENT structurée sous la forme suivante (respecte les balises textuelles) :

=== ANALYSE ===
Rédige ton rapport d'investigation de manière fluide et immersive. Adresse-toi directement à ${analyst}. Fais des liens, évoque des vérifications de registres, des serveurs suspects, des hypothèses de relocalisation ou des incohérences. Le ton doit être ultra-professionnel, percutant et sans aucune liste à puces technique. 3 à 6 phrases de prose dense.

=== NOUVELLES ENTITÉS ===
Liste UNIQUEMENT les entités NOUVELLES découvertes ou déduites lors de ton analyse. N'inclus JAMAIS les entités de départ fournies ci-dessus.

RÈGLES STRICTES POUR LA VALEUR (VALUE) DE CHAQUE ENTITÉ :
1. La valeur doit être EXCLUSIVEMENT la donnée brute, exacte, sans aucun texte descriptif ni parenthèses.
   - IP : "185.220.101.5" et JAMAIS "[IP Adress] (Requête...)"
   - IBAN : "FR763000..." et JAMAIS "IBAN1"
   - Domaine : "k-digital.com" et JAMAIS "Domaine suspect k-digital.com"
2. La description, la justification ou le contexte va dans le champ NOTES, jamais dans VALUE.
3. DÉDUPLICATION : Ne propose JAMAIS une entité dont la valeur brute existe déjà dans la liste "VALEURS DÉJÀ PRÉSENTES" ci-dessus. Vérifie chaque valeur avant de la proposer.

Format strict pour chaque entité (4 lignes par entité) :
- TYPE: [TYPE EN MAJUSCULE]
- VALUE: [valeur brute exacte]
- NOTES: [description/court contexte ou justification]
- ---

Types valides : PSEUDO, EMAIL, TELEPHONE, NOM, PRENOM, URL, IP, DOMAINE, HOSTNAME, ASN, HASH, SSL_CERT, TTP, ORGANISATION, LOCALISATION, COMPTE_SOCIAL, PHOTO, VEHICULE, IBAN, NOTE
Si aucune nouvelle entité, écris : (aucune nouvelle entité)

---
Réponds UNIQUEMENT avec ces deux sections dans l'ordre. Aucun JSON. Aucun markdown superflu. Aucune phrase hors-sections.`;
}

function parseOllamaTextToDiscovery(text: string): HermesDiscovery {
  const analyseMatch = text.match(/===\s*ANALYSE\s*===\s*\n([\s\S]*?)(?:===\s*NOUVELLES ENTITÉS\s*===|$)/i);
  const entitesMatch = text.match(/===\s*NOUVELLES ENTIT[ÉE]S?\s*===\s*\n([\s\S]*?)$/i);

  let summary = '';
  const entities: HermesEntity[] = [];
  const relations: HermesRelation[] = [];

  summary = analyseMatch ? analyseMatch[1].trim() : '';

  if (entitesMatch) {
    const block = entitesMatch[1];
    // Parse blocks: TYPE / VALUE / NOTES (optional) separated by --- lines
    const entityBlocks = block.split(/^\s*-{3,}\s*$/m).map((b) => b.trim()).filter(Boolean);
    for (const eb of entityBlocks) {
      const typeMatch = eb.match(/TYPE\s*:\s*([A-Z_]+)/i);
      const valueMatch = eb.match(/VALUE\s*:\s*(.+)/i);
      const notesMatch = eb.match(/NOTES\s*:\s*([\s\S]*?)(?:\n[-*]\s*(?:TYPE|VALUE|NOTES)|$)/i);
      if (typeMatch && valueMatch) {
        const t = typeMatch[1].trim().toUpperCase();
        const v = valueMatch[1].trim();
        const notes = notesMatch ? notesMatch[1].trim() : '';
        if (t && v) {
          entities.push({ type: t, label: v, properties: notes ? { notes } : undefined });
        }
      }
    }

    // Fallback: legacy TYPE|VALUE pipe format (in case the model uses old style)
    if (entities.length === 0) {
      for (const line of block.split('\n')) {
        const trimmed = line.replace(/^[-*]\s*/, '').trim();
        const sep = trimmed.indexOf('|');
        if (sep > 0) {
          const type = trimmed.slice(0, sep).trim().toUpperCase();
          const label = trimmed.slice(sep + 1).trim();
          if (type && label) entities.push({ type, label });
        }
      }
    }
  }

  // Last resort: fall back to anything that looks like TYPE|VALUE in the full text
  if (entities.length === 0) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      const sep = trimmed.indexOf('|');
      if (sep > 0) {
        const type = trimmed.slice(0, sep).trim().toUpperCase();
        const label = trimmed.slice(sep + 1).trim();
        if (type && label && /^[A-Z_]+$/.test(type)) entities.push({ type, label });
      }
    }
  }

  if (!summary) summary = text.slice(0, 2000).trim();

  return { entities, relations, summary };
}

async function runLocalAnalysis(graphData: { nodes: any[]; edges: any[] }, analystName?: string): Promise<HermesDiscovery> {
  const model = getOllamaModel();
  if (!model) {
    throw new Error('Aucun modèle Ollama sélectionné. Choisis un modèle dans le menu de configuration avant de lancer l\'analyse.');
  }
  let response: Response;
  try {
    response = await fetch(OLLAMA_GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: buildGraphPrompt(graphData, analystName),
        stream: false,
      }),
    });
  } catch (err) {
    throw new Error('Ollama is unreachable (connection refused on port 11434). Make sure Ollama is running.');
  }

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text: string = data?.response ?? '';
  return parseOllamaTextToDiscovery(text);
}

// ── FreeLLMAPI backend (OpenAI-compatible gateway) ───────────────────────────
// FreeLLMAPI (https://freellmapi.co) is a self-hosted, OpenAI-compatible router
// that aggregates the free tiers of many providers behind a single API key.
// Any OpenAI client works: just point the base URL at your router and use your key.

export const DEFAULT_FREELLM_BASE_URL = 'http://localhost:3001/v1';
export const DEFAULT_FREELLM_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash';

const LS_FREELLM_KEY = 'freellm_api_key';
const LS_FREELLM_BASE_URL = 'freellm_base_url';
const LS_FREELLM_MODEL = 'freellm_model';
const LS_FREELLM_AUTO = 'freellm_auto_model';

function lsGet(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(key)?.trim() ?? '';
}

function lsSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = value.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
  else localStorage.removeItem(key);
}

export function getFreeLlmKey(): string {
  return lsGet(LS_FREELLM_KEY);
}

export function setFreeLlmKey(key: string): void {
  lsSet(LS_FREELLM_KEY, key);
}

export function getFreeLlmBaseUrl(): string {
  return lsGet(LS_FREELLM_BASE_URL) || DEFAULT_FREELLM_BASE_URL;
}

export function setFreeLlmBaseUrl(url: string): void {
  lsSet(LS_FREELLM_BASE_URL, url);
}

export function getFreeLlmModel(): string {
  return lsGet(LS_FREELLM_MODEL) || DEFAULT_FREELLM_MODEL;
}

export function setFreeLlmModel(model: string): void {
  lsSet(LS_FREELLM_MODEL, model);
}

/**
 * "Auto" mode: the router itself picks the model and hops to the next one when a
 * free quota runs out (its Fallback Chain + routing strategy). This is the
 * default because it needs no model knowledge from the user and survives quota
 * exhaustion. The FreeLLMAPI desktop app implements it by simply omitting the
 * `model` field from the request body.
 */
export function getFreeLlmAuto(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(LS_FREELLM_AUTO) !== 'false';
}

export function setFreeLlmAuto(auto: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LS_FREELLM_AUTO, auto ? 'true' : 'false');
}

/**
 * Whether the request should let the router choose the model.
 * True when the Auto toggle is on, or when the model field literally says
 * "auto"/"automatique" (so typing it by hand works as expected).
 */
export function isFreeLlmAutoEffective(): boolean {
  if (getFreeLlmAuto()) return true;
  return /^(auto|automatique|automatic)$/i.test(getFreeLlmModel().trim());
}

/**
 * Build the chat-completions payload. In auto mode we deliberately omit `model`
 * so the router routes across the whole catalog and fails over automatically.
 */
function buildFreeLlmPayload(messages: Array<{ role: string; content: string }>, extra?: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = { messages, stream: false, ...extra };
  if (!isFreeLlmAutoEffective()) {
    payload.model = getFreeLlmModel().trim() || DEFAULT_FREELLM_MODEL;
  }
  return payload;
}

// Build the OpenAI-compatible chat-completions URL from the configured base URL.
function getFreeLlmChatUrl(): string {
  const base = getFreeLlmBaseUrl().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

/**
 * FreeLLMAPI is a self-hosted router. A very common mistake is to point the base
 * URL at the marketing site (https://freellmapi.co) instead of at a running
 * router. That returns an HTML page, which used to surface as the cryptic
 * "Unexpected token '<' ... is not valid JSON" error. We detect it and explain.
 */
function htmlInsteadOfJsonError(url: string, status: number): Error {
  const missingV1 = !/\/v1(\/|$)/.test(url);
  const lines = [
    `L'URL « ${url} » a renvoyé une page HTML au lieu d'une réponse JSON (HTTP ${status}).`,
    '',
    missingV1
      ? `Cause la plus probable : il manque « /v1 » dans l'URL de base. Le routeur sert son API sous /v1, et tout le reste renvoie la page de son interface web.`
      : `Ce n'est pas un endpoint d'API OpenAI-compatible.`,
    '',
    'Deux configurations possibles :',
    '',
    '• Application de bureau FreeLLMAPI',
    '  1. Ouvre l\'application FreeLLMAPI.',
    '  2. Va dans la section « Keys » (ou « Connect your app »).',
    '  3. Clique sur « Copy base URL » et colle cette adresse en URL de base',
    '     (elle ressemble à http://127.0.0.1:31415/v1).',
    '  4. Clique sur « Copy API key » pour la « Unified key » et colle-la dans Clé API.',
    '',
    '• Routeur auto-hébergé (Node.js / Docker)',
    '  L\'adresse est http://localhost:3001/v1',
    '',
    'Rappel : freellmapi.co est le site vitrine — l\'API n\'est PAS hébergée chez eux.',
  ];
  return new Error(lines.join('\n'));
}

/** Read a response as JSON, turning HTML/plain-text bodies into a clear error. */
async function parseJsonResponse(response: Response, url: string, label: string): Promise<any> {
  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const trimmed = raw.trim();
  const looksLikeHtml = /^<(?:!doctype|html|head|body)\b/i.test(trimmed) || /^<\?xml/i.test(trimmed);

  if (looksLikeHtml || (trimmed.startsWith('<') && !trimmed.startsWith('{'))) {
    throw htmlInsteadOfJsonError(url, response.status);
  }
  if (!trimmed) {
    throw new Error(`${label} a renvoyé une réponse vide (HTTP ${response.status}).`);
  }
  if (!contentType.includes('json') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(
      `${label} a renvoyé un contenu inattendu (HTTP ${response.status}, type « ${contentType || 'inconnu'} ») : ${trimmed.slice(0, 200)}`
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} a renvoyé un JSON illisible (HTTP ${response.status}) : ${trimmed.slice(0, 200)}`);
  }
}

function getFreeLlmApiKey(): string {
  const key = getFreeLlmKey();
  if (!key) {
    throw new Error('Clé API FreeLLMAPI manquante. Configure-la dans le panneau Avancé (FreeLLMAPI) avant de lancer l\'analyse.');
  }
  return key;
}

async function runFreeLlmAnalysis(graphData: { nodes: any[]; edges: any[] }, analystName?: string): Promise<HermesDiscovery> {
  const apiKey = getFreeLlmApiKey();
  const url = getFreeLlmChatUrl();
  const messages = [
    { role: 'user', content: buildGraphPrompt(graphData, analystName) },
  ];
  const payload = buildFreeLlmPayload(messages);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      `FreeLLMAPI est injoignable (${url}).\n\n` +
        `Vérifie que ton routeur FreeLLMAPI est bien démarré et que l'URL de base est correcte ` +
        `(par défaut : http://localhost:3001/v1).`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = body.trim().slice(0, 300);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `FreeLLMAPI a refusé la clé API (HTTP ${response.status}).\n\n` +
          `Si tu utilises l'application de bureau FreeLLMAPI : ouvre la section « Keys » ` +
          `(ou « Connect your app ») et copie la « Unified key » avec le bouton « Copy API key ». ` +
          `C'est cette clé qui va dans le champ Clé API — pas une clé de fournisseur.\n` +
          `Vérifie également que l'URL de base correspond à celle donnée par « Copy base URL ».` +
          `${detail ? `\n\nDétail : ${detail}` : ''}`
      );
    }
    if (response.status === 404) {
      throw new Error(
        `FreeLLMAPI a renvoyé 404 pour « ${url} ».\n` +
          `L'URL de base ne pointe probablement pas vers un routeur FreeLLMAPI actif. ` +
          `App de bureau : reprends l'adresse via « Copy base URL ». Auto-hébergé : http://localhost:3001/v1.` +
          `${detail ? `\n\nDétail : ${detail}` : ''}`
      );
    }
    if (response.status === 400 && isFreeLlmAutoEffective()) {
      throw new Error(
        `FreeLLMAPI a refusé la requête en mode Auto (HTTP 400).\n\n` +
          `En mode Auto, le routeur choisit lui-même le modèle : il faut donc lui avoir donné ` +
          `une « Fallback Chain » à parcourir.\n` +
          `Ouvre l'application FreeLLMAPI, ajoute au moins une clé de fournisseur, puis active ` +
          `des modèles dans la « Fallback Chain ».\n` +
          `Autre option : décoche « Auto » et choisis un modèle précis.` +
          `${detail ? `\n\nDétail : ${detail}` : ''}`
      );
    }
    throw new Error(`FreeLLMAPI a renvoyé HTTP ${response.status}${detail ? ` : ${detail}` : ''}`);
  }

  const data = await parseJsonResponse(response, url, 'FreeLLMAPI');
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('FreeLLMAPI a renvoyé une réponse vide.');
  return parseOllamaTextToDiscovery(text);
}

export async function runAnalysis(
  mode: AnalysisMode,
  graphData: { nodes: any[]; edges: any[] },
  analystName?: string
): Promise<HermesDiscovery> {
  if (mode === 'local') return runLocalAnalysis(graphData, analystName);
  return runFreeLlmAnalysis(graphData, analystName);
}

// ── Health checks ────────────────────────────────────────────────────────────

export async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ask the router for its list of available models (OpenAI-compatible GET /v1/models).
 * This is the authoritative answer to "which models can I actually use?" — the
 * router only advertises what the connected providers currently serve.
 */
export async function fetchFreeLlmModels(): Promise<string[]> {
  const key = getFreeLlmApiKey();
  const url = `${getFreeLlmBaseUrl().replace(/\/+$/, '')}/models`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${key}` },
    });
  } catch {
    throw new Error(`Impossible de joindre le routeur FreeLLMAPI (${url}).`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = body.trim().slice(0, 200);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clé API refusée (HTTP ${response.status}).${detail ? ` ${detail}` : ''}`);
    }
    throw new Error(`Le routeur a renvoyé HTTP ${response.status}${detail ? ` : ${detail}` : ''}`);
  }

  const data = await parseJsonResponse(response, url, 'FreeLLMAPI');
  const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const ids = list
    .map((m) => (typeof m === 'string' ? m : m?.id))
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

export async function checkFreeLlm(): Promise<boolean> {
  const key = getFreeLlmKey();
  if (!key) return false;
  try {
    const res = await fetch(getFreeLlmChatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(buildFreeLlmPayload([{ role: 'user', content: 'ping' }], { max_tokens: 1 })),
    });
    // A reachable router may reject the shape of the probe (400) — that still means "up".
    if (res.status === 400) return true;
    if (!res.ok) return false;
    // Guard against a web page being served at this URL (would be HTML, not JSON).
    return (res.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}
