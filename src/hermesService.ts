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

/**
 * Bornes de temps de l'analyse locale.
 *
 * Sans elles, `fetch` n'a aucun délai maximal : si Ollama accepte la connexion
 * mais n'envoie jamais la réponse, la promesse ne se résout ni ne se rejette,
 * et le bouton reste sur « Analyse en cours… » indéfiniment. L'analyste n'a
 * alors aucun moyen de savoir si le modèle travaille ou s'il est bloqué.
 */
const OLLAMA_STALL_MS = 45_000;
/**
 * Délai accordé avant le **premier** fragment.
 *
 * Il ne mesure pas la même chose que l'immobilité en cours de génération : avant
 * le premier jeton, le modèle avale tout le prompt (consignes + graphe). Sur un
 * 9,2 B en Q8 et sans GPU, cette phase dure couramment une minute ; la compter
 * comme un blocage faisait échouer des analyses parfaitement saines.
 */
const OLLAMA_FIRST_CHUNK_MS = 240_000;
/**
 * Plafond absolu, calé sur `num_predict` : 2048 jetons à la vitesse observée
 * sur cette machine (≈ 3,6 jetons/s) font ~9 min. Une analyse réelle sur un
 * petit graphe prend déjà 2 min 30, donc un plafond plus court interromprait
 * du travail légitime. Le vrai filet reste le détecteur d'immobilité.
 */
const OLLAMA_TOTAL_MS = 600_000;

/**
 * Assez pour un rapport JSON complet, trop court pour une divagation : un
 * modèle bavard peut générer jusqu'à saturer son contexte, ce qui prend des
 * dizaines de minutes pour un résultat inutilisable.
 */
const OLLAMA_MAX_TOKENS = 2048;

export interface OllamaProgress {
  /** Nombre de fragments reçus — la preuve que le modèle produit encore. */
  chunks: number;
  /** Caractères déjà générés. */
  chars: number;
  elapsedMs: number;
}

/**
 * Génère une réponse Ollama en flux, avec deux garde-fous.
 *
 * `think: false` est le point décisif. Les modèles de raisonnement (le modèle
 * de cet utilisateur déclare la capacité `thinking`) écrivent par défaut toute
 * leur chaîne de pensée **dans le champ `response`** : mesuré sur cette
 * machine, « Réponds uniquement : OK » prenait 58,7 s et renvoyait un
 * « Thinking Process: 1. Analyze the Request… ». Avec `think: false`, la même
 * requête prend 1,2 s et renvoie « OK ». Sur un vrai graphe, la différence
 * n'est pas une optimisation : c'est la différence entre une analyse qui
 * aboutit et une analyse qui ne finit jamais.
 */
async function ollamaGenerate(
  payload: Record<string, unknown>,
  onProgress?: (progress: OllamaProgress) => void
): Promise<string> {
  const startedAt = Date.now();
  const controller = new AbortController();
  let stalled = false;
  let expired = false;
  let started = false;

  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(
      () => {
        stalled = true;
        controller.abort();
      },
      started ? OLLAMA_STALL_MS : OLLAMA_FIRST_CHUNK_MS
    );
  };
  const hardTimer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, OLLAMA_TOTAL_MS);

  const explainAbort = (): Error => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    if (stalled) {
      return new Error(
        started
          ? `Ollama s'est arrêté en cours de génération (plus rien pendant ${Math.round(OLLAMA_STALL_MS / 1000)} s).\n\n` +
            `Le modèle a probablement manqué de mémoire. Essaie un modèle plus petit dans le menu de configuration ` +
            `(gemma:2b, llama3.2), ou ferme les applications qui consomment de la mémoire.`
          : `Le modèle n'a pas commencé à répondre en ${Math.round(OLLAMA_FIRST_CHUNK_MS / 60000)} min : il n'arrive pas ` +
            `à charger ou à digérer le prompt.\n\n` +
            `Essaie un modèle plus petit (gemma:2b, llama3.2) — un 9 B en Q8 demande beaucoup de mémoire vive.`
      );
    }
    if (expired) {
      return new Error(
        `L'analyse locale a dépassé ${Math.round(OLLAMA_TOTAL_MS / 60000)} min (${seconds} s) et a été interrompue.\n\n` +
          `Le modèle tourne mais n'a pas fini : soit le graphe est très volumineux, soit le modèle est trop lourd ` +
          `pour cette machine. Réduis le nombre d'entités analysées, ou choisis un modèle plus petit.`
      );
    }
    return new Error(`Analyse interrompue après ${seconds} s.`);
  };

  armStall();

  try {
    let response: Response;
    try {
      response = await fetch(OLLAMA_GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });
    } catch (error) {
      if (stalled || expired) throw explainAbort();
      // Un `TypeError: Failed to fetch` recouvre deux causes opposées : le
      // serveur est éteint, ou le navigateur refuse d'atteindre la boucle
      // locale. La sonde `no-cors` ne les distingue pas de façon fiable (un
      // refus d'accès au réseau local la fait échouer aussi), donc on nomme
      // les deux pistes au lieu d'en affirmer une à tort.
      throw new Error(
        'Impossible de joindre Ollama depuis cette page. Deux causes possibles :\n\n' +
          '1. Ollama n\'est pas démarré — lance-le, puis vérifie avec `ollama list`.\n' +
          '2. Le navigateur bloque l\'accès au réseau local. Chrome 138+ et ses dérivés exigent ' +
          'une autorisation pour joindre 127.0.0.1 depuis un site en https, et n\'affichent pas ' +
          'toujours l\'invite. Ouvre Paramètres → Confidentialité et sécurité → Accès au réseau local, ' +
          'et autorise ce site — ou lance le tracker en local (http://localhost).'
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama a répondu HTTP ${response.status}${detail ? ` : ${detail.slice(0, 300)}` : ''}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      // Pas de flux disponible (navigateur ancien) : on retombe sur le JSON complet.
      const data = await response.json();
      return String(data?.response ?? '');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let chunks = 0;

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        armStall();
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let part: { response?: string; error?: string };
          try {
            part = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (part.error) throw new Error(`Ollama : ${part.error}`);
          if (part.response) {
            started = true;
            text += part.response;
            chunks += 1;
            onProgress?.({ chunks, chars: text.length, elapsedMs: Date.now() - startedAt });
          }
        }
      }
    } catch (error) {
      if (stalled || expired) throw explainAbort();
      throw error;
    }

    return text;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    clearTimeout(hardTimer);
  }
}

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

