import type { Node, Edge } from '@xyflow/react';

export type EntityType =
  | 'ip'
  | 'domain'
  | 'email'
  | 'username'
  | 'phone'
  | 'location'
  | 'organization'
  | 'person'
  | 'file'
  | 'url'
  | 'crypto'
  | 'note'
  | 'social';

export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'x';

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; color: string }[] = [
  { id: 'facebook',  label: 'Facebook',  color: '#1877f2' },
  { id: 'instagram', label: 'Instagram', color: '#e1306c' },
  { id: 'tiktok',    label: 'TikTok',    color: '#00f2ea' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0a66c2' },
  { id: 'x',         label: 'X',         color: '#e7e9ea' },
];

export interface EntityData extends Record<string, unknown> {
  label: string;
  entityType: EntityType;
  notes: string;
  color: string;
  icon: string;
  socialPlatform?: SocialPlatform;
}

export interface EntityNode extends Node {
  type: 'entity' | 'social';
  data: EntityData;
}

export interface CaseData {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  nodes: EntityNode[];
  edges: Edge[];
  caseNotes?: string;
  caseTitle?: string;
  projectPath?: string;
}

export const ENTITY_LABELS: Record<EntityType, string> = {
  ip: 'IP Address',
  domain: 'Domain',
  email: 'Email',
  username: 'Username',
  phone: 'Phone',
  location: 'Location',
  organization: 'Organization',
  person: 'Person',
  file: 'File',
  url: 'URL',
  crypto: 'Crypto',
  note: 'Note',
  social: 'Social Media',
};

export const ENTITY_COLORS: Record<EntityType, string> = {
  ip: '#ef4444',
  domain: '#0ea5e9',
  email: '#f59e0b',
  username: '#8b5cf6',
  phone: '#8b5cf6',
  location: '#10b981',
  organization: '#0ea5e9',
  person: '#f59e0b',
  file: '#94a3b8',
  url: '#0ea5e9',
  crypto: '#f59e0b',
  note: '#94a3b8',
  social: '#1877f2',
};

export const ENTITY_ICON_NAMES: Record<EntityType, string> = {
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
  note: 'StickyNote',
  social: 'Share2',
};
