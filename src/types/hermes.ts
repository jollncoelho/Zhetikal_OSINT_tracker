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
}
export type AnalysisMode = 'local' | 'hermes';