/**
 * Consignes de cadrage, envoyées comme **message système**.
 *
 * Séparer les règles des données n'est pas cosmétique : un modèle d'instruction
 * accorde plus de poids à un rôle système qu'à des consignes noyées au milieu
 * d'un long message utilisateur. Côté Ollama, le champ `system` de
 * `/api/generate` joue ce rôle ; côté FreeLLMAPI (compatible OpenAI), c'est le
 * message `role: "system"`.
 *
 * Les interdits portent sur ce que le modèle *ajoute* : sans eux, il complète
 * un graphe de trois nœuds avec une IP, un ASN, une ville et un hébergeur
 * inventés, présentés comme des constats.
 */
function buildAnalysisSystemPrompt(analyst: string): string {
  return `Tu es un analyste OSINT senior, strict, pragmatique et purement factuel. Tu rédiges pour ${analyst} un rapport d'audit technique.

RÈGLES IMPÉRATIVES

1. AUCUNE DRAMATISATION. Bannis le vocabulaire romanesque ou « hollywoodien » : « camouflage opératoire », « infrastructure éphémère », « nœud Tor », « dark web », « opérateur insaisissable », « rotation des identités ». Une adresse IP n'est une passerelle Tor que si les données le disent explicitement. Le ton est celui d'un rapport d'audit, pas d'un thriller.

2. RIGUEUR FACTUELLE. Tu ne conclus que sur les données techniques réellement fournies dans le graphe. Si l'hébergeur, l'ASN, le pays ou la date ne figurent pas dans les entités, tu écris qu'ils sont inconnus — tu ne les devines pas, tu ne les déduis pas du préfixe d'une IP, et tu n'inventes aucun scénario d'infrastructure.

3. HYPOTHÈSES NOMMÉES. Toute supposition commence par « Hypothèse à vérifier : » et n'est jamais présentée comme un constat.

4. TON. Sobre, technique, concis. Aucune flatterie, aucune mise en scène.

5. EXHAUSTIVITÉ. Tout identifiant concret que tu écris dans le rapport doit aussi figurer dans la liste d'entités. Un identifiant cité dans le texte mais absent de la liste est une faute grave : l'analyste ne pourra pas l'exploiter.

Tu ne cites jamais une information que tu ne peux pas relier aux entités fournies, et tu ne répètes pas ce que le graphe montre déjà.`;
}

/**
 * Inventaire déterministe de ce que le dossier ne contient pas.
 *
 * La consigne « n'invente pas » reste une consigne : sur un petit modèle elle
 * est ignorée une fois sur deux, et le rapport se met à attribuer l'IP à un
 * hébergeur et à une ville. Nommer explicitement les rubriques absentes change
 * la nature de la tâche — le modèle n'a plus à deviner ce qui manque, il lit
 * la liste. C'est la seule partie du dispositif qui agit *avant* la génération.
 */
