import React, { useState } from 'react';
import { queryHermes, HermesMessage } from '../hermesService';

interface HermesAnalyzerProps {
  entities?: any[]; // Reçoit les entités du store si besoin
}

export const HermesAnalyzer: React.FC<HermesAnalyzerProps> = ({ entities = [] }) => {
  const [logs, setLogs] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  // Fonction pour extraire dynamiquement les vrais pseudos/valeurs du graphe pour éviter "Ziggy"
  const targetValue = entities.find(e => e.type === 'Username')?.label || "zhetikal";
  const targetType = "Username";

  const triggerJarvisAnalysis = async () => {
    setIsProcessing(true);
    setLogs('Initialisation de la connexion avec le moteur Hermes local...\n');

    const context: HermesMessage[] = [
      { role: 'system', content: 'Tu es Jarvis, un expert OSINT rigoureux et technique. Donne une analyse claire sans inventer de fausses données.' },
      { role: 'user', content: `Donne 3 pivots pour : ${targetValue} (${targetType}). Voici le contexte du graphe : ${JSON.stringify(entities)}` }
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

  if (!isOpen) return null;

  return (
    /* Positionnement fixe : Centré en bas de la zone du graphe (pile sur ton rond rouge) */
    <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-40 flex flex-col items-center gap-2 w-full max-w-lg px-4">
      
      {/* Fenêtre d'analyse textuelle (avec défilement/scroll vertical) */}
      {logs && !isMinimized && (
        <div className="w-full h-48 bg-[#0d111c]/95 border border-purple-900/60 rounded-lg p-4 overflow-y-auto text-gray-300 text-xs text-left shadow-2xl backdrop-blur-sm custom-scrollbar">
          <div className="whitespace-pre-wrap font-mono">
            {logs}
          </div>
        </div>
      )}

      {/* Barre d'action contenant le Bouton Principal + les options de contrôle */}
      <div className="flex flex-wrap items-center justify-center gap-3 bg-[#0b0f19]/90 border border-purple-900/40 p-2 rounded-xl shadow-lg backdrop-blur-md">
        
        <button
          onClick={triggerJarvisAnalysis}
          disabled={isProcessing}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/50 text-white font-semibold py-2 px-5 rounded-lg text-xs transition-all border border-purple-400/40 flex items-center gap-2"
        >
          🧬 {isProcessing ? "Analyse en cours..." : "Lancer l'Analyse Automatique"}
        </button>

        {/* Liens de contrôle alignés proprement à côté du bouton */}
        <div className="flex gap-3 text-[11px] text-purple-400 font-medium px-2 border-l border-purple-900/40">
          {logs && (
            <button onClick={() => setIsMinimized(!isMinimized)} className="hover:underline">
              {isMinimized ? "[ Agrandir ]" : "[ Minimiser ]"}
            </button>
          )}
          <button onClick={handleSaveData} className="hover:underline">
            [ Sauvegarder ]
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:text-red-400 underline">
            [ Fermer ]
          </button>
        </div>

      </div>

    </div>
  );
};