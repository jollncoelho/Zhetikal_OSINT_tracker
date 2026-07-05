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
const OLLAMA_GENERATE_MODEL = 'gemma4:e2b';
const HERMES_PROXY_URL = 'http://localhost:62938/analyze';

function buildGraphPrompt(graphData: { nodes: any[]; edges: any[] }): string {
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

  return `Tu es un expert d'élite en OSINT et en investigation numérique. Tu agis comme le co-enquêteur de José. Ton but est d'analyser les entités fournies issues d'un graphique d'investigation, de croiser les données de manière logique et de proposer de nouvelles pistes d'enquêtes ultra-précises. Tu ne résumes JAMAIS ce qui est déjà visible — tu vas au-delà : croisements de registres, DNS, géolocalisation, réseaux sociaux, banques, structures offshore, incohérences, hypothèses de relocalisation.

Voici les données actuelles du graphique sous forme d'entités :

ENTITÉS:
${nodeLines || '(aucune)'}

LIENS:
${edgeLines || '(aucun)'}

---

Tu dois générer une réponse STRICTEMENT structurée sous la forme suivante (respecte les balises textuelles) :

=== ANALYSE ===
Rédige ton rapport d'investigation de manière fluide et immersive. Adresse-toi directement à José. Fais des liens, évoque des vérifications de registres, des serveurs suspects, des hypothèses de relocalisation ou des incohérences. Le ton doit être ultra-professionnel, percutant et sans aucune liste à puces technique. 3 à 6 phrases de prose dense.

=== NOUVELLES ENTITÉS ===
Liste UNIQUEMENT les entités NOUVELLES découvertes ou déduites lors de ton analyse. N'inclus JAMAIS les entités de départ fournies ci-dessus.
Format strict pour chaque entité :
- TYPE: [TYPE EN MAJUSCULE]
- VALUE: [valeur précise]

Types valides : PSEUDO, EMAIL, TELEPHONE, NOM, PRENOM, URL, IP, DOMAINE, ORGANISATION, LOCALISATION, COMPTE_SOCIAL, PHOTO, VEHICULE, IBAN, NOTE
Si aucune nouvelle entité, écris : (aucune nouvelle entité)

---
Réponds UNIQUEMENT avec ces deux sections dans l'ordre. Aucun JSON. Aucun markdown superflu. Aucune phrase hors-sections.`;
}

function parseOllamaTextToDiscovery(text: string, graphData: { nodes: any[]; edges: any[] }): HermesDiscovery {
  const analyseMatch = text.match(/===\s*ANALYSE\s*===\s*\n([\s\S]*?)(?:===\s*NOUVELLES ENTITÉS\s*===|$)/i);
  const entitesMatch = text.match(/===\s*NOUVELLES ENTITÉS\s*===\s*\n([\s\S]*?)(?:---|$)/i);

  let summary = '';
  const entities: HermesEntity[] = [];
  const relations: HermesRelation[] = [];

  summary = analyseMatch ? analyseMatch[1].trim() : '';

  if (entitesMatch) {
    const block = entitesMatch[1];
    // Parse pairs of "- TYPE: X\n- VALUE: Y"
    const typeValuePairs = [...block.matchAll(/[-*]\s*TYPE\s*:\s*([A-Z_]+)[^\n]*\n[-*]\s*VALUE\s*:\s*(.+)/gi)];
    for (const [, type, value] of typeValuePairs) {
      const t = type.trim().toUpperCase();
      const v = value.trim();
      if (t && v) entities.push({ type: t, label: v });
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

async function runLocalAnalysis(graphData: { nodes: any[]; edges: any[] }): Promise<HermesDiscovery> {
  let response: Response;
  try {
    response = await fetch(OLLAMA_GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_GENERATE_MODEL,
        prompt: buildGraphPrompt(graphData),
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

async function runHermesAnalysis(graphData: { nodes: any[]; edges: any[] }): Promise<HermesDiscovery> {
  let response: Response;
  try {
    response = await fetch(HERMES_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: graphData.nodes, edges: graphData.edges }),
    });
  } catch (err) {
    throw new Error('Hermes proxy is unreachable (connection refused on port 62938).');
  }

  if (!response.ok) {
    throw new Error(`Hermes proxy returned HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data as HermesDiscovery;
}

export async function runAnalysis(
  mode: AnalysisMode,
  graphData: { nodes: any[]; edges: any[] }
): Promise<HermesDiscovery> {
  if (mode === 'local') return runLocalAnalysis(graphData);
  return runHermesAnalysis(graphData);
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
  try {
    const res = await fetch('http://localhost:62938/health', { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