function describeAbsentData(graphData: { nodes: any[]; edges: any[] }): string[] {
  const blob = graphData.nodes
    .map((node) =>
      [
        node.data?.label,
        node.data?.entityType,
        node.data?.fields ? Object.keys(node.data.fields).join(' ') : '',
        node.data?.fields ? Object.values(node.data.fields).join(' ') : '',
      ]
        .filter(Boolean)
        .join(' ')
    )
    .join(' ')
    .toLowerCase();

  const categories: Array<{ label: string; pattern: RegExp }> = [
    { label: 'ASN / hébergeur / opérateur réseau', pattern: /asn|hosting|h[ée]berg|host(?:er|name)?\b|\bisp\b|op[ée]rateur|organisation|organization|company|soci[ée]t[ée]|provider/ },
    { label: 'Géolocalisation (pays, ville, coordonnées)', pattern: /pays|country|ville|\bcity\b|r[ée]gion|localisation|location|\bgeo\b|adresse|address|coord/ },
    { label: 'WHOIS / enregistrement du domaine', pattern: /whois|registrar|registre|cr[ée]ation|creation|expir|owner|propri[ée]taire/ },
    { label: 'Certificat TLS', pattern: /\bssl\b|\btls\b|cert|issuer|[ée]metteur/ },
    { label: 'DNS / messagerie (MX, SPF, DMARC)', pattern: /\bdns\b|\bmx\b|nameserver|\bspf\b|dmarc/ },
  ];

  return categories.filter((category) => !category.pattern.test(blob)).map((category) => category.label);
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

  const absent = describeAbsentData(graphData);

  return `DOSSIER — ENTITÉS :
${nodeLines || '(aucune)'}

LIENS :
${edgeLines || '(aucun)'}

VALEURS DÉJÀ PRÉSENTES (ne pas reproposer) :
${existingValues || '(aucune)'}
${
  absent.length > 0
    ? `
DONNÉES ABSENTES DU DOSSIER (tu ne les inventes sous aucun prétexte) :
${absent.map((item) => `- ${item}`).join('\n')}

Pour chaque rubrique ci-dessus, écris « non renseigné ». Ne cite AUCUN nom d'hébergeur, de CDN, d'ASN, de pays ni de ville : ils ne figurent pas dans le dossier, les nommer serait une invention, pas une déduction.
`
    : ''
}
===

Tu produis trois sections, dans cet ordre, sans rien d'autre.

=== ANALYSE ===
Un rapport de 4 à 8 phrases adressé à ${analyst}, en français technique.
1. Ce que les données établissent : les faits vérifiables, valeurs citées.
2. Ce qu'elles permettent de déduire, et sur quelle donnée précise repose la déduction.
3. Ce qui reste inconnu et empêche de conclure.
4. La vérification la plus rentable à faire maintenant, et pourquoi.
Une déduction qui ne s'appuie sur aucune donnée du dossier n'a pas sa place ici.

=== NOUVELLES ENTITÉS ===
Ne liste QUE les entités nouvelles ou déduites : n'inclus jamais une entité de départ.
Un e-mail cité dans une phrase EST une entité EMAIL. Un pseudo cité EST une entité PSEUDO. Chaque identifiant distinct donne une ligne distincte : quatre adresses différentes font quatre entités, jamais une seule.

RÈGLES STRICTES POUR LA VALEUR (VALUE) :
1. La valeur est EXCLUSIVEMENT la donnée brute, exacte, sans description ni parenthèses.
   - IP : "185.220.101.5" et JAMAIS "[IP Adress] (Requête...)"
   - IBAN : "FR763000..." et JAMAIS "IBAN1"
   - Domaine : "k-digital.com" et JAMAIS "Domaine suspect k-digital.com"
   - E-mail : "contact@k-digital.com" et JAMAIS "l'e-mail de contact"
2. Le contexte et la justification vont dans NOTES, jamais dans VALUE.
3. DÉDUPLICATION : ne propose jamais une valeur déjà présente dans « VALEURS DÉJÀ PRÉSENTES ».
4. Maximum 12 entités. Choisis les pivots les plus utiles.

Format strict, 4 lignes par entité :
- TYPE: [type]
- VALUE: [valeur brute exacte]
- NOTES: [contexte court ; si c'est une supposition, commence par « Hypothèse à vérifier : »]
- ---

Types valides (recopie exactement l'un de ces mots) : PSEUDO, EMAIL, TELEPHONE, PERSONNE, ORGANISATION, URL, DOMAINE, HOSTNAME, IP, ASN, HASH, SSL_CERT, TTP, LOCALISATION, COMPTE_SOCIAL, PHOTO, IBAN, CRYPTO, NOTE
Si aucune nouvelle entité, écris : (aucune nouvelle entité)

=== LIENS SUGGÉRÉS ===
Une relation par ligne, au format exact : SOURCE → CIBLE
Utilise EXACTEMENT la valeur brute, telle qu'écrite dans VALUE ou déjà présente dans le dossier. Aucune phrase, aucune ponctuation autour.
Si aucun lien, écris : (aucun lien)`;
}

/**
 * Types émis par le modèle → types canoniques de `EntityType`.
 *
 * Le prompt demande des libellés en majuscules lisibles, mais le store attend
 * les clés exactes de `ENTITY_COLORS` / `ENTITY_ICON_NAMES` / `ENTITY_FIELDS`.
 * Sans cette table, un nœud injecté recevait `entityType: 'EMAIL'` : couleur par
 * défaut, icône « Globe » et aucun champ structuré — la donnée était sur le
 * graphe mais inexploitable.
 */
const ENTITY_TYPE_MAP: Record<string, string> = {
  PSEUDO: 'username',
  USERNAME: 'username',
  COMPTE_SOCIAL: 'social',
  SOCIAL: 'social',
  EMAIL: 'email',
  MAIL: 'email',
  TELEPHONE: 'phone',
  PHONE: 'phone',
  NOM: 'person',
  PRENOM: 'person',
  PERSONNE: 'person',
  PERSON: 'person',
  ORGANISATION: 'organization',
  ORGANIZATION: 'organization',
  URL: 'url',
  DOMAINE: 'domain',
  DOMAIN: 'domain',
  HOSTNAME: 'hostname',
  IP: 'ip',
  ASN: 'asn',
  HASH: 'hash',
  SSL_CERT: 'sslcert',
  SSLCERT: 'sslcert',
  TTP: 'ttp',
  LOCALISATION: 'location',
  LOCATION: 'location',
  PHOTO: 'photo',
  IBAN: 'iban',
  CRYPTO: 'crypto',
  FICHIER: 'file',
  FILE: 'file',
  VEHICULE: 'note',
  NOTE: 'note',
};

function normalizeEntityType(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ENTITY_TYPE_MAP[key] ?? 'note';
}

