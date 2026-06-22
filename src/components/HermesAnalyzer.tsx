import React, { useState } from 'react';
import { queryHermes, HermesMessage } from '../hermesService';
import type { CaseData, EntityNode, EntityType } from '../types';
import type { Edge } from '@xyflow/react';

interface Props {
  nodes: EntityNode[];
  edges: Edge[];
  activeCase: CaseData | null;
  addEntity: (entityType: EntityType, label: string, position?: { x: number; y: number }) => string;
}

interface SuggestedEntity {
  label: string;
  entityType: EntityType;
  rawType: string;
}

const ENTITY_TYPE_MAP: Record<string, EntityType> = {
  ip: 'ip',
  'adresse ip': 'ip',
  domaine: 'domain',
  domain: 'domain',
  email: 'email',
  'e-mail': 'email',
  pseudo: 'username',
  username: 'username',
  pseudonyme: 'username',
  téléphone: 'phone',
  telephone: 'phone',
  numéro: 'phone',
  numero: 'phone',
  localisation: 'location',
  location: 'location',
  organisation: 'organization',
  organization: 'organization',
  entreprise: 'organization',
  personne: 'person',
  person: 'person',
  nom: 'person',
  url: 'url',
  lien: 'url',
  crypto: 'crypto',
  wallet: 'crypto',
  fichier: 'file',
  file: 'file',
  // Financial identifiers
  iban: 'crypto',
  'compte bancaire': 'crypto',
  'bank account': 'crypto',
  virement: 'crypto',
  rib: 'crypto',
  bic: 'crypto',
  swift: 'crypto',
};

// Raw types that belong to the "financial" display group (green highlight)
const FINANCIAL_RAW_TYPES = new Set(['iban', 'compte bancaire', 'bank account', 'virement', 'rib', 'bic', 'swift']);

function parseEntities(text: string): SuggestedEntity[] {
  const results: SuggestedEntity[] = [];
  const seen = new Set<string>();

  const linePattern = /\*{0,2}([a-zA-Zéèêàù\s]+?)\*{0,2}\s*[:\-–]\s*(.+)/gi;
  let match;
  while ((match = linePattern.exec(text)) !== null) {
    const rawType = match[1].trim().toLowerCase();
    const rawLabel = match[2].trim().replace(/[`"'*]/g, '').split(/[,\n]/)[0].trim();
    const entityType = ENTITY_TYPE_MAP[rawType];
    if (entityType && rawLabel && rawLabel.length > 1 && rawLabel.length < 100) {
      const key = `${entityType}:${rawLabel}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ label: rawLabel, entityType, rawType });
      }
    }
  }

  return results;
}

