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
export interface HermesRecommendation {
  action: string;
  target: string;
  reason: string;
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
  /**
   * Le sous-ensemble de `unsupported` qui a la **forme d'un identifiant**
   * (ip, e-mail, domaine, téléphone, pseudo, url), avec son type.
   *
   * Tout ce qui est écarté n'est pas une piste : « Hetzner » ou « darknet »
   * sont des mots, pas des entités à ajouter. Cette liste-là, en revanche,
   * peut être promue dans le graphe — à la main, une par une, et marquée
   * comme non vérifiée. Elle évite de jeter une adresse que l'analyste
   * aurait envie d'aller regarder.
   */
  suggested?: { value: string; type: string }[];
  /**
   * Actions de vérification proposées par le modèle, classées par priorité.
   * Chaque recommandation est découpée en action, cible et justification pour
   * être affichée comme une liste de tâches concrètes plutôt que noyée dans
   * la prose.
   */
  recommendations?: HermesRecommendation[];
}
export type AnalysisMode = 'local' | 'freellm';