/**
 * Filet de sécurité déterministe : relève dans le rapport les identifiants
 * concrets qui n'ont pas été listés comme entités.
 *
 * Compter sur la consigne du prompt ne suffit pas — un petit modèle l'oublie une
 * fois sur deux, et l'analyste se retrouve avec un rapport qui parle de quatre
 * adresses e-mail et une seule entité injectable. Ici, ce qui est écrit dans le
 * texte est relevé mécaniquement, donc rien ne se perd.
 */
function scanIdentifiers(text: string): { found: { type: string; value: string }[]; residual: string } {
  const found: { type: string; value: string }[] = [];
  let rest = text;

  const take = (pattern: RegExp, type: string, clean?: (value: string) => string) => {
    rest = rest.replace(pattern, (match) => {
      const value = (clean ? clean(match) : match).trim();
      if (value) found.push({ type, value });
      return ' ';
    });
  };

  // Les e-mails d'abord : sinon leur domaine serait aussi relevé comme domaine.
  take(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'email');
  // Puis les URL, pour la même raison vis-à-vis de leur hôte.
  take(/\bhttps?:\/\/[^\s<>"'`)\]]+/gi, 'url', (value) => value.replace(/[.,;:]+$/, ''));
  take(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 'ip');
  // Téléphone : uniquement la forme internationale, sinon les dates et les
  // identifiants numériques seraient pris pour des numéros.
  take(/\+\d{1,3}[\s.-]?(?:\d[\s.-]?){7,13}\d/g, 'phone', (value) => value.replace(/[\s.-]+/g, ' ').trim());
  take(
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|me|ru|cn|fr|de|info|xyz|top|onion|co|biz|site|online|shop|app|dev|gov|edu)\b/gi,
    'domain'
  );
  take(/(?:^|[\s(])@([A-Za-z0-9_]{3,32})\b/g, 'username', (value) => value.replace(/^[\s(]+/, ''));

  return { found, residual: rest };
}

function extractMentionedIdentifiers(text: string): { type: string; value: string }[] {
  return scanIdentifiers(text).found;
}

/**
 * Vocabulaire d'infrastructure qu'un modèle invente le plus volontiers.
 *
 * Un nom d'hébergeur, un CDN, un pays ne ressemblent à aucun identifiant : les
 * expressions régulières ci-dessus ne les voient pas. C'est exactement par là
 * que passait le mensonge le plus coûteux — un rapport qui attribue une IP à
 * « l'ASN Cloudflare » ou à « Hetzner, Nuremberg » alors que le dossier ne
 * contient aucune donnée d'hébergement. Cette liste n'est pas une source de
 * vérité : elle sert de filet, et un nom qu'elle trouve est confronté au
 * dossier avant d'être signalé.
 */
const INFRA_VENDORS = [
  'cloudflare', 'akamai', 'fastly', 'stackpath', 'bunnycdn', 'bunny cdn', 'sucuri', 'imperva',
  'amazon', 'amazon web services', 'aws', 'google cloud', 'azure', 'microsoft azure',
  'oracle cloud', 'alibaba cloud', 'alicloud', 'tencent cloud', 'hetzner', 'hostinger',
  'ovhcloud', 'scaleway', 'online.net', 'digitalocean', 'digital ocean', 'linode',
  'vultr', 'contabo', 'ionos', '1&1', 'namecheap', 'godaddy', 'gandi', 'reg.ru', 'timeweb',
  'selectel', 'beget', 'hostgator', 'bluehost', 'siteground', 'dreamhost', 'leaseweb',
  'serverius', 'psychz', 'colocrossing', 'quadranet', 'm247', 'frantech', 'buyvm',
  'hostwinds', 'racknerd', 'sharktech', 'koddos', 'flokinet', 'abelohost', 'prq',
  'bahnhof', 'worldstream', 'serverion', 'nforce', 'cherryservers', 'hostkey', 'aeza',
  'the.hosting', 'cloudzy', 'kamatera', 'hostens', 'hostpapa', 'ipower', 'a2 hosting',
];

/** Pays et villes d'hébergement : mêmes dégâts quand ils sont inventés. */
const GEO_NAMES = [
  'allemagne', 'germany', 'autriche', 'austria', 'belgique', 'belgium', 'brésil', 'brazil',
  'bulgarie', 'bulgaria', 'canada', 'chine', 'china', 'chypre', 'cyprus', 'colombie',
  'colombia', 'corée du sud', 'south korea', 'croatie', 'croatia', 'danemark', 'denmark',
  'égypte', 'egypt', 'émirats arabes unis', 'united arab emirates', 'espagne', 'spain',
  'estonie', 'estonia', 'états-unis', 'united states', 'finlande', 'finland', 'france',
  'grèce', 'greece', 'hongrie', 'hungary', 'inde', 'india', 'indonésie', 'indonesia',
  'iran', 'irlande', 'ireland', 'islande', 'iceland', 'israël', 'israel', 'italie',
  'italy', 'japon', 'japan', 'kazakhstan', 'lettonie', 'latvia', 'lituanie', 'lithuania',
  'luxembourg', 'malaisie', 'malaysia', 'malte', 'malta', 'maroc', 'morocco', 'mexique',
  'mexico', 'moldavie', 'moldova', 'nigeria', 'norvège', 'norway', 'nouvelle-zélande',
  'new zealand', 'pakistan', 'panama', 'pays-bas', 'netherlands', 'pérou', 'peru',
  'philippines', 'pologne', 'poland', 'portugal', 'république tchèque', 'czech republic',
  'czechia', 'roumanie', 'romania', 'royaume-uni', 'united kingdom', 'russie', 'russia',
  'arabie saoudite', 'saudi arabia', 'serbie', 'serbia', 'singapour', 'singapore',
  'slovaquie', 'slovakia', 'slovénie', 'slovenia', 'afrique du sud', 'south africa',
  'suède', 'sweden', 'suisse', 'switzerland', 'thaïlande', 'thailand', 'turquie',
  'turkey', 'ukraine', 'vietnam', 'seychelles', 'belize', 'costa rica', 'géorgie',
  'arménie', 'armenia', 'azerbaïdjan', 'azerbaijan', 'biélorussie', 'belarus', 'kosovo',
  'monténégro', 'montenegro', 'bosnie', 'albanie', 'albania', 'moldavie', 'malaisie',
  'nuremberg', 'francfort', 'frankfurt', 'amsterdam', 'paris', 'roubaix', 'gravelines',
  'strasbourg', 'marseille', 'lyon', 'londres', 'london', 'manchester', 'dublin',
  'new york', 'los angeles', 'dallas', 'chicago', 'seattle', 'miami', 'ashburn',
  'san francisco', 'tokyo', 'moscou', 'moscow', 'saint-pétersbourg', 'kyiv', 'kiev',
  'varsovie', 'warsaw', 'prague', 'vienne', 'vienna', 'zurich', 'genève', 'geneva',
  'milan', 'madrid', 'barcelone', 'barcelona', 'lisbonne', 'lisbon', 'bucarest',
  'bucharest', 'sofia', 'istanbul', 'dubaï', 'dubai', 'mumbai', 'sydney', 'toronto',
  'montréal', 'montreal', 'são paulo', 'sao paulo', 'riga', 'tallinn', 'vilnius',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Vrai si `token` apparaît comme mot entier dans `haystack`.
 *
 * `String.includes()` ne convient pas : « usage » contient « usa » et
 * « pukka » contient « uk ». Les frontières explicites évitent ces faux
 * positifs, qui rendraient l'alerte elle-même suspecte.
 */
function hasToken(haystack: string, token: string): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(token)}($|[^\\p{L}\\p{N}])`, 'iu');
  return pattern.test(haystack);
}

/**
 * Le nom cité est-il étayé par le dossier ?
 *
 * On accepte un nom de famille plus long : « Hostinger » est étayé par
 * « Hostinger International Ltd », « OVHcloud » par « OVH ». Ce relâchement est
 * réservé aux noms d'au moins quatre lettres, sans quoi « usa » serait reconnu
 * dans « usage » et l'alerte perdrait toute crédibilité.
 */
function mentionsKnown(knownBlob: string, name: string): boolean {
  if (hasToken(knownBlob, name)) return true;
  if (name.length < 4) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(name)}`, 'iu').test(knownBlob);
}

/**
 * Relève les noms d'infrastructure et de géographie cités dans le rapport.
 *
 * On travaille sur le texte *résiduel* — celui dont les identifiants ont été
 * retirés — pour ne pas signaler « hostinger » dans `contact@hostinger.fr`,
 * qui est une donnée réelle du dossier et non une invention.
 */
function extractNamedTechnicalValues(text: string): string[] {
  const residual = scanIdentifiers(text).residual;
  const found: string[] = [];

  // ASN : « AS13335 », « AS-13335 », « HETZNER-AS ».
  for (const match of residual.matchAll(/\b(?:AS-?\d{2,7}|[A-Z][A-Z0-9]{1,}-AS)\b/g)) {
    found.push(match[0]);
  }

  for (const name of [...INFRA_VENDORS, ...GEO_NAMES]) {
    if (hasToken(residual, name)) found.push(name);
  }

  return found;
}

/** Exporté pour les tests : la lecture de la réponse du modèle est le point
 *  où se joue la différence entre un rapport lisible et des pivots exploitables. */
export function parseOllamaTextToDiscovery(text: string): HermesDiscovery {
  const analyseMatch = text.match(/===\s*ANALYSE\s*===\s*\n([\s\S]*?)(?:===\s*NOUVELLES ENTIT[ÉE]S?\s*===|$)/i);
  const entitesMatch = text.match(
    /===\s*NOUVELLES ENTIT[ÉE]S?\s*===\s*\n([\s\S]*?)(?:===\s*LIENS|$)/i
  );
  const liensMatch = text.match(/===\s*LIENS[^=\n]*===\s*\n([\s\S]*?)$/i);

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
          entities.push({ type: normalizeEntityType(t), label: v, properties: notes ? { notes } : undefined });
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
          if (type && label) entities.push({ type: normalizeEntityType(type), label });
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
        if (type && label && /^[A-Z_]+$/.test(type)) entities.push({ type: normalizeEntityType(type), label });
      }
    }
  }

  if (liensMatch) {
    for (const line of liensMatch[1].split('\n')) {
      const cleaned = line.replace(/^[-*]\s*/, '').trim();
      if (!cleaned || /^\(aucun/i.test(cleaned)) continue;
      const parts = cleaned.split(/\s*(?:→|->|=>|\|)\s*/);
      if (parts.length < 2) continue;
      const source = parts[0].trim();
      const target = parts[1].trim();
      if (source && target) relations.push({ source, target, type: 'associated' });
    }
  }

  if (!summary) summary = text.slice(0, 2000).trim();

  // Rattrapage : tout identifiant écrit dans le rapport mais absent de la liste
  // devient une entité. Sans cela, un rapport qui parle de quatre adresses
  // e-mail n'en rendait qu'une injectable.
  const known = new Set(entities.map((entity) => entity.label.trim().toLowerCase()));
  for (const mention of extractMentionedIdentifiers(summary)) {
    const key = mention.value.trim().toLowerCase();
    if (!key || known.has(key)) continue;
    known.add(key);
    entities.push({ type: mention.type, label: mention.value, properties: { notes: 'Cité dans l’analyse.' } });
  }

  return { entities, relations, summary };
}

