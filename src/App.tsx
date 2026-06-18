import { HermesAnalyzer } from './components/HermesAnalyzer';
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
          const margin = 16;
          const contentW = pdfW - margin * 2;
          const dateStr = new Date().toLocaleDateString('fr-FR');
          const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const nodesCount = activeCase.nodes.length;
          const edgesCount = activeCase.edges.length;

          // Palette — light professional
          const C = {
            black:     [15,  20,  30]  as [number,number,number],
            darkGray:  [55,  65,  81]  as [number,number,number],
            midGray:   [107, 114, 128] as [number,number,number],
            lightGray: [209, 213, 219] as [number,number,number],
            bg:        [248, 249, 251] as [number,number,number],
            white:     [255, 255, 255] as [number,number,number],
            accent:    [30,  64,  175] as [number,number,number],
            accentLt:  [219, 234, 254] as [number,number,number],
            border:    [226, 232, 240] as [number,number,number],
            rowEven:   [241, 245, 249] as [number,number,number],
          };

          const stripMd = (raw: string): string =>
            raw
              .replace(/^#{1,6}\s+/gm, '')
              .replace(/\*\*(.+?)\*\*/g, '$1')
              .replace(/\*(.+?)\*/g, '$1')
              .replace(/`(.+?)`/g, '$1')
              .replace(/^[-*+]\s+/gm, '• ')
              .replace(/^\d+\.\s+/gm, (m) => m)
              .replace(/\[(.+?)\]\(.+?\)/g, '$1')
              .trim();

          // ── Page header (light bar) ───────────────────────────────────
          let pageIndex = 1;
          const drawHeader = () => {
            pdf.setFillColor(...C.white);
            pdf.rect(0, 0, pdfW, pdfH, 'F');

            // Top accent bar
            pdf.setFillColor(...C.accent);
            pdf.rect(0, 0, pdfW, 8, 'F');

            // Case name left
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.setTextColor(...C.white);
            const caseName = activeCase.caseTitle
              ? `${activeCase.name}  —  ${activeCase.caseTitle}`
              : activeCase.name;
            pdf.text(caseName.toUpperCase(), margin, 5.5);

            // Page number right
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Page ${pageIndex}`, pdfW - margin, 5.5, { align: 'right' });

            // Thin separator under bar
            pdf.setDrawColor(...C.border);
            pdf.setLineWidth(0.2);
            pdf.line(margin, 9, pdfW - margin, 9);
          };

          // ── Page footer ───────────────────────────────────────────────
          const drawFooter = () => {
            pdf.setDrawColor(...C.border);
            pdf.setLineWidth(0.2);
            pdf.line(margin, pdfH - 8, pdfW - margin, pdfH - 8);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(...C.midGray);
            pdf.text(`Rapport d'investigation OSINT — Généré le ${dateStr} à ${timeStr}`, margin, pdfH - 4.5);
            pdf.text('CONFIDENTIEL', pdfW - margin, pdfH - 4.5, { align: 'right' });
          };

          // ── PAGE 1 ────────────────────────────────────────────────────
          drawHeader();
          drawFooter();

          let y = 14;

          // Main title
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(20);
          pdf.setTextColor(...C.black);
          pdf.text('Rapport d\'Investigation OSINT', margin, y);
          y += 7;

          // Subtitle / case title
          if (activeCase.caseTitle) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.setTextColor(...C.accent);
            pdf.text(activeCase.caseTitle, margin, y);
            y += 5;
          }

          // Case name tag
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(...C.darkGray);
          pdf.text(`Dossier : `, margin, y);
          pdf.setFont('helvetica', 'normal');
          pdf.text(activeCase.name, margin + pdf.getTextWidth('Dossier : '), y);
          y += 5;

          // Thin rule
          pdf.setDrawColor(...C.accent);
          pdf.setLineWidth(0.5);
          pdf.line(margin, y, margin + 60, y);
          pdf.setLineWidth(0.2);
          y += 7;

          // ── Graph image ───────────────────────────────────────────────
          const ratio = img.width / img.height;
          const maxImgH = 110;
          let imgW = contentW;
          let imgH = imgW / ratio;
          if (imgH > maxImgH) { imgH = maxImgH; imgW = imgH * ratio; }
          const imgX = margin + (contentW - imgW) / 2;

          // Border rect around image
          pdf.setDrawColor(...C.darkGray);
          pdf.setLineWidth(0.4);
          pdf.rect(imgX - 0.5, y - 0.5, imgW + 1, imgH + 1);
          pdf.addImage(dataUrl, 'PNG', imgX, y, imgW, imgH);
          y += imgH + 1;

          // Graph caption
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(7.5);
          pdf.setTextColor(...C.midGray);
          pdf.text(`Graphe d'investigation — ${nodesCount} entité${nodesCount !== 1 ? 's' : ''}, ${edgesCount} lien${edgesCount !== 1 ? 's' : ''}`, pdfW / 2, y + 3.5, { align: 'center' });
          y += 9;

          // ── Summary table ─────────────────────────────────────────────
          const tableY = y;
          const colW = contentW / 3;
          const rowH = 9;

          const stats: [string, string][] = [
            ['Entités', String(nodesCount)],
            ['Liens', String(edgesCount)],
            ['Date', dateStr],
          ];

          // Table header
          pdf.setFillColor(...C.accent);
          pdf.rect(margin, tableY, contentW, rowH, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(...C.white);
          const headers = ['Statistique', 'Valeur', 'Dossier'];
          headers.forEach((h, i) => pdf.text(h, margin + colW * i + 3, tableY + 6));

          // Table rows
          stats.forEach(([label, val], i) => {
            const ry = tableY + rowH + i * rowH;
            pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white));
            pdf.rect(margin, ry, contentW, rowH, 'F');
            pdf.setDrawColor(...C.border);
            pdf.setLineWidth(0.2);
            pdf.rect(margin, ry, contentW, rowH);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(...C.darkGray);
            pdf.text(label, margin + 3, ry + 6);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...C.black);
            pdf.text(val, margin + colW + 3, ry + 6);
            // Third col: case name in first row, empty after
            if (i === 0) {
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(...C.midGray);
              const trimmed = activeCase.name.length > 28 ? activeCase.name.slice(0, 26) + '…' : activeCase.name;
              pdf.text(trimmed, margin + colW * 2 + 3, ry + 6);
            }
          });
          y = tableY + rowH + stats.length * rowH + 4;

          // ── Case description (if any) ─────────────────────────────────
          if (activeCase.description?.trim()) {
            y += 3;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8.5);
            pdf.setTextColor(...C.darkGray);
            const descLines = pdf.splitTextToSize(activeCase.description.trim(), contentW);
            descLines.forEach((line: string) => {
              pdf.text(line, margin, y);
              y += 4.5;
            });
          }

          // ── Pages 2+ : notes ─────────────────────────────────────────
          const entitiesWithNotes = activeCase.nodes
            .filter((n) => (n.data as EntityData).notes?.trim())
            .map((n) => ({ id: n.id, data: n.data as EntityData }));
          const hasCaseNotes = !!activeCase.caseNotes?.trim();
          const hasReport = hasCaseNotes || entitiesWithNotes.length > 0;

          if (!hasReport) {
            pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_rapport.pdf`);
            resolve();
            return;
          }

          // New page for notes
          pdf.addPage();
          pageIndex++;
          drawHeader();
          drawFooter();

          const lineH = 5;
          const sectionGap = 8;
          y = 14;

          const ensureSpace = (needed: number) => {
            if (y + needed > pdfH - 14) {
              pdf.addPage();
              pageIndex++;
              drawHeader();
              drawFooter();
              y = 14;
            }
          };

          // Report section title
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(15);
          pdf.setTextColor(...C.black);
          pdf.text('Rapport d\'enquête', margin, y);
          y += 5;
          pdf.setDrawColor(...C.accent);
          pdf.setLineWidth(0.5);
          pdf.line(margin, y, margin + 55, y);
          pdf.setLineWidth(0.2);
          y += 2;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(...C.midGray);
          pdf.text(`Généré le ${dateStr} à ${timeStr}`, margin, y);
          y += sectionGap;

          // ── Case notes ────────────────────────────────────────────────
          if (hasCaseNotes) {
            ensureSpace(20);

            // Section label
            pdf.setFillColor(...C.accentLt);
            pdf.rect(margin, y - 4, contentW, 7, 'F');
            pdf.setDrawColor(...C.accent);
            pdf.setLineWidth(0.4);
            pdf.line(margin, y - 4, margin, y + 3);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(...C.accent);
            pdf.text('Notes de dossier', margin + 3, y);
            y += 6;

            const plainNotes = stripMd(activeCase.caseNotes!);
            const lines = pdf.splitTextToSize(plainNotes, contentW);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(...C.darkGray);
            for (const line of lines) {
              ensureSpace(lineH);
              pdf.text(line, margin, y);
              y += lineH;
            }
            y += sectionGap;
          }

          // ── Entity notes ──────────────────────────────────────────────
          if (entitiesWithNotes.length > 0) {
            ensureSpace(20);

            pdf.setFillColor(...C.accentLt);
            pdf.rect(margin, y - 4, contentW, 7, 'F');
            pdf.setDrawColor(...C.accent);
            pdf.setLineWidth(0.4);
            pdf.line(margin, y - 4, margin, y + 3);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(...C.accent);
            pdf.text('Notes par entité', margin + 3, y);
            y += 8;

            for (const entity of entitiesWithNotes) {
              const plainEntityNotes = stripMd(entity.data.notes);
              const entityLines = pdf.splitTextToSize(plainEntityNotes, contentW - 6);
              const blockH = 8 + entityLines.length * lineH + 4;
              ensureSpace(blockH);

              // Entity row header
              pdf.setFillColor(...C.border);
              pdf.rect(margin, y - 4, contentW, 7, 'F');
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(8.5);
              pdf.setTextColor(...C.black);
              pdf.text(entity.data.label, margin + 3, y);
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7.5);
              pdf.setTextColor(...C.midGray);
              const typeLabel = entity.data.entityType.charAt(0).toUpperCase() + entity.data.entityType.slice(1);
              pdf.text(typeLabel, pdfW - margin - 3, y, { align: 'right' });
              y += 5;

              // Notes text
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(9);
              pdf.setTextColor(...C.darkGray);
              for (const line of entityLines) {
                ensureSpace(lineH);
                pdf.text(line, margin + 4, y);
                y += lineH;
              }

              // Separator
              pdf.setDrawColor(...C.border);
              pdf.setLineWidth(0.2);
              pdf.line(margin, y + 1, pdfW - margin, y + 1);
              y += sectionGap - 2;
            }
          }

          pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_rapport.pdf`);
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

 {/* Fenêtre Flottante Jarvis */}
      <div>
        <HermesAnalyzer />
      </div>
}
