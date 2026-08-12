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

function parseOllamaTextToDiscovery(text: string, graphData: { nodes: any[]; edges: any[] }): HermesDiscovery {
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
  return parseOllamaTextToDiscovery(text, graphData);
}

const PORTAL_URL = 'https://inference-api.nousresearch.com/v1/chat/completions';
const PORTAL_MODEL = 'stepfun/step-3.7-flash:free';

function getPortalApiKey(): string {
  const key = typeof localStorage !== 'undefined' ? localStorage.getItem('portal_api_key') : null;
  if (!key?.trim()) {
    throw new Error('Clé API Portal manquante. Configure-la dans le panneau Avancé (Hermes) avant de lancer l\'analyse.');
  }
  return key.trim();
}

async function runPortalAnalysis(graphData: { nodes: any[]; edges: any[] }, analystName?: string): Promise<HermesDiscovery> {
  const apiKey = getPortalApiKey();
  const messages = [
    { role: 'user', content: buildGraphPrompt(graphData, analystName) },
  ];

  let response: Response;
  try {
    response = await fetch(PORTAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: PORTAL_MODEL, messages, stream: false }),
    });
  } catch (err) {
    throw new Error('Portal API is unreachable. Check your internet connection.');
  }

  if (!response.ok) {
    throw new Error(`Portal API returned HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Portal API returned an empty response.');
  return parseOllamaTextToDiscovery(text, graphData);
}

export async function runAnalysis(
  mode: AnalysisMode,
  graphData: { nodes: any[]; edges: any[] },
  analystName?: string
): Promise<HermesDiscovery> {
  if (mode === 'local') return runLocalAnalysis(graphData, analystName);
  return runPortalAnalysis(graphData, analystName);
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

export async function checkHermes(): Promise<boolean> {
  const key = typeof localStorage !== 'undefined' ? localStorage.getItem('portal_api_key') : null;
  if (!key?.trim()) return false;
  try {
    const res = await fetch(PORTAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key.trim()}` },
      body: JSON.stringify({ model: PORTAL_MODEL, messages: [{ role: 'user', content: 'ping' }], stream: false, max_tokens: 1 }),
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}