/**
 * Confronte le rapport au dossier.
 *
 * Une consigne ne suffit pas : sur un 9 B, la règle « n'affirme que ce que les
 * données contiennent » est ignorée une fois sur deux, et le rapport se met à
 * citer un ASN ou un hébergeur sortis de nulle part. L'app peut, elle, faire la
 * vérification mécaniquement.
 *
 * Deux familles de valeurs sont contrôlées :
 *  - les identifiants (e-mail, IP, domaine…), qui sont de toute façon rattrapés
 *    comme entités — ce contrôle ne sert plus que de garde-fou ;
 *  - les noms d'infrastructure et de géographie, qui ne ressemblent à aucun
 *    identifiant et passaient donc sous tous les radars. C'est par là que
 *    fuyait le mensonge le plus coûteux : « l'ASN Cloudflare », « Hetzner,
 *    Nuremberg » sur un dossier qui ne contient aucune donnée d'hébergement.
 *
 * Un nom non étayé n'est pas seulement signalé : il est remplacé dans le texte
 * par « [non renseigné] ». Signaler sans corriger laisse le lecteur croire ce
 * qu'il lit — et c'est justement ce qu'on cherche à empêcher. Les hypothèses
 * explicitement annoncées (« Hypothèse à vérifier : … ») sont conservées
 * telles quelles : elles sont signalées, pas effacées, car une hypothèse
 * nommée n'est pas une affirmation déguisée.
 */
const UNSUPPORTED_MARKER = '[non renseigné]';
const HYPOTHESIS_MARKER = /hypoth[èe]se/i;

function sanitizeNamedClaims(summary: string, knownBlob: string, unsupported: Set<string>): string {
  // Découpage en phrases : la décision « hypothèse ou affirmation » se prend à
  // cette échelle, pas sur le rapport entier. On insère un séparateur après la
  // ponctuation finale plutôt que d'utiliser une assertion arrière — Vite cible
  // Safari 14, qui ne les connaît pas, et le build échouerait.
  const sentences = summary.replace(/([.!?…])\s+/g, '$1\u0000').split(/\u0000|\n+/);
  const cleaned = sentences.map((sentence) => {
    const names = extractNamedTechnicalValues(sentence).filter((name) => !mentionsKnown(knownBlob, name));
    if (names.length === 0) return sentence;

    names.forEach((name) => unsupported.add(name));
    if (HYPOTHESIS_MARKER.test(sentence)) return sentence;

    let next = sentence;
    for (const name of names) {
      // Le caractère de gauche est capturé puis restitué : sans assertion
      // arrière, c'est la seule façon de respecter la frontière de mot.
      next = next.replace(
        new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, 'giu'),
        `$1${UNSUPPORTED_MARKER}`
      );
    }
    return next;
  });

  return cleaned.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Exporté pour les tests : c'est ici que se joue la différence entre un
 *  rapport honnête et un rapport qui invente un hébergeur. */
export function flagUnsupportedClaims(
  discovery: HermesDiscovery,
  graphData: { nodes: any[]; edges: any[] }
): HermesDiscovery {
  const known = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value ?? '').trim().toLowerCase();
    if (text) known.add(text);
  };

  for (const node of graphData.nodes) {
    add(node.data?.label);
    if (node.data?.fields) Object.values(node.data.fields).forEach(add);
  }
  // Ce que le modèle propose EST le résultat : une valeur qu'il cite et qu'il
  // liste n'est pas une invention, c'est sa découverte.
  discovery.entities.forEach((entity) => add(entity.label));

  const unsupported = new Set<string>();

  for (const mention of extractMentionedIdentifiers(discovery.summary)) {
    if (!known.has(mention.value.trim().toLowerCase())) unsupported.add(mention.value);
  }

  const knownBlob = Array.from(known).join(' | ');
  const summary = sanitizeNamedClaims(discovery.summary, knownBlob, unsupported);

  return { ...discovery, summary, unsupported: Array.from(unsupported) };
}

async function runLocalAnalysis(
  graphData: { nodes: any[]; edges: any[] },
  analystName?: string,
  onProgress?: (progress: OllamaProgress) => void
): Promise<HermesDiscovery> {
  const model = getOllamaModel();
  if (!model) {
    throw new Error('Aucun modèle Ollama sélectionné. Choisis un modèle dans le menu de configuration avant de lancer l\'analyse.');
  }
  const analyst = analystName?.trim() || 'Analyste';
  const base = {
    model,
    // Le cadrage part en message système : c'est là que les modèles
    // d'instruction accordent le plus de poids aux interdits.
    system: buildAnalysisSystemPrompt(analyst),
    prompt: buildGraphPrompt(graphData, analystName),
    options: {
      num_predict: OLLAMA_MAX_TOKENS,
      // Une température basse réduit la dérive narrative. À 0 le modèle est
      // déterministe, ce qui convient à de l'extraction factuelle.
      temperature: 0.2,
    },
  };

  let text: string;
  try {
    text = await ollamaGenerate({ ...base, think: false }, onProgress);
  } catch (error) {
    // `think` n'existe que depuis Ollama 0.12 : sur une version plus ancienne
    // le champ est refusé. On réessaie sans lui plutôt que d'échouer.
    if (/think/i.test((error as Error).message) && /HTTP 400/.test((error as Error).message)) {
      text = await ollamaGenerate(base, onProgress);
    } else {
      throw error;
    }
  }

  if (!text.trim()) throw new Error('Ollama a renvoyé une réponse vide.');
  return flagUnsupportedClaims(parseOllamaTextToDiscovery(text), graphData);
}

