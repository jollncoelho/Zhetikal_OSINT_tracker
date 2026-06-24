import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import type { CaseData, EntityData, EntityNode, Edge, MapPin, PinLink } from '../types';

interface AppState {
  cases: CaseData[];
  activeCaseId: string | null;
  nodes: EntityNode[];
  edges: Edge[];
  lastSaved: string | null;

  createCase: (name: string, description: string) => string;
  switchCase: (id: string) => void;
  deleteCase: (id: string) => void;
  updateCase: (id: string, name: string, description: string, updates?: Partial<CaseData>) => void;
  closeCase: () => void;

  addEntity: (type: string, label: string, extra?: Partial<EntityData>) => string;
  updateNodeData: (nodeId: string, data: Partial<EntityData>) => void;
  deleteNode: (nodeId: string) => void;

  onConnect: (connection: any) => void;
  deleteEdge: (edgeId: string) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;

  clearCanvas: () => void;
  saveProgress: () => void;
  exportCase: () => string;
  importCase: (json: string) => void;
  updateCaseNotes: (notes: string) => void;
  updateCaseTitle: (title: string) => void;

  addPin: (pin: Omit<MapPin, 'id'>) => string;
  updatePin: (id: string, updates: Partial<MapPin>) => void;
  deletePin: (id: string) => void;
  addPinLink: (link: Omit<PinLink, 'id'>) => string;
  removePinLink: (id: string) => void;
}

const ENTITY_COLORS: Record<string, string> = {
  ip: '#ef4444',
  domain: '#3b82f6',
  email: '#f59e0b',
  username: '#8b5cf6',
  phone: '#06b6d4',
  location: '#10b981',
  organization: '#6366f1',
  person: '#ec4899',
  file: '#64748b',
  url: '#0ea5e9',
  crypto: '#eab308',
  iban: '#14b8a6',
  note: '#6b7280',
  social: '#a855f7',
  photo: '#f43f5e',
};

const ENTITY_ICONS: Record<string, string> = {
  ip: 'Globe',
  domain: 'Globe',
  email: 'Mail',
  username: 'User',
  phone: 'Phone',
  location: 'MapPin',
  organization: 'Building2',
  person: 'User',
  file: 'FileText',
  url: 'Link',
  crypto: 'Bitcoin',
  iban: 'CreditCard',
  note: 'StickyNote',
  social: 'Users',
  photo: 'Camera',
};

