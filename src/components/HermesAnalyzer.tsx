import React, { useState } from 'react';
import { Save, Minimize2, Maximize2, X, Play } from 'lucide-react';
import { queryHermes } from '../hermesService'; // Utilise ton service Ollama direct

interface HermesAnalyzerProps {
  entities: any[]; // Pour récupérer les données de ton graphe actuel
}

export const HermesAnalyzer: React.FC<HermesAnalyzerProps> = ({ entities }) => {
  const [analysisText, setAnalysisText] = useState<string>("");
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSaveAnalysis = () => {
    if (!analysisText) return;
    const blob = new Blob([analysisText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Analyse_OSINT_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 1. BOUTON AU CENTRE DU GRAPH (Affiché si pas encore d'analyse) */}
      {!analysisText && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <button 
            onClick={async () => {
              setIsLoading(true);
              try {
                // Formate un prompt propre pour Ollama avec tes entités réelles
                const prompt = [
                  { 
                    role: 'system' as const, 
                    content: "Tu es l'agent Hermes. Analyse les entités OSINT fournies. Reste factuel, structure ton rapport, et n'invente JAMAIS de pseudonymes ou d'éléments qui ne sont pas dans la liste." 
                  },
                  { 
                    role: 'user' as const, 
                    content: `Voici les éléments collectés dans le tracker : ${JSON.stringify(entities)}` 
                  }
                ];
                const res = await queryHermes(prompt);
                setAnalysisText(res);
              } catch (err) {
                alert("Erreur de connexion avec Ollama. Vérifie qu'il tourne en arrière-plan.");
              } finally {
                setIsLoading(false);
              }
            }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg shadow-2xl border border-purple-400 transition-all transform hover:scale-105"
          >
            <Play size={18} fill="currentColor" />
            {isLoading ? "Analyse en cours par Ollama..." : "🧬 Lancer l'Analyse Automatique"}
          </button>
        </div>
      )}

      {/* 2. PANNEAU LATÉRAL À DROITE (Avec Scrollbar, Minimize et Sauvegarde) */}
      {analysisText && (
        <div 
          className={`absolute right-4 top-20 bg-[#0d111c]/95 border border-purple-900/50 rounded-xl shadow-2xl transition-all duration-300 z-50 flex flex-col backdrop-blur-md
            ${isMinimized ? 'h-14 w-80' : 'h-[calc(100vh-120px)] w-[450px]'}`}
        >
          {/* Barre supérieure */}
          <div className="flex items-center justify-between p-4 border-b border-purple-950/40 bg-[#111726] rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
              <h3 className="font-semibold text-purple-300 text-xs tracking-wider">HERMES CORE ANALYSIS</h3>
            </div>
            
            <div className="flex items-center gap-2 text-gray-400">
              <button onClick={handleSaveAnalysis} title="Sauvegarder l'analyse" className="hover:text-emerald-400 p-1 transition-colors">
                <Save size={16} />
              </button>
              <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Agrandir" : "Minimiser"} className="hover:text-purple-400 p-1 transition-colors">
                {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
              <button 
                onClick={() => {
                  if(confirm("Sauvegarder l'analyse avant de fermer ?")) handleSaveAnalysis();
                  setIsOpen(false);
                }} 
                title="Fermer et sauvegarder" 
                className="hover:text-red-400 p-1 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Corps textuel avec barre de défilement (Scroll) */}
          {!isMinimized && (
            <>
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-gray-300 text-sm leading-relaxed custom-scrollbar">
                <div className="whitespace-pre-wrap font-sans">
                  {analysisText}
                </div>
              </div>

              <div className="p-3 bg-[#0a0d16] border-t border-purple-950/20 rounded-b-xl flex justify-end">
                <button
                  onClick={handleSaveAnalysis}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 rounded transition-all"
                >
                  <Save size={14} />
                  Enregistrer (.txt)
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};