// ── FreeLLMAPI backend (OpenAI-compatible gateway) ───────────────────────────
// FreeLLMAPI (https://freellmapi.co) is a self-hosted, OpenAI-compatible router
// that aggregates the free tiers of many providers behind a single API key.
// Any OpenAI client works: just point the base URL at your router and use your key.

// The FreeLLMAPI *desktop app* — the install the tutorial tells people to use —
// listens on 127.0.0.1:31415 (its own `config.json` sets `"port": 31415`). The
// 3001 default only applies to a standalone / Docker router. Defaulting to 3001
// made a working desktop install look broken out of the box.
export const DEFAULT_FREELLM_BASE_URL = 'http://127.0.0.1:31415/v1';

// `auto` is a real id in the router's catalogue and means "pick for me, and
// fail over when a free tier runs out" — the same thing the Auto checkbox asks
// for. The previous default named a model the catalogue does not contain
// (`deepseek-ai/DeepSeek-V4.1-Flash`; the real ids are `deepseek-v4-flash`,
// `deepseek-v4-flash-0731`, `deepseek-v4-pro`), so with Auto unchecked and the
// field left empty every analysis failed with a 400 that read like a bug in
// the app. `isFreeLlmAutoEffective()` already treats `auto` as auto mode, so
// this default sends no `model` field at all.
export const DEFAULT_FREELLM_MODEL = 'auto';

/** Env var the FreeLLMAPI router reads to extend its CORS origin allowlist. */
export const FREELLM_ORIGINS_ENV = 'DASHBOARD_ORIGINS';

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

// ── Why a loopback router looks "injoignable" ────────────────────────────────
// The FreeLLMAPI router *does* run a CORS middleware, but behind a strict origin
// allowlist (see its `server/src/app.ts`):
//
//   const DEFAULT_DASHBOARD_ORIGINS = [
//     'http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173',
//   ];
//   const allowedCorsOrigins =
//     new Set([...DEFAULT_DASHBOARD_ORIGINS, ...cfg.dashboardOrigins]);
//   app.use(cors({
//     origin: (origin, cb) => cb(null, !origin || allowedCorsOrigins.has(origin)),
//   }));
//
// The middleware is registered globally, so it covers `/v1/chat/completions`
// too — but when the calling origin is not in that set it simply *omits*
// `Access-Control-Allow-Origin`. The browser then throws away the response and
// `fetch()` rejects with a generic network error, which surfaced here as
// "FreeLLMAPI est injoignable" while the router was answering perfectly.
//
// That explains the whole symptom: it always worked under `npm run dev` (port
// 5173 is allowlisted by default) and always failed from a hosted origin such as
// https://tracker.query-intel.com. Verified against a live router:
//   Origin: http://localhost:5173        -> Access-Control-Allow-Origin: http://localhost:5173
//   Origin: https://tracker.query-intel.com -> (header absent, response unusable)
//
// `cfg.dashboardOrigins` is filled from the DASHBOARD_ORIGINS environment
// variable (comma separated). That is the real fix, and it has to be set on the
// *visitor's* machine, then the router restarted.
//
// As a fallback for users who cannot touch their environment, the Vite
// dev/preview server exposes `/api/llm`, forwarding to the real address carried
// by the `x-llm-target` header. Same-origin means there is no CORS to negotiate
// at all. See `vite-plugin-llm-proxy.ts`. On static hosting that proxy does not
// exist, so `llmFetch` falls back to a direct call.

/** Path of the same-origin proxy exposed by the Vite plugin. */
export const LLM_PROXY_PATH = '/api/llm';

/** Header carrying the real target the browser cannot reach directly. */
const LLM_TARGET_HEADER = 'x-llm-target';

/** Marker set by the proxy; its absence means the plugin is not serving. */
const LLM_PROXY_MARKER = 'x-llm-proxy';

/** Hosts routed through the proxy instead of being called directly. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Whether the page itself is served from a loopback origin (dev / preview).
 * When it is not, the router's CORS allowlist is the thing that will bite — so
 * the UI only shows the DASHBOARD_ORIGINS hint in that case.
 */
export function isLoopbackOrigin(): boolean {
  if (typeof window === 'undefined') return true;
  return LOOPBACK_HOSTS.has(window.location.hostname);
}

/**
 * `fetch` for LLM backends. Loopback targets go through the same-origin proxy so
 * the browser never negotiates CORS; anything else is called directly. If the
 * proxy is absent (static hosting of `dist/`, without the Vite plugin) we fall
 * back to a direct call rather than breaking silently.
 */
export async function llmFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (typeof window === 'undefined' || !isLoopbackUrl(url)) {
    return fetch(url, init);
  }

  const headers = new Headers(init.headers);
  headers.set(LLM_TARGET_HEADER, url);

  try {
    const proxied = await fetch(LLM_PROXY_PATH, { ...init, headers });
    // The marker proves the Vite plugin answered, rather than the SPA fallback.
    if (proxied.headers.get(LLM_PROXY_MARKER) === '1') return proxied;
  } catch {
    // Proxy unreachable — fall through to the direct call below.
  }
  return fetch(url, init);
}

