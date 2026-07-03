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
    .map((n) => `- [${n.type ?? n.data?.type ?? 'unknown'}] ${n.data?.label ?? n.id}`)
    .join('\n');
  const edgeLines = graphData.edges
    .map((e) => `- ${e.source} --[${e.label ?? e.data?.type ?? 'related'}]--> ${e.target}`)
    .join('\n');

  return `Analyze the following investigation graph and extract structured intelligence.

Nodes:
${nodeLines || '(none)'}

Edges:
${edgeLines || '(none)'}

Respond ONLY with valid JSON matching this exact schema:
{
  "entities": [{ "type": "string", "label": "string", "properties": {} }],
  "relations": [{ "source": "string", "target": "string", "type": "string", "properties": {} }],
  "summary": "string"
}`;
}

function parseOllamaTextToDiscovery(text: string, graphData: { nodes: any[]; edges: any[] }): HermesDiscovery {
  // Try to extract a JSON block from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.entities) && Array.isArray(parsed.relations) && typeof parsed.summary === 'string') {
        return parsed as HermesDiscovery;
      }
    } catch {
      // fall through to heuristic extraction
    }
  }

  // Heuristic fallback: derive entities from graph nodes and return the text as summary
  const entities: HermesEntity[] = graphData.nodes.map((n) => ({
    type: n.type ?? n.data?.type ?? 'unknown',
    label: n.data?.label ?? n.id,
  }));

  const relations: HermesRelation[] = graphData.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.label ?? e.data?.type ?? 'related',
  }));

  return { entities, relations, summary: text.slice(0, 2000) };
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
