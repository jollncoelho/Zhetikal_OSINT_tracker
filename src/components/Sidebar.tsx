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

   const handleAddEntity = (type: EntityType) => {
    setSelectedType(type);
    const label = entityLabel || ENTITY_LABELS[type];

    if (type === 'photo') {
      if (photoDataUrl) {
        onAddEntity(type, label, { photoUrl: photoDataUrl });
        setPhotoDataUrl('');
      }
      // Pas de photo = pas de nœud vide créé
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
      const reader = new FileReader();
      reader.onload = (ev) => onImport(ev.target?.result as string);
      reader.readAsText(file);
    };
    input.click();
  };

  const startEdit = (c: CaseData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCaseId(c.id);
    setEditName(c.name);
    setEditDesc(c.description || '');
  };

  const commitEdit = () => {
    if (!editingCaseId || !editName.trim()) return;
    onUpdateCase(editingCaseId, editName.trim(), editDesc.trim());
    setEditingCaseId(null);
  };

  return (
    <div
      className="h-full flex flex-col border-r border-cyber-border bg-cyber-dark transition-all duration-300 relative flex-shrink-0"
      style={{ width: collapsed ? 48 : 280 }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-3 z-50 p-1.5 rounded-lg bg-cyber-panel border border-cyber-border text-cyber-cyan hover:bg-cyber-border transition-colors"
        style={{ left: collapsed ? 6 : 254 }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>

      {!collapsed && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="h-[60px] flex items-center px-4 border-b border-cyber-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center">
                <FolderOpen size={16} className="text-cyber-cyan" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-cyber-text tracking-wide">Ghostint</h1>
                <p className="text-[10px] text-cyber-text-dim font-mono uppercase tracking-widest">
                  OSINT Tracker
                </p>
              </div>
            </div>
          </div>

          {/* Cases section */}
          <div className="border-b border-cyber-border flex-shrink-0">
            <button
              onClick={() => setCasesOpen(!casesOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-cyber-text-dim uppercase tracking-wider hover:bg-cyber-panel/50 transition-colors"
            >
              <span>Cases ({cases.length})</span>
              {casesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {casesOpen && (
              <div className="px-3 pb-3 space-y-1 max-h-64 overflow-y-auto">
                {cases.map((c) => {
                  const isActive = c.id === activeCaseId;
                  const isEditing = editingCaseId === c.id;

                  if (isEditing) {
                    return (
                      <div key={c.id} className="space-y-1 p-2 rounded-lg bg-cyber-panel border border-cyber-cyan/40">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text outline-none focus:border-cyber-cyan"
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCaseId(null); }}
                        />
                        <input
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="Description..."
                          className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text-dim outline-none focus:border-cyber-cyan"
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCaseId(null); }}
                        />
                        <div className="flex gap-1">
                          <button onClick={commitEdit} className="flex items-center gap-1 flex-1 justify-center py-1 rounded text-[10px] font-semibold bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 transition-colors">
                            <Check size={9} /> Save
                          </button>
                          <button onClick={() => setEditingCaseId(null)} className="px-2 py-1 rounded text-[10px] text-cyber-text-dim hover:bg-cyber-dark transition-colors">
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={c.id}
                      onClick={() => onSwitchCase(c.id)}
                      className={`group flex flex-col gap-0.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? 'bg-cyber-cyan/10 border border-cyber-cyan/30'
                          : 'hover:bg-cyber-panel/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen size={12} className={isActive ? 'text-cyber-cyan flex-shrink-0' : 'text-cyber-text-dim flex-shrink-0'} />
                        <span className={`flex-1 text-xs truncate ${isActive ? 'text-cyber-cyan font-medium' : 'text-cyber-text'}`}>
                          {c.name}
                        </span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => startEdit(c, e)}
                            className="p-0.5 rounded hover:bg-cyber-cyan/20 text-cyber-text-dim hover:text-cyber-cyan transition-all"
                            title="Renommer"
                          >
                            <Pencil size={9} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteCase(c.id); }}
                            className="p-0.5 rounded hover:bg-cyber-red/20 text-cyber-text-dim hover:text-cyber-red transition-all"
                            title="Supprimer"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      {c.description && (
                        <p className="text-[10px] text-cyber-text-dim font-mono truncate pl-5 opacity-70">
                          {c.description}
                        </p>
                      )}
                    </div>
                  );
                })}

                {creatingCase ? (
                  <div className="space-y-1.5 p-2 rounded-lg bg-cyber-panel border border-cyber-border">
                    <input
                      value={newCaseName}
                      onChange={(e) => setNewCaseName(e.target.value)}
                      placeholder="Case name..."
                      autoFocus
                      className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text outline-none focus:border-cyber-cyan"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                    />
                    <input
                      value={newCaseDesc}
                      onChange={(e) => setNewCaseDesc(e.target.value)}
                      placeholder="Description (optional)..."
                      className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text-dim outline-none focus:border-cyber-cyan"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleCreateCase}
                        className="flex-1 py-1 rounded text-[10px] font-semibold bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 transition-colors"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setCreatingCase(false)}
                        className="px-2 py-1 rounded text-[10px] text-cyber-text-dim hover:bg-cyber-panel transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreatingCase(true)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-cyber-border text-xs text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-cyan transition-colors"
                  >
                    <Plus size={12} />
                    New Case
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Entities section */}
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => setEntitiesOpen(!entitiesOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-cyber-text-dim uppercase tracking-wider hover:bg-cyber-panel/50 transition-colors"
            >
              <span>Entities</span>
              {entitiesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {entitiesOpen && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex gap-1">
                  <input
                    value={entityLabel}
                    onChange={(e) => setEntityLabel(e.target.value)}
                    placeholder="Label..."
                    className="flex-1 bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text outline-none focus:border-cyber-cyan"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEntity(selectedType)}
                  />
                  <button
                    onClick={() => handleAddEntity(selectedType)}
                    disabled={!activeCaseId}
                    className="px-2 py-1 rounded bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 transition-colors disabled:opacity-30"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div className="relative">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-cyber-text-dim" />
                  <input
                    value={typeSearch}
                    onChange={(e) => setTypeSearch(e.target.value)}
                    placeholder="Search types..."
                    className="w-full bg-cyber-dark border border-cyber-border rounded pl-6 pr-2 py-1 text-[10px] text-cyber-text outline-none focus:border-cyber-cyan"
                  />
                </div>

                

                <div className="grid grid-cols-2 gap-1">
                  {filteredTypes.map((type) => {
                    const color = ENTITY_COLORS[type];
                    const isSelected = selectedType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => handleAddEntity(type)}
                        disabled={!activeCaseId}
                        className="entity-btn flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-30"
                        style={{
                          background: isSelected ? `${color}18` : 'rgba(17,24,39,0.5)',
                          borderColor: isSelected ? `${color}70` : `${color}30`,
                          color: isSelected ? color : 'var(--cyber-text-dim)',
                        }}
                        onMouseEnter={(e) => {
                          if (!activeCaseId) return;
                          const el = e.currentTarget;
                          el.style.background = `${color}18`;
                          el.style.borderColor = `${color}70`;
                          el.style.color = color;
                          el.style.boxShadow = `0 0 8px ${color}40, inset 0 0 8px ${color}0a`;
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget;
                          el.style.background = isSelected ? `${color}18` : 'rgba(17,24,39,0.5)';
                          el.style.borderColor = isSelected ? `${color}70` : `${color}30`;
                          el.style.color = isSelected ? color : 'var(--cyber-text-dim)';
                          el.style.boxShadow = '';
                        }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        {ENTITY_LABELS[type]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-cyber-border p-3 space-y-1 flex-shrink-0">
            <button
              onClick={onSaveProgress}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-cyber-green bg-cyber-green/10 hover:bg-cyber-green/20 border border-cyber-green/30 hover:border-cyber-green/50 transition-colors disabled:opacity-30"
            >
              <Save size={12} />
              Save Progress
            </button>

            {activeCaseId && (
              <button
                onClick={onCloseCase}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-orange hover:bg-cyber-orange/10 border border-transparent hover:border-cyber-orange/30 transition-colors"
              >
                <FolderX size={12} />
                Close Case
              </button>
            )}

            <button
              onClick={onExport}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors disabled:opacity-30"
            >
              <Download size={12} />
              Export JSON
            </button>

            <button
              onClick={onExportPdf}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors disabled:opacity-30"
            >
              <FileText size={12} />
              Export PDF
            </button>

            <button
              onClick={onExportPng}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors disabled:opacity-30"
            >
              <Image size={12} />
              Export PNG
            </button>

            <button
              onClick={handleImport}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors"
            >
              <Upload size={12} />
              Import JSON
            </button>

            <div className="h-px bg-cyber-border my-1" />

            {/* Clear canvas — inline confirm */}
            {confirmClear ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 space-y-2">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-300 leading-tight">
                    Supprimer toutes les entités et tous les liens du graphe ?<br />
                    <span className="text-red-400/70">Cette action est irréversible.</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { onClearCanvas(); setConfirmClear(false); }}
                    className="flex items-center gap-1 flex-1 justify-center py-1 rounded text-[10px] font-bold bg-red-500/25 text-red-400 hover:bg-red-500/40 border border-red-500/40 transition-colors"
                  >
                    <Check size={9} /> Confirmer
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-1 rounded text-[10px] text-cyber-text-dim hover:bg-cyber-dark border border-cyber-border transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={!activeCaseId}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors disabled:opacity-30"
              >
                <Eraser size={12} />
                Clear Canvas
              </button>
            )}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" />
    </div>
  );
}