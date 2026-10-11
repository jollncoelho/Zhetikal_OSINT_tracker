import { createContext, useContext } from 'react';

/**
 * Filtre de nœuds courant, partagé par le HUD et les nœuds du graphe.
 *
 * Passer par un contexte évite de recopier le filtre dans `node.data` (et donc
 * de polluer le store persistant) : les nœuds se contentent de s'estomper.
 */
const GraphFilterContext = createContext<string>('');

export const GraphFilterProvider = GraphFilterContext.Provider;

export function useGraphFilter(): string {
  return useContext(GraphFilterContext);
}
