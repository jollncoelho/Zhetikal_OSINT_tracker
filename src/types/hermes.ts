export interface HermesEntity {
  type: string;
  label: string;
  properties?: Record<string, any>;
}
export interface HermesRelation {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}
export interface HermesDiscovery {
  entities: HermesEntity[];
  relations: HermesRelation[];
  summary: string;
  /**
   * Valeurs techniques citées dans le rapport qui ne figurent ni dans le
   * graphe ni parmi les entités proposées : elles viennent du modèle, pas du
   * dossier. L'app les montre plutôt que de les laisser passer pour des faits.
   */
  unsupported?: string[];
}
export type AnalysisMode = 'local' | 'freellm';
