import React, { useState } from 'react';
import { queryHermes } from '../hermesService';

interface HermesAnalyzerProps {
  entities: any[];
}

export const HermesAnalyzer: React.FC<HermesAnalyzerProps> = ({ entities }) => {
  const [analysisText, setAnalysisText] = useState<string>("");
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSaveData = () => {
    if (!analysisText) return;
    const blob = new Blob([analysisText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Analyse_Hermes_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    // Positionnement absolu calculé pour rester PILE au centre du graphe
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3">
      
      {/* 1. LE BOUTON PRINCIPAL */}
      {!analysisText && (
        <button 
          onClick={async () => {
            setIsLoading(true);
            try {
              const prompt = [
                { role: 'system' as const, content: "Analyse factuellement ces entités OSINT. Ne crée aucun faux pseudonyme." },
                { role: 'user' as const, content: JSON.stringify(entities) }
              ];
              const res = await queryHermes(prompt);
              setAnalysisText(res);
            } catch (err) {
              alert("Erreur Ollama. Vérifie que l'application tourne.");
            } finally {
              setIsLoading(false);
            }
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-md shadow-lg border border-purple-400 transition-all text-sm"
        >
          {isLoading ? "Analyse en cours..." : "🧬 Lancer l'Analyse Automatique"}
        </button>
      )}

      {/* 2. LE TEXTE GÉNÉRÉ (S'affiche centré, avec une taille fixe et une scrollbar si le texte est long) */}
      {analysisText && !isMinimized && (
        <div className="w-[500px] h-64 bg-[#0d111c]/95 border border-purple-900/60 rounded-lg p-4 overflow-y-auto text-gray-300 text-xs text-left shadow-2xl backdrop-blur-sm">
          <div className="whitespace-pre-wrap font-sans">
            {analysisText}
          </div>
        </div>
      )}

      {/* 3. LES OPTIONS : Restent centrées juste en dessous du bouton ou du texte */}
      <div className="flex gap-4 text-xs text-purple-400 font-medium bg-[#0b0f19]/80 px-3 py-1 rounded border border-purple-950/40">
        {analysisText && (
          <button onClick={() => setIsMinimized(!isMinimized)} className="hover:underline">
            {isMinimized ? "[ Agrandir ]" : "[ Minimiser ]"}
          </button>
        )}
        <button onClick={handleSaveData} className="hover:underline">
          [ Sauvegarder les données ]
        </button>
        <button onClick={() => setIsOpen(false)} className="hover:text-red-400 underline">
          [ Fermer ]
        </button>
      </div>

    </div>
  );
};