export const useStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        cases: [],
        activeCaseId: null,
        nodes: [],
        edges: [],
        lastSaved: null,

        createCase: (name, description) => {
          const id = crypto.randomUUID();
          const newCase: CaseData = {
            id,
            name,
            description,
            nodes: [],
            edges: [],
            locations: [],
            pinLinks: [],
            caseNotes: '',
            caseTitle: '',
          };
          set((state) => ({
            cases: [...state.cases, newCase],
            activeCaseId: id,
            nodes: [],
            edges: [],
          }));
          return id;
        },

        switchCase: (id) => {
          const caseData = get().cases.find((c) => c.id === id);
          if (!caseData) return;
          set({
            activeCaseId: id,
            nodes: caseData.nodes,
            edges: caseData.edges,
          });
        },

        deleteCase: (id) => {
          set((state) => {
            const newCases = state.cases.filter((c) => c.id !== id);
            let newActiveId = state.activeCaseId;
            let newNodes: EntityNode[] = [];
            let newEdges: Edge[] = [];
            if (state.activeCaseId === id) {
              newActiveId = newCases.length > 0 ? newCases[0].id : null;
              if (newActiveId) {
                const activeCase = newCases.find((c) => c.id === newActiveId);
                newNodes = activeCase?.nodes || [];
                newEdges = activeCase?.edges || [];
              }
            }
            return {
              cases: newCases,
              activeCaseId: newActiveId,
              nodes: newNodes,
              edges: newEdges,
            };
          });
        },

        updateCase: (id, name, description, updates = {}) => {
          set((state) => ({
            cases: state.cases.map((c) =>
              c.id === id ? { ...c, name, description, ...updates } : c
            ),
          }));
        },

        closeCase: () => {
          set({ activeCaseId: null, nodes: [], edges: [] });
        },

        addEntity: (type, label, extra = {}) => {
          const id = crypto.randomUUID();
          const newNode: EntityNode = {
            id,
            type: 'entity',
            position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
            data: {
              entityType: type,
              label,
              notes: '',
              color: ENTITY_COLORS[type] || '#10b981',
              icon: ENTITY_ICONS[type] || 'Globe',
              ...extra,
            } as EntityData,
          };
          set((state) => {
            if (!state.activeCaseId) return state;
            const updatedCases = state.cases.map((c) =>
              c.id === state.activeCaseId
                ? { ...c, nodes: [...c.nodes, newNode] }
                : c
            );
            return {
              cases: updatedCases,
              nodes: [...state.nodes, newNode],
            };
          });
          return id;
        },

        updateNodeData: (nodeId, data) => {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
            ),
          }));
          const activeCaseId = get().activeCaseId;
          if (activeCaseId) {
            set((state) => ({
              cases: state.cases.map((c) =>
                c.id === activeCaseId
                  ? {
                      ...c,
                      nodes: c.nodes.map((n) =>
                        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
                      ),
                    }
                  : c
              ),
            }));
          }
        },

        deleteNode: (nodeId) => {
          set((state) => ({
            nodes: state.nodes.filter((n) => n.id !== nodeId),
            edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          }));
          const activeCaseId = get().activeCaseId;
          if (activeCaseId) {
            set((state) => ({
              cases: state.cases.map((c) =>
                c.id === activeCaseId
                  ? {
                      ...c,
                      nodes: c.nodes.filter((n) => n.id !== nodeId),
                      edges: c.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                    }
                  : c
              ),
            }));
          }
        },

        onConnect: (connection) => {
          const activeCaseId = get().activeCaseId;
          set((state) => {
            // Forçage chirurgical du type 'custom' pour appliquer ton tracé et le bouton X
            const customConnection = {
              ...connection,
              type: 'custom',
              sourceHandle: connection.sourceHandle,
              targetHandle: connection.targetHandle
            };
            const updatedEdges = addEdge(customConnection, state.edges);
            
            return {
              edges: updatedEdges,
              cases: activeCaseId
                ? state.cases.map((c) =>
                    c.id === activeCaseId ? { ...c, edges: updatedEdges } : c
                  )
                : state.cases
            };
          });
        },

        deleteEdge: (edgeId) => {
          set((state) => ({ edges: state.edges.filter((e) => e.id !== edgeId) }));
          const activeCaseId = get().activeCaseId;
          if (activeCaseId) {
            set((state) => ({
              cases: state.cases.map((c) =>
                c.id === activeCaseId
                  ? { ...c, edges: c.edges.filter((e) => e.id !== edgeId) }
                  : c
              ),
            }));
          }
        },

        onNodesChange: (changes) => {
          set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }));
          const activeCaseId = get().activeCaseId;
          if (activeCaseId) {
            set((state) => ({
              cases: state.cases.map((c) =>
                c.id === activeCaseId
                  ? { ...c, nodes: applyNodeChanges(changes, c.nodes) }
                  : c
              ),
            }));
          }
        },

        onEdgesChange: (changes) => {
          set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }));
          const activeCaseId = get().activeCaseId;
          if (activeCaseId) {
            set((state) => ({
              cases: state.cases.map((c) =>
                c.id === activeCaseId
                  ? { ...c, edges: applyEdgeChanges(changes, c.edges) }
                  : c
              ),
            }));
          }
        },

        clearCanvas: () => {
          set({ nodes: [], edges: [] });
          const activeCaseId = get().activeCaseId;
          if (activeCaseId) {
            set((state) => ({
              cases: state.cases.map((c) =>
                c.id === activeCaseId
                  ? { ...c, nodes: [], edges: [], locations: [], pinLinks: [] }
                  : c
              ),
            }));
          }
        },

        saveProgress: () => {
          const state = get();
          const caseData = state.cases.find((c) => c.id === state.activeCaseId);
          if (!caseData) return;

          const json = JSON.stringify(caseData, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${caseData.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);

          set({ lastSaved: new Date().toISOString() });
        },

        exportCase: () => {
          const state = get();
          const caseData = state.cases.find((c) => c.id === state.activeCaseId);
          if (!caseData) return '';
          return JSON.stringify(caseData, null, 2);
        },

        importCase: (json) => {
          try {
            const caseData = JSON.parse(json) as CaseData;
            set((state) => ({
              cases: [...state.cases, caseData],
            }));
          } catch (e) {
            console.error('Invalid JSON', e);
          }
        },

        updateCaseNotes: (notes) => {
          const activeCaseId = get().activeCaseId;
          if (!activeCaseId) return;
          set((state) => ({
            cases: state.cases.map((c) =>
              c.id === activeCaseId ? { ...c, caseNotes: notes } : c
            ),
          }));
        },

        updateCaseTitle: (title) => {
          const activeCaseId = get().activeCaseId;
          if (!activeCaseId) return;
          set((state) => ({
            cases: state.cases.map((c) =>
              c.id === activeCaseId ? { ...c, caseTitle: title } : c
            ),
          }));
        },

        addPin: (pin) => {
          const id = crypto.randomUUID();
          set((state) => {
            if (!state.activeCaseId) return state;
            const updatedCases = state.cases.map((c) =>
              c.id === state.activeCaseId
                ? { ...c, locations: [...c.locations, { ...pin, id }] }
                : c
            );
            return { cases: updatedCases };
          });
          return id;
        },

        updatePin: (id, updates) => {
          set((state) => ({
            cases: state.cases.map((c) =>
              c.id === state.activeCaseId
                ? {
                    ...c,
                    locations: c.locations.map((p) =>
                      p.id === id ? { ...p, ...updates } : p
                    ),
                  }
                : c
            ),
          }));
        },

        deletePin: (id) => {
          set((state) => ({
            cases: state.cases.map((c) =>
              c.id === state.activeCaseId
                ? { ...c, locations: c.locations.filter((p) => p.id !== id) }
                : c
            ),
          }));
        },

        addPinLink: (link) => {
          const id = crypto.randomUUID();
          set((state) => {
            if (!state.activeCaseId) return state;
            const updatedCases = state.cases.map((c) =>
              c.id === state.activeCaseId
                ? { ...c, pinLinks: [...c.pinLinks, { ...link, id }] }
                : c
            );
            return { cases: updatedCases };
          });
          return id;
        },

        removePinLink: (id) => {
          set((state) => ({
            cases: state.cases.map((c) =>
              c.id === state.activeCaseId
                ? { ...c, pinLinks: c.pinLinks.filter((l) => l.id !== id) }
                : c
            ),
          }));
        },
      }),
      { name: 'ghostint-storage' }
    )
  )
);