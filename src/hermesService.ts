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
    .map((n) => `- [${n.data?.entityType ?? n.type ?? 'unknown'}] ${n.data?.label ?? n.id}`)
    .join('\n');
  const edgeLines = graphData.edges
    .map((e) => {
      const src = graphData.nodes.find((n) => n.id === e.source)?.data?.label ?? e.source;
      const tgt = graphData.nodes.find((n) => n.id === e.target)?.data?.label ?? e.target;
      return `- ${src} → ${tgt}`;
    })
    .join('\n');

  return `Tu es un analyste OSINT. Analyse le graphe d'investigation suivant et réponds en DEUX BLOCS séparés, dans CET ORDRE EXACT.

Nœuds:
${nodeLines || '(aucun)'}

Liens:
${edgeLines || '(aucun)'}

---
BLOC 1 — TEXTE D'ANALYSE (rédigé, lisible, structuré, en français):
Présente un résumé d'investigation narratif clair. Utilise des sauts de ligne.
Exemple de format:
  Nom: [valeur]
  Pseudo: [valeur]
  Activité: [description]
  Liens détectés: [description]

BLOC 2 — ENTITÉS EXTRAITES (liste brute, une par ligne, format: TYPE|VALEUR):
Extrais UNIQUEMENT les entités réelles avec leurs vraies valeurs textuelles.
Types valides: PSEUDO, EMAIL, TELEPHONE, NOM, PRENOM, URL, IP, DOMAINE, ORGANISATION, LOCALISATION, COMPTE_SOCIAL, PHOTO, VEHICULE, NOTE
Chaque ligne: TYPE|valeur_exacte
Exemple:
  PSEUDO|ezigk_official
  EMAIL|contact.elias@gmail.com
  TELEPHONE|+33 6 12 34 56 78
  NOM|Koudri
  PRENOM|Elias

---
Écris UNIQUEMENT les deux blocs. Pas de JSON. Pas de markdown. Pas d'explication hors-blocs.`;
}

function parseOllamaTextToDiscovery(text: string, graphData: { nodes: any[]; edges: any[] }): HermesDiscovery {
  // New two-block format: BLOC 1 = narrative, BLOC 2 = TYPE|VALUE lines
  const bloc2Match = text.match(/BLOC\s*2[^\n]*\n([\s\S]*?)(?:---|\n\n\n|$)/i);
  const bloc1Match = text.match(/BLOC\s*1[^\n]*\n([\s\S]*?)(?:BLOC\s*2|---)/i);

  let summary = '';
  const entities: HermesEntity[] = [];
  const relations: HermesRelation[] = [];

  if (bloc1Match) {
    summary = bloc1Match[1].trim();
  } else {
    // fallback: everything before the first TYPE|VALUE line
    const pipeIdx = text.search(/^[A-Z_]+\|/m);
    summary = (pipeIdx > 0 ? text.slice(0, pipeIdx) : text).trim();
  }

  const entityBlock = bloc2Match ? bloc2Match[1] : text;
  for (const line of entityBlock.split('\n')) {
    const trimmed = line.trim();
    const sep = trimmed.indexOf('|');
    if (sep > 0) {
      const type = trimmed.slice(0, sep).trim().toUpperCase();
      const label = trimmed.slice(sep + 1).trim();
      if (type && label) {
        entities.push({ type, label });
      }
    }
  }

  // If nothing parsed, derive from graph nodes as last resort
  if (entities.length === 0) {
    for (const n of graphData.nodes) {
      const type = (n.data?.entityType ?? n.type ?? 'NOTE').toUpperCase();
      const label = n.data?.label ?? n.id;
      if (label) entities.push({ type, label });
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