export const HermesAnalyzer: React.FC<Props> = ({ nodes, edges, activeCase, addEntity }) => {
  const [report, setReport] = useState('');
  const [suggestedEntities, setSuggestedEntities] = useState<SuggestedEntity[]>([]);
  const [injected, setInjected] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const targetNode =
    nodes.find((n) => n.data?.entityType === 'username') ||
    nodes.find((n) => n.data?.entityType === 'person') ||
    nodes[0];

  const targetValue = targetNode?.data?.label || 'inconnu';

  const projectCwd: string | undefined = activeCase
    ? (activeCase.projectPath?.trim() ||
        `~/ghostint-cases/${activeCase.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-.]/g, '')}`)
    : undefined;

  const triggerHermesAnalysis = async () => {
    setIsProcessing(true);
    setReport('');
    setSuggestedEntities([]);
    setInjected(new Set());

    const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

    const cleanNodes = nodes
      .map((n) => {
        const label = n.data?.label?.trim() || '(sans nom)';
        const type = n.data?.entityType || 'entité';
        return `- ${type}: ${label}${n.data?.notes ? ` [note: ${n.data.notes}]` : ''}`;
      })
      .join('\n');

    const cleanEdges = edges
      .map((e) => {
        const src = nodeIndex.get(e.source);
        const tgt = nodeIndex.get(e.target);
        const fromLabel = src?.data?.label?.trim() || src?.data?.entityType || '(inconnu)';
        const toLabel = tgt?.data?.label?.trim() || tgt?.data?.entityType || '(inconnu)';
        const rel = (e as any).label?.trim();
        return rel
          ? `- ${fromLabel} —[${rel}]→ ${toLabel}`
          : `- ${fromLabel} → ${toLabel}`;
      })
      .join('\n');

    const graphText = `ENTITÉS CONNUES (${nodes.length}) :\n${cleanNodes || '(aucune)'}\n\nRELATIONS (${edges.length}) :\n${cleanEdges || '(aucune)'}`;

    const systemPrompt = `Tu es Hermes, agent OSINT autonome. Tu travailles en binôme avec l'opérateur José. Tu prends en charge l'investigation en tâche de fond et tu lui rapportes uniquement les NOUVELLES informations que tu as trouvées — des éléments qu'il ne voit pas encore sur son écran.

RÈGLES ABSOLUES :
- Adresse-toi directement à José à la première personne, comme un coéquipier de terrain.
- N'affiche JAMAIS d'identifiants techniques (chaînes aléatoires). Utilise les vrais noms, pseudos, numéros.
- Ne répète pas ce qui est déjà dans le graphe. Apporte du NOUVEAU.
- Simule une investigation active : parle comme si tu venais de croiser des registres, des bases de fuites, des index OSINT.
- Sois concis, direct, factuel. Ton rapport doit tenir en quelques paragraphes denses.

STRUCTURE DE TA RÉPONSE :

Commence par : "José, j'ai pris le relais sur [cible]. En fouillant en parallèle, voici ce que j'ai découvert que tu n'as pas encore :"

Puis liste les découvertes sous ces rubriques exactes (si applicable) :

Nom: [nom complet trouvé]
Pseudo: [alias détecté]
Téléphone: [numéro trouvé]
Email: [email trouvé]
IP: [adresse IP associée]
Domaine: [domaine lié]
Organisation: [entreprise ou structure]
Localisation: [ville, région ou coordonnées]
URL: [lien direct exploitable]
IBAN: [numéro IBAN si trouvé]
Compte bancaire: [RIB, BIC/SWIFT ou détails compte si trouvé]

Termine par une phrase sur l'angle d'investigation à prioriser.

IMPORTANT : Chaque "Nom:", "Téléphone:", "IP:", etc. doit être sur sa propre ligne avec la valeur directement après le deux-points. Ces lignes serviront à injecter les entités dans le graphe.`;

    const context: HermesMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Dossier : "${activeCase?.name ?? 'Sans titre'}"\nCible principale : "${targetValue}"\n\n${graphText}\n\nLance l'investigation en tâche de fond et rapporte-moi tes découvertes.`,
      },
    ];

    try {
      const res = await queryHermes(context, projectCwd);
      setReport(res);
      setSuggestedEntities(parseEntities(res));
    } catch (err: any) {
      setReport('ÉCHEC — Hermes Core hors ligne.\n' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInject = (entity: SuggestedEntity) => {
    const key = `${entity.entityType}:${entity.label}`;
    if (injected.has(key)) return;
    addEntity(entity.entityType, entity.label);
    setInjected((prev) => new Set(prev).add(key));
  };

  const handleInjectAll = () => {
    suggestedEntities.forEach((e) => {
      const key = `${e.entityType}:${e.label}`;
      if (!injected.has(key)) {
        addEntity(e.entityType, e.label);
      }
    });
    setInjected(new Set(suggestedEntities.map((e) => `${e.entityType}:${e.label}`)));
  };

  const handleSave = () => {
    if (!report) return;
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hermes_${targetValue}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const allInjected =
    suggestedEntities.length > 0 &&
    suggestedEntities.every((e) => injected.has(`${e.entityType}:${e.label}`));

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: '100%',
        maxWidth: '560px',
      }}
      className="flex flex-col items-center gap-2 px-4"
    >
      {report && !isMinimized && (
        <div className="w-full bg-[#0d111c]/95 border border-purple-900/60 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden">
          <div className="h-48 overflow-y-auto p-4 text-gray-300 text-xs custom-scrollbar">
            <div className="whitespace-pre-wrap font-mono">{report}</div>
          </div>

          {suggestedEntities.length > 0 && (
            <div className="border-t border-purple-900/40 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-purple-400 text-xs font-semibold tracking-wide uppercase">
                  {suggestedEntities.length} entité{suggestedEntities.length > 1 ? 's' : ''} détectée{suggestedEntities.length > 1 ? 's' : ''}
                </span>
                {!allInjected && (
                  <button
                    onClick={handleInjectAll}
                    className="text-xs px-2 py-1 rounded bg-purple-700/50 hover:bg-purple-600/60 text-purple-200 transition-colors"
                  >
                    Tout injecter
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {suggestedEntities.map((e) => {
                  const key = `${e.entityType}:${e.label}`;
                  const done = injected.has(key);
                  const isFinancial = FINANCIAL_RAW_TYPES.has(e.rawType);
                  return (
                    <button
                      key={key}
                      onClick={() => handleInject(e)}
                      disabled={done}
                      title={`${e.rawType}: ${e.label}`}
                      className={`text-xs px-2 py-1 rounded border transition-colors text-left break-all whitespace-normal ${
                        done
                          ? 'border-green-700/50 bg-green-900/20 text-green-400 cursor-default'
                          : isFinancial
                          ? 'border-emerald-600/60 bg-emerald-900/25 text-emerald-300 hover:bg-emerald-700/35 cursor-pointer'
                          : 'border-purple-700/50 bg-purple-900/20 text-purple-300 hover:bg-purple-700/40 cursor-pointer'
                      }`}
                      style={{ userSelect: 'text' }}
                    >
                      {done ? '✓ ' : '+ '}
                      <span className="opacity-60 mr-1">[{e.rawType}]</span>
                      <span style={{ userSelect: 'text' }}>{e.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-1 bg-[#0b0f19]/95 border border-purple-900/50 p-2 rounded-xl shadow-2xl backdrop-blur-md">
        <button
          onClick={triggerHermesAnalysis}
          disabled={isProcessing}
          title={isProcessing ? 'Investigation en cours...' : 'Lancer Hermes'}
          className="w-8 h-8 flex items-center justify-center rounded text-purple-300 hover:bg-purple-900/40 disabled:opacity-40 transition-colors text-base"
        >
          {isProcessing ? (
            <span className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin inline-block" />
          ) : (
            '🧬'
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={!report}
          title="Sauvegarder le rapport"
          className="w-8 h-8 flex items-center justify-center rounded text-purple-400 hover:bg-purple-900/40 disabled:opacity-30 transition-colors text-base"
        >
          💾
        </button>
        {report && (
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Agrandir' : 'Minimiser'}
            className="w-8 h-8 flex items-center justify-center rounded text-purple-400 hover:bg-purple-900/40 transition-colors text-base leading-none"
          >
            —
          </button>
        )}
        <button
          onClick={() => { setReport(''); setSuggestedEntities([]); setInjected(new Set()); }}
          title="Effacer"
          className="w-8 h-8 flex items-center justify-center rounded text-purple-400 hover:bg-red-500/30 hover:text-red-400 transition-colors text-base font-bold"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
