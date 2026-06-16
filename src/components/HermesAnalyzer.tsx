> import React, { useState } from 'react';
> import { queryHermes, HermesMessage } from '../hermesService';
> export const HermesAnalyzer: React.FC<{ targetValue?: string; targetType?: string }> = ({ targetValue = "Ziggy", targetType = "Username" }) => {
>   const [logs, setLogs] = useState('');
>   const [isProcessing, setIsProcessing] = useState(false);
>   const [errorMsg, setErrorMsg] = useState<string | null>(null);
>   const triggerJarvisAnalysis = async () => {
>     setIsProcessing(true); setErrorMsg(null);
>     setLogs('Initialisation de la connexion avec le moteur Hermes local...\n');
>     const context: HermesMessage[] = [
>       { role: 'system', content: 'Tu es Jarvis, un expert OSINT rigoureux et technique.' },
>       { role: 'user', content: `Donne 3 pivots techniques essentiels pour Cible: ${targetValue} (${targetType})` }
>     ];
>     try {
>       setLogs(p => p + 'Requête envoyée à la GTX 1080...\n');
>       const res = await queryHermes(context);
>       setLogs(res);
>     } catch (err: any) {
>       setErrorMsg(err.message);
>       setLogs(p => p + '❌ ÉCHEC.\n');
>     } finally { setIsProcessing(false); }
>   };
>   return (
>     <div className="w-full max-w-xl p-5 bg-black border border-purple-900/50 rounded-xl font-mono text-sm shadow-2xl my-4">
>       <div className="flex items-center justify-between border-b border-purple-900/30 pb-3 mb-4">
>         <div className="flex items-center gap-2">
>           <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
>           <h3 className="text-purple-400 font-bold uppercase tracking-wider text-xs">Hermes Core Integration</h3>
>         </div>
>       </div>
>       <button onClick={triggerJarvisAnalysis} disabled={isProcessing} className="w-full py-2.5 px-4 rounded-lg font-bold bg-purple-900/20 text-purple-300 border border-purple-700/60 hover:bg-purple-800/40">
>         {isProcessing ? '⚡ Analyse en cours...' : '🧬 Lancer l\'Analyse Automatique'}
>       </button>
>       {logs && <div className="mt-4 p-4 bg-zinc-950 border border-zinc-900 rounded-lg text-xs whitespace-pre-wrap text-zinc-300">{logs}</div>}
>       {errorMsg && <div className="mt-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-xs text-red-400 font-bold">{errorMsg}</div>}
>     </div>
>   );
> };
> ```
> 
> 3. Remets l'import de `HermesAnalyzer` tout en haut de `src/App.tsx` et ré-injecte le composant `<HermesAnalyzer targetType="Username" targetValue="Ziggy"/>` de manière absolue juste en dessous de la div principale (ligne 587)."

En lui balançant ça, Bolt va tout réécrire proprement à partir de son propre système de fichiers. Dès qu'il a fini ses actions, ton écran blanc va disparaître et laisser place à ton tracker avec le module fonctionnel !