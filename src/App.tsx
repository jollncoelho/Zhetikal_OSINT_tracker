import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Ghost, Activity, Home } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

import EntityNode from './components/EntityNode';
import SocialNode from './components/SocialNode';
import CustomEdge from './components/CustomEdge';
import Sidebar from './components/Sidebar';
import ToolkitPanel from './components/ToolkitPanel';
import NotePanel from './components/NotePanel';
import DisclaimerModal from './components/DisclaimerModal';
import { useStore } from './store/useStore';
import type { EntityData, EntityNode as EntityNodeType, EntityType } from './types';

const nodeTypes: NodeTypes = {
  entity: EntityNode as NodeTypes['entity'],
  social: SocialNode as NodeTypes['social'],
};

const edgeTypes = {
  custom: CustomEdge,
};

// Inner component that has access to useReactFlow context
function FlowExporter({
  activeCase,
  onRegisterExportPng,
  onRegisterExportPdf,
}: {
  activeCase: ReturnType<typeof useStore>['activeCase'];
  onRegisterExportPng: (fn: () => Promise<void>) => void;
  onRegisterExportPdf: (fn: () => Promise<void>) => void;
}) {
  const { getNodes } = useReactFlow();

  const captureViewport = useCallback(async (): Promise<string> => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewport) throw new Error('Viewport not found');
    if (getNodes().length === 0) throw new Error('No nodes to capture');

    return toPng(viewport, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: '#1a1a1a',
      filter: (node) => {
        if (node instanceof Element) {
          if (node.classList.contains('react-flow__controls')) return false;
          if (node.classList.contains('react-flow__minimap')) return false;
        }
        return true;
      },
    });
  }, [getNodes]);

  useEffect(() => {
    const exportPng = async () => {
      if (!activeCase) return;
      const dataUrl = await captureViewport();
      const link = document.createElement('a');
      link.download = `${activeCase.name.replace(/\s+/g, '_')}_graph.png`;
      link.href = dataUrl;
      link.click();
    };

    const exportPdf = async () => {
      if (!activeCase) return;
      const dataUrl = await captureViewport();

      await new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          const pdfW = pdf.internal.pageSize.getWidth();
          const pdfH = pdf.internal.pageSize.getHeight();
          const margin = 14;
          const contentW = pdfW - margin * 2;

          // ── Helper: strip Markdown to plain text ──────────────────────
          const stripMd = (raw: string): string =>
            raw
              .replace(/^#{1,6}\s+/gm, '')       // headings
              .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
              .replace(/\*(.+?)\*/g, '$1')         // italic
              .replace(/`(.+?)`/g, '$1')           // inline code
              .replace(/^[-*+]\s+/gm, '• ')        // unordered list
              .replace(/^\d+\.\s+/gm, (m) => m)   // ordered list — keep as-is
              .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
              .trim();

          // ── Helper: draw page header ──────────────────────────────────
          const drawPageHeader = (pageNum: number, totalLabel?: string) => {
            pdf.setFillColor(10, 14, 23);
            pdf.rect(0, 0, pdfW, 12, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(0, 240, 255);
            pdf.text('GHOSTINT / CYBERZ7', margin, 8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(148, 163, 184);
            const ref = activeCase.caseTitle ? ` — ${activeCase.caseTitle}` : '';
            pdf.text(`${activeCase.name}${ref}`, margin + 22, 8);
            const pageLabel = totalLabel ? `Page ${pageNum} ${totalLabel}` : `Page ${pageNum}`;
            pdf.text(pageLabel, pdfW - margin, 8, { align: 'right' });
            pdf.setDrawColor(30, 58, 95);
            pdf.line(margin, 11, pdfW - margin, 11);
          };

          // ── PAGE 1: Graph ─────────────────────────────────────────────
          drawPageHeader(1);

          // Title block
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(16);
          pdf.setTextColor(226, 232, 240);
          pdf.text(activeCase.name, margin, 22);

          if (activeCase.caseTitle) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(0, 240, 255);
            pdf.text(activeCase.caseTitle, margin, 29);
          }

          const titleBlockH = activeCase.caseTitle ? 34 : 27;

          // Graph image
          const ratio = img.width / img.height;
          const maxImgH = pdfH - titleBlockH - margin - 16;
          let imgW = contentW;
          let imgH = imgW / ratio;
          if (imgH > maxImgH) { imgH = maxImgH; imgW = imgH * ratio; }
          const imgX = margin + (contentW - imgW) / 2;
          pdf.addImage(dataUrl, 'PNG', imgX, titleBlockH, imgW, imgH);

          // Graph caption
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 116, 139);
          const nodesCount = activeCase.nodes.length;
          const edgesCount = activeCase.edges.length;
          pdf.text(
            `${nodesCount} entité${nodesCount !== 1 ? 's' : ''} · ${edgesCount} lien${edgesCount !== 1 ? 's' : ''} · ${new Date().toLocaleDateString('fr-FR')}`,
            pdfW / 2, titleBlockH + imgH + 5, { align: 'center' }
          );

          // ── PAGES 2+: Report ──────────────────────────────────────────
          const entitiesWithNotes = activeCase.nodes
            .filter((n) => (n.data as EntityData).notes?.trim())
            .map((n) => ({ id: n.id, data: n.data as EntityData }));

          const hasCaseNotes = !!activeCase.caseNotes?.trim();
          const hasReport = hasCaseNotes || entitiesWithNotes.length > 0;

          if (!hasReport) {
            pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_report.pdf`);
            resolve();
            return;
          }

          pdf.addPage();
          let pageIndex = 2;
          drawPageHeader(pageIndex);

          let y = 18;
          const lineH = 5;
          const sectionGap = 8;

          const ensureSpace = (needed: number) => {
            if (y + needed > pdfH - margin) {
              pdf.addPage();
              pageIndex++;
              drawPageHeader(pageIndex);
              y = 18;
            }
          };

          // Report title
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(226, 232, 240);
          pdf.text('Rapport d\'enquête', margin, y);
          y += 8;

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Généré le ${new Date().toLocaleString('fr-FR')} — Ghostint / CyberZ7`, margin, y);
          y += 10;

          pdf.setDrawColor(30, 58, 95);
          pdf.line(margin, y, pdfW - margin, y);
          y += sectionGap;

          // ── Case notes section ────────────────────────────────────────
          if (hasCaseNotes) {
            ensureSpace(12);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.setTextColor(0, 200, 212);
            pdf.text('Notes de dossier', margin, y);
            y += 2;
            pdf.setDrawColor(0, 200, 212);
            pdf.setLineWidth(0.3);
            pdf.line(margin, y, margin + 50, y);
            pdf.setLineWidth(0.2);
            y += 5;

            const plainNotes = stripMd(activeCase.caseNotes!);
            const lines = pdf.splitTextToSize(plainNotes, contentW);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(226, 232, 240);
            for (const line of lines) {
              ensureSpace(lineH);
              pdf.text(line, margin, y);
              y += lineH;
            }
            y += sectionGap;
          }

          // ── Entity notes sections ─────────────────────────────────────
          if (entitiesWithNotes.length > 0) {
            ensureSpace(12);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.setTextColor(0, 200, 212);
            pdf.text('Notes par entité', margin, y);
            y += 2;
            pdf.setDrawColor(0, 200, 212);
            pdf.setLineWidth(0.3);
            pdf.line(margin, y, margin + 50, y);
            pdf.setLineWidth(0.2);
            y += 7;

            for (const entity of entitiesWithNotes) {
              ensureSpace(16);

              // Entity header pill
              pdf.setFillColor(17, 24, 39);
              pdf.roundedRect(margin, y - 4, contentW, 7, 1.5, 1.5, 'F');
              pdf.setDrawColor(30, 58, 95);
              pdf.roundedRect(margin, y - 4, contentW, 7, 1.5, 1.5, 'S');

              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(9);
              pdf.setTextColor(226, 232, 240);
              pdf.text(entity.data.label, margin + 3, y);

              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7.5);
              pdf.setTextColor(100, 116, 139);
              pdf.text(entity.data.entityType.toUpperCase(), pdfW - margin - 3, y, { align: 'right' });
              y += 6;

              const plainEntityNotes = stripMd(entity.data.notes);
              const entityLines = pdf.splitTextToSize(plainEntityNotes, contentW - 4);
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(9);
              pdf.setTextColor(203, 213, 225);
              for (const line of entityLines) {
                ensureSpace(lineH);
                pdf.text(line, margin + 2, y);
                y += lineH;
              }
              y += sectionGap - 2;
            }
          }

          pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_report.pdf`);
          resolve();
        };
        img.src = dataUrl;
      });
    };

    onRegisterExportPng(exportPng);
    onRegisterExportPdf(exportPdf);
  }, [activeCase, captureViewport, onRegisterExportPng, onRegisterExportPdf]);

  return null;
}

export default function App() {
  const {
    cases,
    activeCase,
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
    onConnect,
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
  } = useStore();

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

  const selectedNode = (nodes.find((n) => n.id === selectedNodeId) as EntityNodeType | undefined) ?? null;

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
    };
    const handleExpandNote = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setSelectedNodeId(id);
      setNotePanelOpen(true);
    };
    window.addEventListener('entity-update', handleUpdate);
    window.addEventListener('entity-delete', handleDeleteNode);
    window.addEventListener('edge-delete', handleDeleteEdge);
    window.addEventListener('entity-expand-note', handleExpandNote);
    return () => {
      window.removeEventListener('entity-update', handleUpdate);
      window.removeEventListener('entity-delete', handleDeleteNode);
      window.removeEventListener('edge-delete', handleDeleteEdge);
      window.removeEventListener('entity-expand-note', handleExpandNote);
    };
  }, [updateNodeData, deleteNode, deleteEdge]);

  useEffect(() => {
    if (cases.length === 0) {
      createCase('Default Case', '');
    }
  }, [cases.length, createCase]);

  const handleAddEntity = useCallback(
    (type: EntityType, label: string) => addEntity(type, label),
    [addEntity]
  );

  const handleRegisterExportPng = useCallback((fn: () => Promise<void>) => {
    setExportPngFn(() => fn);
  }, []);

  const handleRegisterExportPdf = useCallback((fn: () => Promise<void>) => {
    setExportPdfFn(() => fn);
  }, []);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  const handleUpdateEntityNotes = useCallback((nodeId: string, notes: string) => {
    updateNodeData(nodeId, { notes });
  }, [updateNodeData]);

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

  const styledEdges = edges.map((e) => ({
    ...e,
    selected: e.id === selectedEdgeId,
    style: e.id === selectedEdgeId
      ? { stroke: '#ef4444' }
      : { stroke: '#00c8d4' },
  }));

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const entityTypes = new Set(nodes.map((n) => (n.data as EntityData)?.entityType)).size;

  const miniMapNodeColor = useCallback((node: Node) => {
    const data = node.data as EntityData | undefined;
    return data?.color || '#1e3a5f';
  }, []);

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
        {/* Top bar */}
        <div className="h-[60px] flex items-center justify-between px-4 border-b border-cyber-border bg-cyber-dark/80 backdrop-blur-sm z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/photo_2026-05-04_13-46-20.jpg"
              alt="Zhétikal"
              className="h-11 w-11 rounded-full object-cover object-center mix-blend-lighten flex-shrink-0"
              style={{ filter: 'brightness(1.15) contrast(1.1)' }}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-cyber-text">
                {activeCase?.name || 'No Case'}
              </span>
              {activeCase && (
                <span className="text-[10px] font-mono text-cyber-text-dim bg-cyber-panel px-2 py-0.5 rounded border border-cyber-border">
                  {nodeCount} entities / {edgeCount} links
                </span>
              )}
            </div>
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
              <Activity size={12} />
              Stats
            </button>

            <button
              onClick={() => setToolkitOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan text-[11px] font-semibold hover:bg-cyber-cyan/20 transition-colors"
            >
              <Ghost size={12} />
              Ghostint-Tools
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

        {/* Stats overlay */}
        {statsOpen && (
          <div className="absolute top-14 right-4 z-20 w-64 rounded-xl border border-cyber-border bg-cyber-dark/95 backdrop-blur-sm p-4 animate-fade-in">
            <h3 className="text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-3">
              Case Statistics
            </h3>
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
              <div className="h-px bg-cyber-border my-2" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-cyber-text-dim">Storage</span>
                <span className="text-[10px] font-mono text-cyber-green">Local Only (OPSEC)</span>
              </div>
            </div>
          </div>
        )}

        {/* Canvas + Note panel row */}
        <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 react-flow-canvas-wrapper min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={handleEdgeClick}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={null}
            fitView
            defaultEdgeOptions={{
              type: 'custom',
              style: { stroke: '#00c8d4' },
            }}
            proOptions={{ hideAttribution: true }}
            className="bg-cyber-black"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e3a5f" />
            <Controls
              showInteractive={false}
              className="!border-cyber-border !rounded-xl !overflow-hidden"
            />
            <MiniMap
              nodeColor={miniMapNodeColor}
              maskColor="rgba(10, 14, 23, 0.8)"
              className="!border-cyber-border !rounded-xl"
            />
            <FlowExporter
              activeCase={activeCase}
              onRegisterExportPng={handleRegisterExportPng}
              onRegisterExportPdf={handleRegisterExportPdf}
            />
          </ReactFlow>
        </div>

          {notePanelOpen && (
            <NotePanel
              selectedNode={selectedNode}
              caseNotes={activeCase?.caseNotes ?? ''}
              caseTitle={activeCase?.caseTitle ?? ''}
              caseDescription={activeCase?.description}
              onUpdateEntityNotes={handleUpdateEntityNotes}
              onUpdateCaseNotes={updateCaseNotes}
              onUpdateCaseTitle={updateCaseTitle}
              onClose={() => setNotePanelOpen(false)}
            />
          )}
        </div>

        {/* Status bar */}
        <div className="h-7 flex items-center justify-between px-4 border-t border-cyber-border bg-cyber-dark/80 text-[10px] font-mono text-cyber-text-dim">
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
                Saved {lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span>
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      <ToolkitPanel isOpen={toolkitOpen} onClose={() => setToolkitOpen(false)} />
    </div>
  );
}
