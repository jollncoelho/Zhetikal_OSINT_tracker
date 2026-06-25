import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
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