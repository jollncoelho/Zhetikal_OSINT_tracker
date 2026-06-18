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

    const systemPrompt = `Tu es Hermes, un expert OSINT rigoureux et technique. Analyse les données du graphe fournies sans jamais inventer de fausses informations.`;

    const graphSummary = {
      caseId: activeCase?.id,
      caseName: activeCase?.name,
      projectPath: projectCwd,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data?.entityType,
        label: n.data?.label,
        notes: n.data?.notes,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: (e as any).label,
      })),
    };

    const context: HermesMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Analyse la cible principale : "${targetValue}" (type : ${targetType}).\nDossier OSINT complet (${nodes.length} nœuds, ${edges.length} liens) :\n${JSON.stringify(graphSummary, null, 2)}`,
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
