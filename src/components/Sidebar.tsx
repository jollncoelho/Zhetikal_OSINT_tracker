import { useEffect, useRef, useState } from 'react';
import {
  Plus, FolderOpen, FolderX, Trash2, Download, Upload, ChevronDown,
  ChevronRight, Search, X, FileText, Image, Save, Pencil, Check, Eraser,
  AlertTriangle, type LucideIcon,
} from 'lucide-react';
import type { CaseData, EntityType, EntityData } from '../types';
import { ENTITY_COLORS, ENTITY_LABELS } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { translateEntityLabel } from '../i18n/translations';
import { token } from '../theme/themes';
import { useTheme } from '../theme/ThemeContext';
import AtomLogo from './AtomLogo';

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

type RailTone = 'default' | 'green' | 'orange' | 'red';

const RAIL_TONES: Record<RailTone, string> = {
  default: 'text-cyber-text-dim hover:bg-cyber-cyan/10 hover:text-cyber-cyan',
  green: 'text-cyber-green hover:bg-cyber-green/12',
  orange: 'text-cyber-orange hover:bg-cyber-orange/12',
  red: 'text-cyber-red/75 hover:bg-cyber-red/12 hover:text-cyber-red',
};

/**
 * Bouton du rail d'icônes (barre latérale repliée).
 * L'infobulle apparaît à droite ; elle déborde volontairement du rail, donc
 * aucun ancêtre ne doit poser `overflow: hidden` sur cette colonne.
 */
function RailButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  tone = 'default',
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: RailTone;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${
        active ? 'bg-cyber-cyan/15 text-cyber-cyan' : RAIL_TONES[tone]
      }`}
    >
      <Icon size={15} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[15px] rounded-full border border-cyber-dark bg-cyber-cyan px-1 text-center text-[9px] font-bold leading-[13px] text-cyber-black">
          {badge}
        </span>
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-[70] ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-cyber-border bg-cyber-dark px-2 py-1 text-[10px] font-medium text-cyber-text opacity-0 shadow-xl transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

interface SidebarRailProps {
  cases: CaseData[];
  activeCaseId: string | null;
  open: boolean;
  onToggleCases: () => void;
  onSwitchCase: (id: string) => void;
  onCreateCase: () => void;
  onDeleteCase: (id: string) => void;
  onSaveProgress: () => void;
  onExport: () => void;
  onExportPdf: () => Promise<void>;
  onExportPng: () => Promise<void>;
  onImport: () => void;
  onCloseCase: () => void;
  onClearCanvas: () => void;
}

function SidebarRail({
  cases,
  activeCaseId,
  open,
  onToggleCases,
  onSwitchCase,
  onCreateCase,
  onDeleteCase,
  onSaveProgress,
  onExport,
  onExportPdf,
  onExportPng,
  onImport,
  onCloseCase,
  onClearCanvas,
}: SidebarRailProps) {
  const { t } = useLanguage();
  const hasCase = Boolean(activeCaseId);

  return (
    <div className="relative flex h-full w-full flex-col items-center gap-1 pb-3 pt-14">
      <RailButton icon={Plus} label={t('sidebar.newCase')} onClick={onCreateCase} />
      <RailButton
        icon={FolderOpen}
        label={t('sidebar.cases')}
        onClick={onToggleCases}
        active={open}
        badge={cases.length}
      />

      <div className="my-1 h-px w-6 bg-cyber-border" />

      <RailButton
        icon={Save}
        label={t('sidebar.saveProgress')}
        onClick={onSaveProgress}
        disabled={!hasCase}
        tone="green"
      />

      <div className="my-1 h-px w-6 bg-cyber-border" />

      <RailButton
        icon={Download}
        label={t('sidebar.exportJson')}
        onClick={onExport}
        disabled={!hasCase}
      />
      <RailButton
        icon={FileText}
        label={t('sidebar.exportPdf')}
        onClick={() => { void onExportPdf(); }}
        disabled={!hasCase}
      />
      <RailButton
        icon={Image}
        label={t('sidebar.exportPng')}
        onClick={() => { void onExportPng(); }}
        disabled={!hasCase}
      />
      <RailButton icon={Upload} label={t('sidebar.importJson')} onClick={onImport} />

      <div className="flex-1" />

      {hasCase && (
        <RailButton
          icon={FolderX}
          label={t('sidebar.closeCase')}
          onClick={onCloseCase}
          tone="orange"
        />
      )}
      <RailButton
        icon={Eraser}
        label={t('sidebar.clearCanvas')}
        onClick={onClearCanvas}
        disabled={!hasCase}
        tone="red"
      />

      {open && (
        <div className="absolute left-full top-14 z-[65] ml-1 w-60 rounded-xl border border-cyber-border bg-cyber-dark p-2 shadow-2xl">
          <p className="px-2 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyber-text-dim">
            {t('sidebar.cases')} ({cases.length})
          </p>
          <div className="max-h-64 space-y-0.5 overflow-y-auto custom-scrollbar">
            {cases.map((c) => {
              const isActive = c.id === activeCaseId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    isActive ? 'bg-cyber-cyan/10 text-cyber-cyan' : 'text-cyber-text hover:bg-cyber-panel/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSwitchCase(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FolderOpen size={11} className="shrink-0 opacity-70" />
                    <span className="truncate text-xs">{c.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCase(c.id)}
                    title={t('sidebar.delete')}
                    className="shrink-0 rounded p-0.5 text-cyber-text-dim opacity-0 transition-all hover:bg-cyber-red/20 hover:text-cyber-red group-hover:opacity-100"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onCreateCase}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-cyber-border py-1.5 text-[11px] text-cyber-text-dim transition-colors hover:border-cyber-cyan/50 hover:text-cyber-cyan"
          >
            <Plus size={11} />
            {t('sidebar.newCase')}
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [railCasesOpen, setRailCasesOpen] = useState(false);
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
  const railRef = useRef<HTMLDivElement>(null);
  const { t, lang } = useLanguage();
  const { entityTone, scheme } = useTheme();

  // Fermeture du volet « Cas » du rail au clic extérieur / à la touche Échap.
  useEffect(() => {
    if (!railCasesOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setRailCasesOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailCasesOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [railCasesOpen]);

  // Le rail n'a de sens que replié : on ferme son volet en dépliant.
  useEffect(() => {
    if (!collapsed) setRailCasesOpen(false);
  }, [collapsed]);

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
    let label = entityLabel;
    if (!label.trim() && type !== 'location') {
      label = translateEntityLabel(lang, type);
    }
    // Pour location (Adresse): label vide => le nœud affiche un input à valider
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

      {collapsed ? (
        <div ref={railRef} className="h-full w-full">
          <SidebarRail
            cases={cases}
            activeCaseId={activeCaseId}
            open={railCasesOpen}
            onToggleCases={() => setRailCasesOpen((value) => !value)}
            onSwitchCase={(id) => { setRailCasesOpen(false); onSwitchCase(id); }}
            onCreateCase={() => { setRailCasesOpen(false); setCollapsed(false); setCreatingCase(true); }}
            onDeleteCase={onDeleteCase}
            onSaveProgress={onSaveProgress}
            onExport={onExport}
            onExportPdf={onExportPdf}
            onExportPng={onExportPng}
            onImport={handleImport}
            onCloseCase={onCloseCase}
            onClearCanvas={() => { setCollapsed(false); setConfirmClear(true); }}
          />
        </div>
      ) : (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="h-[60px] flex items-center px-4 border-b border-cyber-border flex-shrink-0">
            <div className="flex items-center gap-2.5">
              {/* Pastille « icône d'app » : fond sombre dégradé + halo d'accent.
                  En thème clair la lueur est remplacée par une ombre douce, sinon
                  le néon n'a plus de sens sur un fond blanc. */}
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
                style={{
                  background:
                    scheme === 'dark'
                      ? 'radial-gradient(130% 130% at 32% 18%, rgb(var(--cyber-cyan-rgb) / 0.26) 0%, rgb(var(--cyber-black-rgb) / 0.96) 64%)'
                      : 'radial-gradient(130% 130% at 32% 18%, rgb(var(--cyber-cyan-rgb) / 0.16) 0%, rgb(var(--cyber-panel-rgb) / 1) 64%)',
                  borderColor: `rgb(var(--cyber-cyan-rgb) / ${scheme === 'dark' ? 0.45 : 0.32})`,
                  boxShadow:
                    scheme === 'dark'
                      ? '0 0 18px rgb(var(--cyber-cyan-rgb) / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.08)'
                      : '0 2px 10px rgb(var(--cyber-cyan-rgb) / 0.2), inset 0 1px 0 rgb(255 255 255 / 0.75)',
                }}
              >
                <AtomLogo size={21} glow={scheme === 'dark'} className="text-cyber-cyan" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-cyber-text tracking-wide">Ghostint</h1>
                <p className="text-[10px] text-cyber-cyan/75 font-mono uppercase tracking-widest">
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
              <span>{t('sidebar.cases')} ({cases.length})</span>
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
                          placeholder={t('sidebar.description')}
                          className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text-dim outline-none focus:border-cyber-cyan"
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCaseId(null); }}
                        />
                        <div className="flex gap-1">
                          <button onClick={commitEdit} className="flex items-center gap-1 flex-1 justify-center py-1 rounded text-[10px] font-semibold bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 transition-colors">
                            <Check size={9} /> {t('sidebar.save')}
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
                            title={t('sidebar.rename')}
                          >
                            <Pencil size={9} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteCase(c.id); }}
                            className="p-0.5 rounded hover:bg-cyber-red/20 text-cyber-text-dim hover:text-cyber-red transition-all"
                            title={t('sidebar.delete')}
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
                      placeholder={t('sidebar.caseName')}
                      autoFocus
                      className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text outline-none focus:border-cyber-cyan"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                    />
                    <input
                      value={newCaseDesc}
                      onChange={(e) => setNewCaseDesc(e.target.value)}
                      placeholder={t('sidebar.descriptionOptional')}
                      className="w-full bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-xs text-cyber-text-dim outline-none focus:border-cyber-cyan"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateCase()}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleCreateCase}
                        className="flex-1 py-1 rounded text-[10px] font-semibold bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 transition-colors"
                      >
                        {t('sidebar.create')}
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
                    {t('sidebar.newCase')}
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
              <span>{t('sidebar.entities')}</span>
              {entitiesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {entitiesOpen && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex gap-1">
                  <input
                    value={entityLabel}
                    onChange={(e) => setEntityLabel(e.target.value)}
                    placeholder={selectedType === 'location' ? t('node.addressPlaceholder') : t('sidebar.labelPlaceholder')}
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
                    placeholder={t('sidebar.searchTypes')}
                    className="w-full bg-cyber-dark border border-cyber-border rounded pl-6 pr-2 py-1 text-[10px] text-cyber-text outline-none focus:border-cyber-cyan"
                  />
                </div>

                {selectedType === 'photo' && (
                  <div>
                    <label className="text-[10px] text-cyber-text-dim">{t('sidebar.photo')}</label>
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-1 block w-full text-[10px] text-cyber-text-dim"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setPhotoDataUrl(reader.result as string);
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1">
                  {filteredTypes.map((type) => {
                    const tone = entityTone(ENTITY_COLORS[type]);
                    const isSelected = selectedType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => handleAddEntity(type)}
                        disabled={!activeCaseId}
                        className="entity-btn flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-30"
                        style={{
                          background: isSelected ? `${tone}18` : token('panel', 0.5),
                          borderColor: isSelected ? `${tone}70` : `${tone}30`,
                          color: isSelected ? tone : 'var(--cyber-text-dim)',
                        }}
                        onMouseEnter={(e) => {
                          if (!activeCaseId) return;
                          const el = e.currentTarget;
                          el.style.background = `${tone}18`;
                          el.style.borderColor = `${tone}70`;
                          el.style.color = tone;
                          el.style.boxShadow = `0 0 8px ${tone}40, inset 0 0 8px ${tone}0a`;
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget;
                          el.style.background = isSelected ? `${tone}18` : token('panel', 0.5);
                          el.style.borderColor = isSelected ? `${tone}70` : `${tone}30`;
                          el.style.color = isSelected ? tone : 'var(--cyber-text-dim)';
                          el.style.boxShadow = '';
                        }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone }} />
                        {translateEntityLabel(lang, type)}
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
              {t('sidebar.saveProgress')}
            </button>

            {activeCaseId && (
              <button
                onClick={onCloseCase}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-orange hover:bg-cyber-orange/10 border border-transparent hover:border-cyber-orange/30 transition-colors"
              >
                <FolderX size={12} />
                {t('sidebar.closeCase')}
              </button>
            )}

            <button
              onClick={onExport}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors disabled:opacity-30"
            >
              <Download size={12} />
              {t('sidebar.exportJson')}
            </button>

            <button
              onClick={onExportPdf}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors disabled:opacity-30"
            >
              <FileText size={12} />
              {t('sidebar.exportPdf')}
            </button>

            <button
              onClick={onExportPng}
              disabled={!activeCaseId}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors disabled:opacity-30"
            >
              <Image size={12} />
              {t('sidebar.exportPng')}
            </button>

            <button
              onClick={handleImport}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text transition-colors"
            >
              <Upload size={12} />
              {t('sidebar.importJson')}
            </button>

            <div className="h-px bg-cyber-border my-1" />

            {/* Clear canvas — inline confirm */}
            {confirmClear ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 space-y-2">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={12} className="text-cyber-red flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-cyber-red leading-tight">
                    {t('sidebar.clearConfirm')}<br />
                    <span className="text-cyber-red/70">{t('sidebar.clearIrreversible')}</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { onClearCanvas(); setConfirmClear(false); }}
                    className="flex items-center gap-1 flex-1 justify-center py-1 rounded text-[10px] font-bold bg-red-500/25 text-cyber-red hover:bg-red-500/40 border border-red-500/40 transition-colors"
                  >
                    <Check size={9} /> {t('sidebar.confirm')}
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
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-cyber-red/70 hover:text-cyber-red hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors disabled:opacity-30"
              >
                <Eraser size={12} />
                {t('sidebar.clearCanvas')}
              </button>
            )}

          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" />
    </div>
  );
}