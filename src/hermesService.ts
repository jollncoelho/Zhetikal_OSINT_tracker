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

  return `Tu es HERMES, un agent d'investigation OSINT d'élite. Tu travailles directement avec José, ton co-équipier analyste. Tu ne te contentes JAMAIS de résumer ce qui est déjà visible sur le graphe — c'est une perte de temps. Ton rôle est d'aller PLUS LOIN : croiser les données, identifier des incohérences, formuler des hypothèses d'investigation concrètes, et signaler des pistes prioritaires que l'opérateur n'a pas encore explorées.

Voici les données brutes du graphe d'investigation actuel :

ENTITÉS:
${nodeLines || '(aucune)'}

LIENS:
${edgeLines || '(aucun)'}

---

RÈGLES STRICTES :

BLOC 1 — ANALYSE D'INVESTIGATION (3 à 6 phrases, français, ton direct, professionnel) :
- Adresse-toi directement à José comme un co-équipier : "J'ai trouvé...", "Tu devrais prioriser...", "Je note une incohérence...", "Il faut vérifier...", "Je suspecte que..."
- Va au-delà du graphe : propose des croisements logiques (registre du commerce, DNS, géolocalisation, réseaux sociaux, banques, structures offshore), évoque des scénarios probables (fraude, relocalisation, dissimulation d'actifs, usurpation d'identité), signale des écarts suspects entre les données (ex: domaine suisse / adresse française, email jetable / IBAN pro).
- Sois percutant, synthétique, factuel. Pas de listes à puces. Pas de titres. Juste un paragraphe ou deux de prose professionnelle.

BLOC 2 — ENTITÉS À INJECTER (une par ligne, format strict : TYPE|valeur) :
RÈGLE ABSOLUE : liste UNIQUEMENT des entités TOTALEMENT NOUVELLES que tu as découvertes ou déduites lors de ton analyse.
Il est STRICTEMENT INTERDIT de répéter dans ce bloc les entités déjà présentes dans le graphe ci-dessus. Chaque valeur listée dans "ENTITÉS:" est considérée comme CONNUE et INTERDITE de réapparition ici.
Seuls les nouveaux comptes, alias, coordonnées, organisations, adresses ou identifiants que tu as inférés ou découverts peuvent figurer ici.
Si tu n'as rien de nouveau à ajouter, écris simplement : (aucune nouvelle entité)
Types valides : PSEUDO, EMAIL, TELEPHONE, NOM, PRENOM, URL, IP, DOMAINE, ORGANISATION, LOCALISATION, COMPTE_SOCIAL, PHOTO, VEHICULE, IBAN, NOTE
Exemple de format :
ORGANISATION|Ezkformation SARL
LOCALISATION|42 Avenue Jean Jaurès, Paris
EMAIL|contact.elias@mailboxpro.com
IBAN|FR14 3000 1234 5678 9012 3456 7890

---
Réponds UNIQUEMENT avec ces deux blocs dans l'ordre. Aucun JSON. Aucun markdown. Aucune phrase hors-blocs.`;
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
