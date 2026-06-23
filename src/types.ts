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
  | 'iban'
  | 'note'
  | 'social';
  | 'photo'
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
  fields?: Record<string, unknown>;
  customIconId?: string | null;
  photoUrl?: string;
}

export interface EntityNode extends Node {
  type: 'entity' | 'social';
  data: EntityData;
}

export interface MapPin {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  visitedAt?: string;
  withWho?: string;
  notes: string;
  color: string;
  iconId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PinLink {
  id: string;
  pinId: string;
  identifierId: string;
  context: string;
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
  locations?: MapPin[];
  pinLinks?: PinLink[];
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
  iban: 'IBAN',
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
  iban: '#34d399',
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
  iban: 'Building2',
  note: 'StickyNote',
  social: 'Share2',
};

export const ENTITY_FIELDS: Record<EntityType, { key: string; label: string; type: 'text' | 'number' }[]> = {
  ip: [
    { key: 'asn',     label: 'ASN',          type: 'text' },
    { key: 'isp',     label: 'ISP',          type: 'text' },
    { key: 'country', label: 'Country',      type: 'text' },
    { key: 'city',    label: 'City',         type: 'text' },
    { key: 'org',     label: 'Organization', type: 'text' },
  ],
  domain: [
    { key: 'registrar',   label: 'Registrar',   type: 'text' },
    { key: 'created',     label: 'Created',     type: 'text' },
    { key: 'expires',     label: 'Expires',     type: 'text' },
    { key: 'registrant',  label: 'Registrant',  type: 'text' },
    { key: 'nameservers', label: 'Nameservers', type: 'text' },
  ],
  email: [
    { key: 'breach',    label: 'Breach',     type: 'text' },
    { key: 'provider',  label: 'Provider',   type: 'text' },
    { key: 'firstName', label: 'First Name', type: 'text' },
    { key: 'lastName',  label: 'Last Name',  type: 'text' },
  ],
  username: [
    { key: 'platform',  label: 'Platform',    type: 'text' },
    { key: 'realName',  label: 'Real Name',   type: 'text' },
    { key: 'url',       label: 'Profile URL', type: 'text' },
    { key: 'followers', label: 'Followers',   type: 'number' },
  ],
  phone: [
    { key: 'carrier',  label: 'Carrier',  type: 'text' },
    { key: 'country',  label: 'Country',  type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'type',     label: 'Type',     type: 'text' },
  ],
  location: [
    { key: 'address', label: 'Address',   type: 'text' },
    { key: 'lat',     label: 'Latitude',  type: 'text' },
    { key: 'lng',     label: 'Longitude', type: 'text' },
    { key: 'country', label: 'Country',   type: 'text' },
    { key: 'city',    label: 'City',      type: 'text' },
  ],
  organization: [
    { key: 'industry',  label: 'Industry',   type: 'text' },
    { key: 'website',   label: 'Website',    type: 'text' },
    { key: 'founded',   label: 'Founded',    type: 'text' },
    { key: 'country',   label: 'Country',    type: 'text' },
    { key: 'employees', label: 'Employees',  type: 'number' },
  ],
  person: [
    { key: 'dob',         label: 'Date of Birth', type: 'text' },
    { key: 'nationality', label: 'Nationality',   type: 'text' },
    { key: 'occupation',  label: 'Occupation',    type: 'text' },
    { key: 'address',     label: 'Address',       type: 'text' },
    { key: 'aliases',     label: 'Aliases',       type: 'text' },
  ],
  file: [
    { key: 'hash',     label: 'Hash (MD5/SHA)', type: 'text' },
    { key: 'size',     label: 'Size',           type: 'text' },
    { key: 'type',     label: 'File Type',      type: 'text' },
    { key: 'created',  label: 'Created',        type: 'text' },
    { key: 'modified', label: 'Modified',       type: 'text' },
  ],
  url: [
    { key: 'status', label: 'HTTP Status', type: 'number' },
    { key: 'server', label: 'Server',      type: 'text' },
    { key: 'ip',     label: 'Resolved IP', type: 'text' },
    { key: 'title',  label: 'Page Title',  type: 'text' },
  ],
  crypto: [
    { key: 'blockchain', label: 'Blockchain',   type: 'text' },
    { key: 'balance',    label: 'Balance',      type: 'text' },
    { key: 'txCount',    label: 'Transactions', type: 'number' },
    { key: 'firstSeen',  label: 'First Seen',   type: 'text' },
  ],
  iban: [
    { key: 'bank',    label: 'Bank Name',    type: 'text' },
    { key: 'bic',     label: 'BIC / SWIFT',  type: 'text' },
    { key: 'country', label: 'Country',      type: 'text' },
    { key: 'holder',  label: 'Account Holder', type: 'text' },
    { key: 'balance', label: 'Balance',      type: 'text' },
  ],
  note: [],
  social: [
    { key: 'followers', label: 'Followers', type: 'number' },
    { key: 'following', label: 'Following', type: 'number' },
    { key: 'joined',    label: 'Joined',    type: 'text' },
    { key: 'realName',  label: 'Real Name', type: 'text' },
    { key: 'bio',       label: 'Bio',       type: 'text' },
  ],
};
