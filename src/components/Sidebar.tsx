import { useRef, useState } from 'react';
import {
  Plus, FolderOpen, FolderX, Trash2, Download, Upload, ChevronDown,
  ChevronRight, Search, X, FileText, Image, Save, Pencil, Check, Eraser,
  AlertTriangle,
} from 'lucide-react';
import type { CaseData, EntityType, EntityData } from '../types';
import { ENTITY_COLORS, ENTITY_LABELS } from '../types';

interface SidebarProps {
  cases: CaseData[];
  activeCaseId: string | null;
  onCreateCase: (name: string, description: string) => string;
  onSwitchCase: (id: string) => void;
  onCloseCase: () => void;
  onDeleteCase: (id: string) => void;
  onUpdateCase: (id: string, name: string, description: string) => void;
  onAddEntity: (type: EntityType, label: string, extra?: Partial<EntityData>) => void;
  onSaveProgress: () => void;
  onExport: () => void;
  onExportPdf: () => Promise<void>;
  onExportPng: () => Promise<void>;
  onImport: (json: string) => void;
  onClearCanvas: () => void;
}

const ENTITY_TYPES = Object.keys(ENTITY_LABELS) as EntityType[];

export default function Sidebar({
  cases,
  activeCaseId,
  onCreateCase,
  onSwitchCase,
  onCloseCase,
  onDeleteCase,
  onUpdateCase,
  onAddEntity,
  onSaveProgress,
  onExport,
  onExportPdf,
  onExportPng,
  onImport,
  onClearCanvas,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [casesOpen, setCasesOpen] = useState(true);
  const [entitiesOpen, setEntitiesOpen] = useState(true);
  const [creatingCase, setCreatingCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseDesc, setNewCaseDesc] = useState('');
  const [entityLabel, setEntityLabel] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [selectedType, setSelectedType] = useState<EntityType>('ip');
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredTypes = ENTITY_TYPES.filter((t) =>
    t.toLowerCase().includes(typeSearch.toLowerCase()) ||
    ENTITY_LABELS[t].toLowerCase().includes(typeSearch.toLowerCase())
  );

  const handleCreateCase = () => {
    if (!newCaseName.trim()) return;
    const id = onCreateCase(newCaseName.trim(), newCaseDesc.trim());
    onSwitchCase(id);
    setNewCaseName('');
    setNewCaseDesc('');
    setCreatingCase(false);
  };

  // ✅ CORRECTION ICI : Gestion du label pour les Locations
  const handleAddEntity = (type: EntityType) => {
    setSelectedType(type);
    
    let label = entityLabel;
    
    // Si le champ est vide
    if (!label.trim()) {
      if (type === 'location') {
        // Pour une location, on ne met PAS "Location" par défaut
        // On met un placeholder pour que l'utilisateur sache qu'il doit mettre l'adresse
        label = 'Nouvelle Adresse (à modifier)';
      } else {
        // Pour les autres, on garde le comportement normal
        label = ENTITY_LABELS[type];
      }
    }

    if (type === 'photo') {
      if (photoDataUrl) {
        onAddEntity(type, label, { photoUrl: photoDataUrl });
        setPhotoDataUrl('');
      }
    } else {
      onAddEntity(type, label);
    }
    setEntityLabel('');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader