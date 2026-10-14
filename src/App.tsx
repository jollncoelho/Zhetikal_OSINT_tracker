import { HermesAnalyzer } from './components/HermesAnalyzer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity, Briefcase, FileJson, FileText, Ghost, Home, Image as ImageIcon,
  Languages, Map, MoreHorizontal, Network, Palette, Plus, Satellite, Save, Search, Star, X,
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import ToolkitPanel from './components/ToolkitPanel';
import DisclaimerModal from './components/DisclaimerModal';
import InfoTab from './components/InfoTab';
import MapTab from './components/MapTab';
import IdentifierModal from './components/IdentifierModal';
import InvestigationModule from './components/InvestigationModule';
import SnippingTool from './components/SnippingTool';
import CommandPalette, { type PaletteCommand } from './components/CommandPalette';
import HeaderMenu, { type HeaderMenuItem } from './components/HeaderMenu';
import { ToastProvider, useToast } from './components/Toast';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import ThemeSwitcher from './components/ThemeSwitcher';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { useStore } from './store/useStore';
import { translateEntityLabel, LANGUAGES, type Language } from './i18n/translations';
import { ENTITY_LABELS } from './types';
import type { EntityData, EntityNode as EntityNodeType, EntityType } from './types';
import type { Edge } from '@xyflow/react';

/** Outil externe de projection satellite — mis en avant directement dans l'en-tête. */
const GODSEYE_URL =
  import.meta.env.VITE_GODSEYE_URL || 'https://osintgodseye.prohacking77.me';

function AppInner() {
  const {
    cases,
    activeCaseId,
    nodes,
    edges,
    lastSaved,
    onNodesChange,
    onEdgesChange,
    createCase,
    switchCase,
    deleteCase,
    addEntity,
    updateNodeData,
    onConnect: storeOnConnect,
    deleteNode,
    deleteEdge,
    updateEdgeData,
    clearCanvas,
    saveProgress,
    exportCase,
    importCase,
    updateCaseNotes,
    updateCaseTitle,
    closeCase,
    updateCase,
    updatePin,
  } = useStore();

  const activeCase = activeCaseId ? cases.find((c) => c.id === activeCaseId) ?? null : null;

  const onConnect = useCallback((params: any) => {
    if (storeOnConnect) {
      storeOnConnect(params);
    }
  }, [storeOnConnect]);

  const { view, setView } = useNavigation();
  const { t, lang, setLang } = useLanguage();
  const { themeId, themes, setTheme } = useTheme();
  const toast = useToast();

  const [paletteOpen, setPaletteOpen] = useState(false);

  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [notePanelOpen, setNotePanelOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    () => sessionStorage.getItem('ghostint-disclaimer') === 'accepted'
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const [exportPngFn, setExportPngFn] = useState<() => Promise<void>>(() => async () => {});
  const [exportPdfFn, setExportPdfFn] = useState<() => Promise<void>>(() => async () => {});

  const handleRegisterExportPng = useCallback((fn: () => Promise<void>) => setExportPngFn(() => fn), []);
  const handleRegisterExportPdf = useCallback((fn: () => Promise<void>) => setExportPdfFn(() => fn), []);
  
  const [fieldsNodeId, setFieldsNodeId] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState<{ url: string; label: string } | null>(null);
  const [activeInvestigationCaseId, setActiveInvestigationCaseId] = useState<string | null>(null);

  const fieldsNode = fieldsNodeId
    ? (nodes.find((n) => n.id === fieldsNodeId) as EntityNodeType | undefined) ?? null
    : null;

  const handleGeocodeLocation = useCallback((nodeId: string, lat: number, lng: number) => {
    const currentNode = nodes.find(n => n.id === nodeId);
    updateNodeData(nodeId, {
      fields: {
        ...(currentNode?.data as EntityData)?.fields,
        lat: String(lat),
        lng: String(lng),
      }
    });
  }, [nodes, updateNodeData]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const { id, label, notes, socialPlatform, color, fields } = (e as CustomEvent).detail;
      updateNodeData(id, { label, notes, ...(socialPlatform !== undefined && { socialPlatform }), ...(color !== undefined && { color }), ...(fields !== undefined && { fields }) });
    };
    const handleDeleteNode = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      deleteNode(id);
    };
    const handleDeleteEdge = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      deleteEdge(id);
      setSelectedEdgeId(null);
    };
    const handleExpandNote = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setSelectedNodeId(id);
      setNotePanelOpen(true);
    };
    const handleOpenFields = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setFieldsNodeId(id);
    };
    const handleViewPhoto = (e: Event) => {
      const { photoUrl, label } = (e as CustomEvent).detail;
      if (photoUrl) setPhotoViewer({ url: photoUrl, label: label || '' });
    };
    window.addEventListener('entity-update', handleUpdate);
    window.addEventListener('entity-delete', handleDeleteNode);
    window.addEventListener('edge-delete', handleDeleteEdge);
    window.addEventListener('entity-expand-note', handleExpandNote);
    window.addEventListener('entity-open-fields', handleOpenFields);
    window.addEventListener('entity-view-photo', handleViewPhoto);
    return () => {
      window.removeEventListener('entity-update', handleUpdate);
      window.removeEventListener('entity-delete', handleDeleteNode);
      window.removeEventListener('edge-delete', handleDeleteEdge);
      window.removeEventListener('entity-expand-note', handleExpandNote);
      window.removeEventListener('entity-open-fields', handleOpenFields);
      window.removeEventListener('entity-view-photo', handleViewPhoto);
    };
  }, [updateNodeData, deleteNode, deleteEdge]);

  useEffect(() => {
    const handleCaseSelected = (e: Event) => {
      const { caseId } = (e as CustomEvent).detail || {};
      setActiveInvestigationCaseId(typeof caseId === 'string' ? caseId : null);
    };
    window.addEventListener('investigation-case-selected', handleCaseSelected);
    return () => window.removeEventListener('investigation-case-selected', handleCaseSelected);
  }, []);

  useEffect(() => {
    const handleArtifactAdded = () => {
      window.dispatchEvent(new CustomEvent('investigation-refresh-artifacts'));
    };
    window.addEventListener('investigation-artifact-added', handleArtifactAdded);
    return () => window.removeEventListener('investigation-artifact-added', handleArtifactAdded);
  }, []);

  useEffect(() => {
    const handleGoToMap = (e: Event) => {
      const { nodeId, address } = (e as CustomEvent).detail || {};
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const finalAddress = (address ?? node.data.label ?? '').trim();
      if (!finalAddress) return;
      setView('map');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('map-geocode-address', {
          detail: { nodeId, address: finalAddress },
        }));
      }, 60);
    };
    window.addEventListener('entity-go-to-map', handleGoToMap);
    return () => window.removeEventListener('entity-go-to-map', handleGoToMap);
  }, [nodes, setView]);

  useEffect(() => {
    if (cases.length === 0) createCase('Default Case', '');
  }, [cases.length, createCase]);

  const handleAddEntity = useCallback(
    (type: EntityType, label: string, extra?: Partial<EntityData>) => {
      addEntity(type, label, extra);
      toast.success(t('toast.entityAdded'), translateEntityLabel(lang, type));
    },
    [addEntity, toast, t, lang]
  );

  /** Sauvegarde + confirmation visuelle (remplace l'ancien silence de l'action). */
  const handleSaveProgress = useCallback(() => {
    if (!activeCaseId) {
      toast.warning(t('toast.noActiveCase'));
      return;
    }
    saveProgress();
    toast.success(t('toast.saved'), activeCase?.name);
  }, [activeCaseId, activeCase, saveProgress, toast, t]);

  const handleExportJson = useCallback(() => {
    if (!activeCaseId) {
      toast.warning(t('toast.noActiveCase'));
      return;
    }
    exportCase();
    toast.success(t('toast.exportedJson'), activeCase?.name);
  }, [activeCaseId, activeCase, exportCase, toast, t]);

  const handleImportJson = useCallback(
    (json: string) => {
      if (importCase(json)) toast.success(t('toast.imported'));
      else toast.error(t('toast.importFailed'));
    },
    [importCase, toast, t]
  );

  const handleClearCanvas = useCallback(() => {
    clearCanvas();
    toast.info(t('toast.cleared'), activeCase?.name);
  }, [clearCanvas, toast, t, activeCase]);

  const handleCreateCase = useCallback(
    (name: string, description: string) => {
      const id = createCase(name, description);
      toast.success(t('toast.caseCreated'), name);
      return id;
    },
    [createCase, toast, t]
  );

  const handleDeleteCase = useCallback(
    (id: string) => {
      const target = cases.find((c) => c.id === id);
      deleteCase(id);
      toast.info(t('toast.caseDeleted'), target?.name);
    },
    [cases, deleteCase, toast, t]
  );

  /**
   * Commandes de la palette (Ctrl+K). Volontairement sans action destructive :
   * « Effacer le Canevas » reste dans la barre latérale, où il est confirmé.
   */
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const navGroup = t('palette.groupNavigation');
    const caseGroup = t('palette.groupCase');
    const entityGroup = t('palette.groupEntities');
    const lookGroup = t('palette.groupAppearance');
    const dataGroup = t('palette.groupData');
    const toolGroup = t('palette.groupTools');
    const current = t('palette.current');

    const commands: PaletteCommand[] = [
      { id: 'view-information', label: t('header.graph'), group: navGroup, icon: Network, keywords: 'graphe graph entites noeuds', run: () => setView('graph') },
      { id: 'view-map', label: t('header.map'), group: navGroup, icon: Map, keywords: 'carte adresses geolocalisation', run: () => setView('map') },
      { id: 'view-investigation', label: t('header.cases'), group: navGroup, icon: Briefcase, keywords: 'dossiers enquetes preuves', run: () => setView('investigation') },
      { id: 'open-tools', label: t('header.tools'), group: navGroup, icon: Ghost, keywords: 'outils toolkit ghostint', run: () => setToolkitOpen(true) },
      { id: 'toggle-stats', label: t('stats.title'), group: navGroup, icon: Activity, keywords: 'statistiques compteurs', run: () => setStatsOpen((value) => !value) },
      { id: 'new-case', label: t('sidebar.newCase'), group: caseGroup, icon: Plus, keywords: 'creer nouveau dossier', run: () => handleCreateCase(`${t('sidebar.newCase')} ${cases.length + 1}`, '') },
    ];

    cases.forEach((item) => {
      commands.push({
        id: `case-${item.id}`,
        label: item.name || t('header.cases'),
        hint: item.id === activeCaseId ? current : undefined,
        group: caseGroup,
        icon: Briefcase,
        keywords: 'dossier case',
        run: () => switchCase(item.id),
      });
    });

    (Object.keys(ENTITY_LABELS) as EntityType[]).forEach((type) => {
      const label = translateEntityLabel(lang, type);
      commands.push({
        id: `entity-${type}`,
        label: `${t('palette.addEntity')} · ${label}`,
        group: entityGroup,
        icon: Plus,
        keywords: `entite ajouter ${type}`,
        run: () => { setView('graph'); handleAddEntity(type, label); },
      });
    });

    themes.forEach((theme) => {
      commands.push({
        id: `theme-${theme.id}`,
        label: t(theme.labelKey),
        hint: theme.id === themeId ? current : undefined,
        group: lookGroup,
        icon: Palette,
        keywords: 'theme apparence couleur',
        run: () => setTheme(theme.id),
      });
    });

    LANGUAGES.forEach((item) => {
      commands.push({
        id: `language-${item.id}`,
        label: item.label,
        hint: item.id === lang ? current : undefined,
        group: lookGroup,
        icon: Languages,
        keywords: 'langue language idioma',
        run: () => setLang(item.id as Language),
      });
    });

    commands.push(
      { id: 'save', label: t('sidebar.saveProgress'), group: dataGroup, icon: Save, keywords: 'sauvegarder enregistrer', run: handleSaveProgress },
      { id: 'export-json', label: t('sidebar.exportJson'), group: dataGroup, icon: FileJson, keywords: 'export json donnees', run: handleExportJson },
      { id: 'export-pdf', label: t('sidebar.exportPdf'), group: dataGroup, icon: FileText, keywords: 'export pdf rapport', run: () => { void exportPdfFn(); } },
      { id: 'export-png', label: t('sidebar.exportPng'), group: dataGroup, icon: ImageIcon, keywords: 'export png image capture', run: () => { void exportPngFn(); } },
      {
        id: 'godseye',
        label: "God's Eye",
        group: toolGroup,
        icon: Satellite,
        keywords: 'godseye satellite projection tactique',
        run: () => window.open(GODSEYE_URL, '_blank', 'noopener,noreferrer'),
      },
    );

    return commands;
  }, [
    t, lang, cases, activeCaseId, themeId, themes,
    setView, setTheme, setLang, handleCreateCase, switchCase, handleAddEntity,
    handleSaveProgress, handleExportJson, exportPdfFn, exportPngFn,
  ]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => { setSelectedEdgeId(null); }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        deleteEdge(selectedEdgeId);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, deleteEdge]);

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const entityTypes = new Set(nodes.map((n) => (n.data as EntityData)?.entityType)).size;
  const pinCount = activeCase?.locations?.length ?? 0;

  const handleAcceptDisclaimer = () => {
    sessionStorage.setItem('ghostint-disclaimer', 'accepted');
    setDisclaimerAccepted(true);
  };

  /**
   * Actions secondaires regroupées dans le menu « Plus » de l'en-tête.
   * God's Eye n'y figure plus : c'est un outil phare, il a son propre bouton
   * visible directement dans l'en-tête.
   */
  const moreMenuItems: HeaderMenuItem[] = [
    {
      id: 'stats',
      label: t('header.stats'),
      icon: Activity,
      active: statsOpen,
      onClick: () => setStatsOpen((value) => !value),
    },
    {
      id: 'star',
      label: 'Star',
      icon: Star,
      href: 'https://github.com/jollncoelho/Zhetikal_OSINT_tracker',
      separatorBefore: true,
    },
    {
      id: 'home',
      // Icon-only entry. The domain used to be printed here, which put the
      // personal site's name in every screenshot of the tool — keep the house,
      // drop the text (the tooltip still says where it goes).
      label: '',
      title: t('header.home'),
      icon: Home,
      href: 'https://prohacking77.me',
    },
  ];

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-cyber-black">
      {!disclaimerAccepted && <DisclaimerModal onAccept={handleAcceptDisclaimer} />}

      <Sidebar
        cases={cases}
        activeCaseId={activeCaseId}
        onCreateCase={handleCreateCase}
        onSwitchCase={switchCase}
        onCloseCase={() => { closeCase(); setNotePanelOpen(false); setSelectedNodeId(null); }}
        onDeleteCase={handleDeleteCase}
        onUpdateCase={updateCase}
        onAddEntity={handleAddEntity}
        onSaveProgress={handleSaveProgress}
        onExport={handleExportJson}
        onExportPdf={exportPdfFn}
        onExportPng={exportPngFn}
        onImport={handleImportJson}
        onClearCanvas={handleClearCanvas}
      />

      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="h-[60px] flex items-center justify-between px-4 border-b border-cyber-border bg-cyber-dark/80 backdrop-blur-sm z-10 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/photo_2026-05-04_13-46-20.jpg"
              alt="Zhétikal"
              className="h-11 w-11 rounded-full object-cover object-center mix-blend-lighten flex-shrink-0"
              style={{ filter: 'brightness(1.15) contrast(1.1)' }}
            />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-cyber-text truncate">
                {activeCase?.name || 'No Case'}
              </span>
              {activeCase && (
                <span className="text-[10px] font-mono text-cyber-text-dim bg-cyber-panel px-2 py-0.5 rounded border border-cyber-border whitespace-nowrap">
                  {nodeCount}e / {edgeCount}l / {pinCount}p
                </span>
              )}
            </div>
          </div>

          {/* Centre — navigation principale, groupée en un seul bloc */}
          <div className="mx-auto flex items-center gap-0.5 rounded-xl border border-cyber-border bg-cyber-panel/60 p-1">
            <button
              onClick={() => setView('graph')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-semibold transition-all ${
                view === 'graph'
                  ? 'bg-cyber-cyan/15 text-cyber-cyan'
                  : 'text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              <Network size={11} /> {t('header.graph')}
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-semibold transition-all ${
                view === 'map'
                  ? 'bg-cyber-cyan/15 text-cyber-cyan'
                  : 'text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              <Map size={11} /> {t('header.map')}
            </button>
            <button
              onClick={() => setView('investigation')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-semibold transition-all ${
                view === 'investigation'
                  ? 'bg-cyber-cyan/15 text-cyber-cyan'
                  : 'text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              <Briefcase size={11} /> {t('header.cases')}
            </button>
          </div>

          {/* Droite — recherche, outils, réglages, menu */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              title={`${t('palette.open')} (Ctrl+K)`}
              className="flex items-center gap-2 rounded-lg border border-cyber-border bg-cyber-panel px-2.5 py-1.5 text-[11px] font-medium text-cyber-text-dim transition-all hover:border-cyber-cyan/40 hover:text-cyber-cyan"
            >
              <Search size={12} />
              <span className="hidden xl:inline">{t('palette.open')}</span>
              <kbd className="hidden rounded border border-cyber-border bg-cyber-dark px-1.5 py-0.5 font-mono text-[10px] lg:inline">
                Ctrl K
              </kbd>
            </button>
            <button
              onClick={() => setToolkitOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/20"
            >
              <Ghost size={12} />
              <span className="hidden lg:inline">{t('header.tools')}</span>
            </button>
            {/* God's Eye — outil phare : bouton dédié, volontairement visible
                (il n'est plus rangé dans le menu « Plus »). */}
            <a
              href={GODSEYE_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={t('header.godsEyeHint')}
              className="flex items-center gap-1.5 rounded-lg border border-cyber-cyan/40 bg-cyber-panel px-3 py-1.5 text-[11px] font-semibold text-cyber-cyan transition-all hover:border-cyber-cyan/70 hover:bg-cyber-cyan/15"
            >
              <Satellite size={12} />
              <span className="hidden lg:inline">God's Eye</span>
            </a>
            <LanguageSwitcher />
            <ThemeSwitcher />
            <SnippingTool activeCaseId={activeInvestigationCaseId} />
            <HeaderMenu label={t('header.more')} icon={MoreHorizontal} items={moreMenuItems} />
          </div>
        </div>

        {statsOpen && (
          <div className="absolute top-14 right-4 z-20 w-64 rounded-xl border border-cyber-border bg-cyber-dark/95 backdrop-blur-sm p-4 animate-fade-in">
            <h3 className="text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-3">{t('stats.title')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">{t('stats.entities')}</span>
                <span className="text-sm font-mono font-bold text-cyber-cyan">{nodeCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">{t('stats.connections')}</span>
                <span className="text-sm font-mono font-bold text-cyber-blue">{edgeCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">{t('stats.entityTypes')}</span>
                <span className="text-sm font-mono font-bold text-cyber-green">{entityTypes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">{t('stats.mapPins')}</span>
                <span className="text-sm font-mono font-bold text-cyber-cyan">{pinCount}</span>
              </div>
              <div className="h-px bg-cyber-border my-2" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">{t('stats.storage')}</span>
                <span className="text-[10px] font-mono text-cyber-green">{t('stats.storageValue')}</span>
              </div>
            </div>
          </div>
        )}

        {view === 'investigation' ? (
          <InvestigationModule onClose={() => setView('graph')} />
        ) : view === 'graph' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <ReactFlowProvider>
              <InfoTab 
                nodes={nodes}
                edges={edges}
                selectedEdgeId={selectedEdgeId}
                selectedNodeId={selectedNodeId}
                notePanelOpen={notePanelOpen}
                activeCase={activeCase}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onEdgeClick={handleEdgeClick}
                onNodeClick={handleNodeClick as any}
                onPaneClick={handlePaneClick}
                onSetNotePanelOpen={setNotePanelOpen}
                onSetSelectedNodeId={setSelectedNodeId}
                onSetSelectedEdgeId={setSelectedEdgeId}
                updateNodeData={updateNodeData}
                updateEdgeData={updateEdgeData}
                updateCaseNotes={updateCaseNotes}
                updateCaseTitle={updateCaseTitle}
                onRegisterExportPng={handleRegisterExportPng}
                onRegisterExportPdf={handleRegisterExportPdf}
              />
            </ReactFlowProvider>
          </div>
        ) : view === 'map' ? (
          <div className="flex-1 flex min-h-0">
            <MapTab 
              pins={activeCase?.locations || []}
              nodes={nodes}
              onUpdatePins={(pins) => {
                if (!activeCaseId) return;
                updateCase(activeCaseId, activeCase?.name || '', activeCase?.description || '', { locations: pins });
              }}
              onGeocodeLocation={handleGeocodeLocation}
              onUpdatePin={updatePin}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <ReactFlowProvider>
              <InfoTab 
                nodes={nodes}
                edges={edges}
                selectedEdgeId={selectedEdgeId}
                selectedNodeId={selectedNodeId}
                notePanelOpen={notePanelOpen}
                activeCase={activeCase}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onEdgeClick={handleEdgeClick}
                onNodeClick={handleNodeClick as any}
                onPaneClick={handlePaneClick}
                onSetNotePanelOpen={setNotePanelOpen}
                onSetSelectedNodeId={setSelectedNodeId}
                onSetSelectedEdgeId={setSelectedEdgeId}
                updateNodeData={updateNodeData}
                updateEdgeData={updateEdgeData}
                updateCaseNotes={updateCaseNotes}
                updateCaseTitle={updateCaseTitle}
                onRegisterExportPng={handleRegisterExportPng}
                onRegisterExportPdf={handleRegisterExportPdf}
              />
            </ReactFlowProvider>
          </div>
        )}

        <div className="h-7 flex items-center justify-between px-4 border-t border-cyber-border bg-cyber-dark/80 text-[10px] font-mono text-cyber-text-dim flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
              OPSEC: {t('footer.opsec')}
            </span>
            <span className="text-cyber-border">|</span>
            <span className="text-cyber-text-dim/60">{t('footer.ethical')}</span>
            <span className="text-cyber-border">|</span>
            <span>{t('footer.brand')}</span>
          </div>
          <div className="flex items-center gap-3">
            {lastSaved && (
              <span className="flex items-center gap-1 text-cyber-green/70">
                <span className="w-1 h-1 rounded-full bg-cyber-green" />
                {t('footer.saved')} {new Date(lastSaved).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span>
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          <ToolkitPanel isOpen={toolkitOpen} onClose={() => setToolkitOpen(false)} />
          <HermesAnalyzer />
        </div>
      </div>

      {photoViewer && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPhotoViewer(null)}
        >
          <button
            onClick={() => setPhotoViewer(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-lg flex items-center justify-center text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-panel transition-colors z-10"
          >
            <X size={20} />
          </button>
          <img
            src={photoViewer.url}
            alt={photoViewer.label}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {photoViewer.label && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-cyber-text-dim font-mono">
              {photoViewer.label}
            </p>
          )}
        </div>
      )}

      {fieldsNode && (
        <IdentifierModal
          nodeId={fieldsNode.id}
          data={fieldsNode.data}
          onUpdate={updateNodeData}
          onClose={() => setFieldsNodeId(null)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <NavigationProvider>
            <AppInner />
          </NavigationProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}