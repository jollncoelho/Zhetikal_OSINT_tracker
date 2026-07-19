import { HermesAnalyzer } from './components/HermesAnalyzer';
import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Ghost, Activity, Home, Network, Map } from 'lucide-react';

import Sidebar from './components/Sidebar';
import ToolkitPanel from './components/ToolkitPanel';
import DisclaimerModal from './components/DisclaimerModal';
import InfoTab from './components/InfoTab';
import MapTab from './components/MapTab';
import IdentifierModal from './components/IdentifierModal';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { useStore } from './store/useStore';
import type { EntityData, EntityNode as EntityNodeType, EntityType } from './types';
import type { Edge } from '@xyflow/react';

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
    clearCanvas,
    saveProgress,
    exportCase,
    importCase,
    updateCaseNotes,
    updateCaseTitle,
    closeCase,
    updateCase,
    updatePin,
    deletePin,
  } = useStore();

  // Calcul de activeCase
  const activeCase = activeCaseId ? cases.find((c) => c.id === activeCaseId) ?? null : null;

  const onConnect = useCallback((params: any) => {
    if (storeOnConnect) {
      storeOnConnect(params);
    }
  }, [storeOnConnect]);

  const { view, setView } = useNavigation();

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

  const fieldsNode = fieldsNodeId
    ? (nodes.find((n) => n.id === fieldsNodeId) as EntityNodeType | undefined) ?? null
    : null;

  // ✅ FONCTION POUR SAUVEGARDER LES COORDONNÉES GÉOCODÉES
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
      const { id, label, notes, socialPlatform, color } = (e as CustomEvent).detail;
      updateNodeData(id, { label, notes, ...(socialPlatform !== undefined && { socialPlatform }), ...(color !== undefined && { color }) });
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
    window.addEventListener('entity-update', handleUpdate);
    window.addEventListener('entity-delete', handleDeleteNode);
    window.addEventListener('edge-delete', handleDeleteEdge);
    window.addEventListener('entity-expand-note', handleExpandNote);
    window.addEventListener('entity-open-fields', handleOpenFields);
    return () => {
      window.removeEventListener('entity-update', handleUpdate);
      window.removeEventListener('entity-delete', handleDeleteNode);
      window.removeEventListener('edge-delete', handleDeleteEdge);
      window.removeEventListener('entity-expand-note', handleExpandNote);
      window.removeEventListener('entity-open-fields', handleOpenFields);
    };
  }, [updateNodeData, deleteNode, deleteEdge]);

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
    (type: EntityType, label: string, extra?: Partial<EntityData>) => addEntity(type, label, extra),
    [addEntity]
  );

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => { setSelectedEdgeId(null); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-cyber-black">
      {!disclaimerAccepted && <DisclaimerModal onAccept={handleAcceptDisclaimer} />}

      <Sidebar
        cases={cases}
        activeCaseId={activeCaseId}
        onCreateCase={createCase}
        onSwitchCase={switchCase}
        onCloseCase={() => { closeCase(); setNotePanelOpen(false); setSelectedNodeId(null); }}
        onDeleteCase={deleteCase}
        onUpdateCase={updateCase}
        onAddEntity={handleAddEntity}
        onSaveProgress={saveProgress}
        onExport={exportCase}
        onExportPdf={exportPdfFn}
        onExportPng={exportPngFn}
        onImport={importCase}
        onClearCanvas={clearCanvas}
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

          <div className="flex items-center gap-1 bg-cyber-black/60 rounded-xl border border-cyber-border p-1">
            <button
              onClick={() => setView('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                view === 'graph'
                  ? 'bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/30'
                  : 'text-cyber-text-dim hover:text-cyber-text border border-transparent'
              }`}
            >
              <Network size={11} /> Information
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                view === 'map'
                  ? 'bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/30'
                  : 'text-cyber-text-dim hover:text-cyber-text border border-transparent'
              }`}
            >
              <Map size={11} /> Map
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatsOpen(!statsOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                statsOpen
                  ? 'bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30'
                  : 'text-cyber-text-dim hover:bg-cyber-panel border border-transparent'
              }`}
            >
              <Activity size={12} /> Stats
            </button>
            <button
              onClick={() => setToolkitOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan text-[11px] font-semibold hover:bg-cyber-cyan/20 transition-colors"
            >
              <Ghost size={12} /> Ghostint-Tools
            </button>
            <a
              href="https://prohacking77.me"
              target="_blank"
              rel="noopener noreferrer"
              title="Accueil — prohacking77.me"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyber-panel border border-cyber-border text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan/40 transition-all duration-150"
            >
              <Home size={14} />
            </a>
          </div>
        </div>

        {statsOpen && (
          <div className="absolute top-14 right-4 z-20 w-64 rounded-xl border border-cyber-border bg-cyber-dark/95 backdrop-blur-sm p-4 animate-fade-in">
            <h3 className="text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-3">Case Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">Entities</span>
                <span className="text-sm font-mono font-bold text-cyber-cyan">{nodeCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">Connections</span>
                <span className="text-sm font-mono font-bold text-cyber-blue">{edgeCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">Entity Types</span>
                <span className="text-sm font-mono font-bold text-cyber-green">{entityTypes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">Map Pins</span>
                <span className="text-sm font-mono font-bold text-cyber-cyan">{pinCount}</span>
              </div>
              <div className="h-px bg-cyber-border my-2" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">Storage</span>
                <span className="text-[10px] font-mono text-cyber-green">Local Only (OPSEC)</span>
              </div>
            </div>
          </div>
        )}

        {view === 'graph' ? (
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
                updateNodeData={updateNodeData}
                updateCaseNotes={updateCaseNotes}
                updateCaseTitle={updateCaseTitle}
                onRegisterExportPng={handleRegisterExportPng}
                onRegisterExportPdf={handleRegisterExportPdf}
              />
            </ReactFlowProvider>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <MapTab
              pins={activeCase?.locations || []}
              nodes={nodes}
              onUpdatePins={(pins) => {
                if (!activeCaseId) return;
                updateCase(activeCaseId, activeCase?.name || '', activeCase?.description || '', { locations: pins });
              }}
              onGeocodeLocation={handleGeocodeLocation}
            />
          </div>
        )}

        <div className="h-7 flex items-center justify-between px-4 border-t border-cyber-border bg-cyber-dark/80 text-[10px] font-mono text-cyber-text-dim flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
              OPSEC: Local Storage Only
            </span>
            <span className="text-cyber-border">|</span>
            <span className="text-cyber-text-dim/60">Usage éthique et légal requis</span>
            <span className="text-cyber-border">|</span>
            <span>Ghostint / CyberZ7 — OSINT Tracker</span>
          </div>
          <div className="flex items-center gap-3">
            {lastSaved && (
              <span className="flex items-center gap-1 text-cyber-green/70">
                <span className="w-1 h-1 rounded-full bg-cyber-green" />
                Saved {new Date(lastSaved).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span>
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          <ToolkitPanel isOpen={toolkitOpen} onClose={() => setToolkitOpen(false)} />
          <HermesAnalyzer addEntity={addEntity} nodes={nodes as EntityNodeType[]} edges={edges} activeCase={activeCase} />
        </div>
      </div>

      {fieldsNode && (
        <IdentifierModal
          nodeId={fieldsNode.id}
          data={fieldsNode.data}
          onUpdate={updateNodeData}
          onClose={() => setFieldsNodeId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <NavigationProvider>
      <AppInner />
    </NavigationProvider>
  );
}