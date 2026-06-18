import React, { useState } from 'react';
import { queryHermes, HermesMessage } from '../hermesService';

interface HermesAnalyzerProps {
  entities?: any[]; // Reçoit les entités du store si besoin
}

export const HermesAnalyzer: React.FC<HermesAnalyzerProps> = ({ entities = [] }) => {
  const [logs, setLogs] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Fonction pour extraire dynamiquement les vrais pseudos/valeurs du graphe pour éviter "Ziggy"
  const targetValue = entities.find(e => e.type === 'Username')?.label || "zhetikal";
  const targetType = "Username";

  const triggerJarvisAnalysis = async () => {
    setIsProcessing(true);
    setLogs('Initialisation de la connexion avec le moteur Hermes local...\n');

    const systemPrompt = `Tu es Jarvis, un expert OSINT rigoureux et technique. \
Tu ne génères jamais de fausses données. \
Lorsqu'on te demande une analyse de pivots, tu structures TOUJOURS ta réponse en exactement 3 sections numérotées, dans cet ordre strict :

### Pivot 1 — Variation et Canonicalisation
Génère toutes les variantes orthographiques, phonétiques, numériques et symboliques du handle. \
Identifie la forme canonique probable (avec ou sans chiffres, underscores, majuscules, séparateurs). \
Liste les patterns regex utiles pour la recherche automatisée.

### Pivot 2 — Exhaustion Inter-Plateforme
Dresse la liste des plateformes prioritaires à investiguer (réseaux sociaux, forums, dépôts de code, plateformes créatives, dark/grey web si pertinent). \
Pour chaque plateforme, indique la méthode de recherche directe (URL pattern, dork, API publique). \
Classe par probabilité de présence décroissante.

### Pivot 3 — Pivot Sémantique et Structurel
Décompose le handle en composants sémantiques (racines, préfixes, suffixes, références culturelles, langues). \
Propose des hypothèses sur l'identité, les centres d'intérêt ou l'origine géographique/culturelle. \
Suggère des requêtes croisées (autres handles liés, emails probables, noms réels potentiels).

Réponds exclusivement dans ce format. Sois précis, factuel, et technique.`;

    const context: HermesMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyse le handle : "${targetValue}" (type : ${targetType}).\nContexte du graphe OSINT : ${JSON.stringify(entities)}` }
    ];

    try {
      setLogs(p => p + 'Requête envoyée à la GTX 1080...\n');
      const res = await queryHermes(context);
      setLogs(res);
    } catch (err: any) {
      setLogs(p => p + '❌ ÉCHEC.\n' + err.message);
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
        maxWidth: '500px'
      }}
      className="flex flex-col items-center gap-2 px-4"
    >
      
      {/* Fenêtre d'analyse textuelle avec sa scrollbar */}
      {logs && !isMinimized && (
        <div className="w-full h-48 bg-[#0d111c]/95 border border-purple-900/60 rounded-lg p-4 overflow-y-auto text-gray-300 text-xs text-left shadow-2xl backdrop-blur-sm custom-scrollbar">
          <div className="whitespace-pre-wrap font-mono">
            {logs}
          </div>
        </div>
      )}

      {/* Barre d'action contenant le Bouton + les contrôles */}
      <div className="flex items-center justify-center gap-3 bg-[#0b0f19]/95 border border-purple-900/50 p-2 rounded-xl shadow-2xl backdrop-blur-md">
        
        <button
          onClick={triggerJarvisAnalysis}
          disabled={isProcessing}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/50 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-all border border-purple-400/30 flex items-center gap-2 whitespace-nowrap"
        >
          🧬 {isProcessing ? "Analyse..." : "Lancer l'Analyse Automatique"}
        </button>

        {/* Contrôles icônes */}
        <div className="flex gap-1 items-center px-2 border-l border-purple-900/40">
          {logs && (
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              title={isMinimized ? "Agrandir" : "Minimiser"}
              className="w-7 h-7 flex items-center justify-center rounded text-purple-400 hover:bg-purple-900/40 transition-colors text-base leading-none"
            >
              —
            </button>
          )}
          <button
            onClick={handleSaveData}
            title="Sauvegarder l'analyse"
            className="w-7 h-7 flex items-center justify-center rounded text-purple-400 hover:bg-purple-900/40 transition-colors text-base"
          >
            💾
          </button>
          <button
            onClick={() => setLogs('')}
            title="Effacer l'analyse"
            className="w-7 h-7 flex items-center justify-center rounded text-purple-400 hover:bg-red-500/30 hover:text-red-400 transition-colors text-base font-bold"
          >
            ✕
          </button>
        </div>

      </div>

    </div>
  );
};