/**
 * Tell "the router is down" apart from "the browser refused the response".
 *
 * A CORS rejection and a refused connection both land in `catch` as the same
 * opaque `TypeError: Failed to fetch`, so the old message blamed the router even
 * when it was answering fine. A `no-cors` request is exempt from the origin
 * policy: if it resolves, *something* answered on that port and the real problem
 * is the CORS allowlist — exactly what every visitor hit on the public link.
 */
async function probeLoopbackReachable(url: string): Promise<boolean> {
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(4000)
        : undefined;
    await fetch(url, { method: 'POST', mode: 'no-cors', body: '{}', signal });
    return true;
  } catch {
    return false;
  }
}

/** Actionable "injoignable" message, specialised on the reachability probe. */
function freeLlmUnreachableError(url: string, reachable: boolean): Error {
  // The page's own origin is what the router's allowlist has to contain — and
  // it is the one thing nobody can guess, because the same deployment is often
  // reachable under several domains. Print it ready to paste, rather than a
  // placeholder that sent people off to declare the wrong one.
  const origin =
    typeof window !== 'undefined' && window.location ? window.location.origin : 'https://ton-domaine.tld';
  const lines = [
    `FreeLLMAPI est injoignable depuis cette page (${url}).`,
    '',
    `Origine de cette page : ${origin}`,
    '',
  ];

  if (reachable) {
    lines.push(
      "Le routeur répond bien : c'est le navigateur qui refuse de lire la réponse (CORS).",
      '',
      "Le routeur FreeLLMAPI n'autorise que les origines de sa liste (par défaut localhost:5173),",
      "et celle de cette page n'en fait pas partie.",
      '',
      `Ajoute-la à ${FREELLM_ORIGINS_ENV}, puis RELANCE FreeLLMAPI (la variable n'est lue`,
      "qu'au démarrage) :",
      '',
      `  • Windows      : setx DASHBOARD_ORIGINS "${origin}"`,
      `  • macOS/Linux  : export DASHBOARD_ORIGINS="${origin}"`,
      '',
      'Plusieurs origines : sépare-les par des virgules.',
      '',
      "⚠️ Vérifie que c'est bien CETTE adresse que tu as déclarée : un même site peut",
      "être servi sous plusieurs domaines, et seul celui de la barre d'adresse compte.",
      "Une origine déclarée pour tracker.exemple.com n'ouvre rien pour tracker.autre.tld."
    );
  } else {
    lines.push(
      'Aucune réponse sur ce port. Deux causes possibles :',
      '',
      "1. Le routeur n'est pas démarré. Lance FreeLLMAPI et vérifie que l'URL de base",
      '   est celle de « Copy base URL » (app de bureau : http://127.0.0.1:31415/v1 —',
      '   auto-hébergé : http://localhost:3001/v1).',
      '',
      '2. Chrome a bloqué la requête avant qu\'elle parte. Depuis Chrome 138, un site',
      '   public doit obtenir ton accord pour joindre 127.0.0.1 : réponds « Autoriser »',
      '   à l\'invite « Accéder aux appareils de votre réseau local ». Ce blocage frappe',
      '   aussi Ollama. Vérifie aussi tes extensions et ton VPN.'
    );
  }

  return new Error(lines.join('\n'));
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
  const analyst = analystName?.trim() || 'Analyste';
  const messages = [
    // Le cadrage en message système, pas noyé dans le message utilisateur :
    // c'est ce qui distingue une consigne qu'on suit d'une consigne qu'on lit.
    { role: 'system', content: buildAnalysisSystemPrompt(analyst) },
    { role: 'user', content: buildGraphPrompt(graphData, analystName) },
  ];
  const payload = buildFreeLlmPayload(messages, {
    // Sans ces deux champs, le routeur applique les défauts du fournisseur :
    // température créative et sortie non bornée, d'où les rapports qui
    // inventaient une IP, un hébergeur et une ville.
    temperature: 0.2,
    max_tokens: OLLAMA_MAX_TOKENS,
  });

  let response: Response;
  try {
    response = await llmFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      // Même raison que côté Ollama : sans borne, une requête acceptée puis
      // abandonnée par le routeur laisse le bouton tourner indéfiniment.
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(120_000)
          : undefined,
    });
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(
        'FreeLLMAPI n\'a pas répondu en 2 min : la requête a été interrompue.\n\n' +
          'Le routeur est peut-être saturé, ou aucun fournisseur de la chaîne de repli ne répond. ' +
          'Réessaie, ou choisis un modèle précis au lieu du mode Auto.'
      );
    }
    throw freeLlmUnreachableError(url, await probeLoopbackReachable(url));
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
  return flagUnsupportedClaims(parseOllamaTextToDiscovery(text), graphData);
}

export async function runAnalysis(
  mode: AnalysisMode,
  graphData: { nodes: any[]; edges: any[] },
  analystName?: string,
  onProgress?: (progress: OllamaProgress) => void
): Promise<HermesDiscovery> {
  if (mode === 'local') return runLocalAnalysis(graphData, analystName, onProgress);
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
    response = await llmFetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${key}` },
    });
  } catch {
    throw freeLlmUnreachableError(url, await probeLoopbackReachable(url));
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
    const res = await llmFetch(getFreeLlmChatUrl(), {
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
