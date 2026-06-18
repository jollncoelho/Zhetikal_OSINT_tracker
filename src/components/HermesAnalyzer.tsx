import React, { useState } from 'react';
import { queryHermes, HermesMessage } from '../hermesService';
import { useStore } from '../store/useStore';

export const HermesAnalyzer: React.FC = () => {
  const { nodes, edges, activeCase } = useStore();
  const [logs, setLogs] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const targetNode =
    nodes.find((n) => n.data?.entityType === 'username') ||
    nodes.find((n) => n.data?.entityType === 'person') ||
    nodes[0];

  const targetValue = targetNode?.data?.label || 'inconnu';
  const targetType = targetNode?.data?.entityType || 'Unknown';

  // Répertoire du projet actif injecté dans la requête Hermes Desktop (champ cwd).
  // Priorité : projectPath explicite > chemin dérivé du nom du cas.
  const projectCwd: string | undefined = activeCase
    ? (activeCase.projectPath?.trim() ||
        `~/ghostint-cases/${activeCase.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-.]/g, '')}`)
    : undefined;

  const triggerHermesAnalysis = async () => {
    setIsProcessing(true);
    const cwdLabel = projectCwd ?? '(répertoire par défaut Hermes)';
    setLogs(
      `Initialisation du Moteur Hermes Core...\nProjet : ${activeCase?.name ?? 'Sans titre'}\nRépertoire : ${cwdLabel}\n`
    );

    const systemPrompt = `Tu es Hermes, générateur de munitions OSINT. Tu reçois des entités (noms, pseudos, téléphones, IPs, domaines) extraites d'un graphe d'enquête. Tu NE rédiges PAS de rapport. Tu génères UNIQUEMENT des outils de recherche prêts à l'emploi.

INTERDICTIONS ABSOLUES :
- Zéro phrase descriptive ou narrative.
- Zéro identifiant technique aléatoire (chaînes comme "7k8gbfi8w").
- Zéro commentaire sur ce que tu fais ou ce que le graphe contient.
- Uniquement des dorks et des URLs, rien d'autre.

FORMAT DE SORTIE OBLIGATOIRE :

## 🔍 GOOGLE DORKS

Pour chaque entité (nom complet, pseudo, téléphone, domaine, IP), génère des dorks Google exacts et exploitables. Exemples de formats à adapter :
"[NOM COMPLET]" site:linkedin.com
"[PSEUDO]" site:facebook.com OR site:instagram.com
"[PSEUDO]" filetype:pdf
"[TÉLÉPHONE]" site:leboncoin.fr OR site:paruvendu.fr
"[NOM]" AND "[TÉLÉPHONE]"
"[NOM]" site:pagesjaunes.fr OR site:118712.fr
intitle:"[NOM]" inurl:cv OR inurl:resume
"[IP]" site:pastebin.com OR site:paste2.org

## 🌐 LIENS DIRECTS

Pour chaque IP présente, génère ces URLs en remplaçant [IP] par la valeur réelle :
https://scamalytics.com/ip/[IP]
https://bgp.he.net/ip/[IP]
https://www.abuseipdb.com/check/[IP]
https://ipinfo.io/[IP]
https://shodan.io/host/[IP]

Pour chaque pseudo présent, génère ces URLs en remplaçant [PSEUDO] par la valeur réelle :
https://whatsmyname.app/?q=[PSEUDO]
https://namechk.com/[PSEUDO]
https://www.google.com/search?q=%22[PSEUDO]%22

Pour chaque numéro de téléphone présent, génère ces URLs :
https://www.societe.com/cgi-bin/search?champs=[TÉLÉPHONE]
https://www.google.com/search?q=%22[TÉLÉPHONE]%22`;

    const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

    const cleanNodes = nodes.map((n) => {
      const label = n.data?.label?.trim() || '(sans nom)';
      const type = n.data?.entityType || 'entité';
      return `- ${type}: ${label}${n.data?.notes ? ` [note: ${n.data.notes}]` : ''}`;
    }).join('\n');

    const cleanEdges = edges.map((e) => {
      const src = nodeIndex.get(e.source);
      const tgt = nodeIndex.get(e.target);
      const fromLabel = src?.data?.label?.trim() || src?.data?.entityType || '(inconnu)';
      const toLabel = tgt?.data?.label?.trim() || tgt?.data?.entityType || '(inconnu)';
      const rel = (e as any).label?.trim();
      return rel
        ? `- ${fromLabel} —[${rel}]→ ${toLabel}`
        : `- ${fromLabel} → ${toLabel}`;
    }).join('\n');

    const graphText = `ENTITÉS (${nodes.length}) :\n${cleanNodes || '(aucune)'}\n\nRELATIONS (${edges.length}) :\n${cleanEdges || '(aucune)'}`;

    const context: HermesMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Dossier : "${activeCase?.name ?? 'Sans titre'}"\n\n${graphText}\n\nGénère les dorks Google et les liens directs pour chaque entité listée ci-dessus. Injecte les vraies valeurs dans chaque URL et chaque dork.`,
      },
    ];

    try {
      setLogs((p) => p + 'Requête envoyée au Moteur Hermes Core...\n');
      const res = await queryHermes(context, projectCwd);
      setLogs(res);
    } catch (err: any) {
      setLogs((p) => p + '❌ ÉCHEC — Hermes Core.\n' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveData = () => {
    if (!logs) return;
    const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Analyse_Hermes_${targetValue}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: '100%',
        maxWidth: '500px',
      }}
      className="flex flex-col items-center gap-2 px-4"
    >
      {logs && !isMinimized && (
        <div className="w-full h-48 bg-[#0d111c]/95 border border-purple-900/60 rounded-lg p-4 overflow-y-auto text-gray-300 text-xs text-left shadow-2xl backdrop-blur-sm custom-scrollbar">
          <div className="whitespace-pre-wrap font-mono">{logs}</div>
        </div>
      )}

      <div className="flex items-center justify-center gap-1 bg-[#0b0f19]/95 border border-purple-900/50 p-2 rounded-xl shadow-2xl backdrop-blur-md">
        <button
          onClick={triggerHermesAnalysis}
          disabled={isProcessing}
          title={isProcessing ? 'Analyse en cours...' : "Lancer l'analyse"}
          className="w-8 h-8 flex items-center justify-center rounded text-purple-300 hover:bg-purple-900/40 disabled:opacity-40 transition-colors text-base"
        >
          🧬
        </button>
        <button
          onClick={handleSaveData}
          title="Sauvegarder l'analyse"
          className="w-8 h-8 flex items-center justify-center rounded text-purple-400 hover:bg-purple-900/40 transition-colors text-base"
        >
          💾
        </button>
        {logs && (
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Agrandir' : 'Minimiser'}
            className="w-8 h-8 flex items-center justify-center rounded text-purple-400 hover:bg-purple-900/40 transition-colors text-base leading-none"
          >
            —
          </button>
        )}
        <button
          onClick={() => setLogs('')}
          title="Effacer l'analyse"
          className="w-8 h-8 flex items-center justify-center rounded text-purple-400 hover:bg-red-500/30 hover:text-red-400 transition-colors text-base font-bold"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
