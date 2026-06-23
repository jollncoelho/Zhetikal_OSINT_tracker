import { useCallback, useEffect } from 'react';
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
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { CaseData, EntityData, EntityNode } from '../types';
import NotePanel from './NotePanel';
import EntityNodeComponent from './EntityNode';
import SocialNodeComponent from './SocialNode';
import CustomEdge from './CustomEdge';

const nodeTypes: NodeTypes = {
  entity: EntityNodeComponent as NodeTypes['entity'],
  social: SocialNodeComponent as NodeTypes['social'],
};

const edgeTypes = const edgeTypes = {};

function FlowExporter({
  activeCase,
  onRegisterExportPng,
  onRegisterExportPdf,
}: {
  activeCase: CaseData | null;
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

          const C = {
            black:    [15,  20,  30]  as [number,number,number],
            darkGray: [55,  65,  81]  as [number,number,number],
            midGray:  [107, 114, 128] as [number,number,number],
            white:    [255, 255, 255] as [number,number,number],
            accent:   [30,  64,  175] as [number,number,number],
            accentLt: [219, 234, 254] as [number,number,number],
            border:   [226, 232, 240] as [number,number,number],
            rowEven:  [241, 245, 249] as [number,number,number],
          };

          const stripMd = (raw: string): string =>
            raw
              .replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1')
              .replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1')
              .replace(/^[-*+]\s+/gm, '• ').replace(/\[(.+?)\]\(.+?\)/g, '$1').trim();

          let pageIndex = 1;
          const drawHeader = () => {
            pdf.setFillColor(...C.white); pdf.rect(0, 0, pdfW, pdfH, 'F');
            pdf.setFillColor(...C.accent); pdf.rect(0, 0, pdfW, 8, 'F');
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...C.white);
            const caseName = activeCase.caseTitle ? `${activeCase.name}  —  ${activeCase.caseTitle}` : activeCase.name;
            pdf.text(caseName.toUpperCase(), margin, 5.5);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Page ${pageIndex}`, pdfW - margin, 5.5, { align: 'right' });
            pdf.setDrawColor(...C.border); pdf.setLineWidth(0.2); pdf.line(margin, 9, pdfW - margin, 9);
          };
          const drawFooter = () => {
            pdf.setDrawColor(...C.border); pdf.setLineWidth(0.2); pdf.line(margin, pdfH - 8, pdfW - margin, pdfH - 8);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...C.midGray);
            pdf.text(`Rapport d'investigation OSINT — Généré le ${dateStr} à ${timeStr}`, margin, pdfH - 4.5);
            pdf.text('CONFIDENTIEL', pdfW - margin, pdfH - 4.5, { align: 'right' });
          };

          drawHeader(); drawFooter();
          let y = 14;

          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.setTextColor(...C.black);
          pdf.text('Rapport d\'Investigation OSINT', margin, y); y += 7;
          if (activeCase.caseTitle) {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(...C.accent);
            pdf.text(activeCase.caseTitle, margin, y); y += 5;
          }
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...C.darkGray);
          pdf.text('Dossier : ', margin, y);
          pdf.setFont('helvetica', 'normal'); pdf.text(activeCase.name, margin + pdf.getTextWidth('Dossier : '), y); y += 5;
          pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.5); pdf.line(margin, y, margin + 60, y); pdf.setLineWidth(0.2); y += 7;

          const ratio = img.width / img.height;
          const maxImgH = 110;
          let imgW = contentW; let imgH = imgW / ratio;
          if (imgH > maxImgH) { imgH = maxImgH; imgW = imgH * ratio; }
          const imgX = margin + (contentW - imgW) / 2;
          pdf.setDrawColor(...C.darkGray); pdf.setLineWidth(0.4); pdf.rect(imgX - 0.5, y - 0.5, imgW + 1, imgH + 1);
          pdf.addImage(dataUrl, 'PNG', imgX, y, imgW, imgH); y += imgH + 1;
          pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(...C.midGray);
          pdf.text(`Graphe d'investigation — ${nodesCount} entité${nodesCount !== 1 ? 's' : ''}, ${edgesCount} lien${edgesCount !== 1 ? 's' : ''}`, pdfW / 2, y + 3.5, { align: 'center' }); y += 9;

          const tableY = y; const colW = contentW / 3; const rowH = 9;
          const stats: [string, string][] = [['Entités', String(nodesCount)], ['Liens', String(edgesCount)], ['Date', dateStr]];
          pdf.setFillColor(...C.accent); pdf.rect(margin, tableY, contentW, rowH, 'F');
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...C.white);
          ['Statistique', 'Valeur', 'Dossier'].forEach((h, i) => pdf.text(h, margin + colW * i + 3, tableY + 6));
          stats.forEach(([label, val], i) => {
            const ry = tableY + rowH + i * rowH;
            pdf.setFillColor(...(i % 2 === 0 ? C.rowEven : C.white)); pdf.rect(margin, ry, contentW, rowH, 'F');
            pdf.setDrawColor(...C.border); pdf.setLineWidth(0.2); pdf.rect(margin, ry, contentW, rowH);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...C.darkGray);
            pdf.text(label, margin + 3, ry + 6); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...C.black);
            pdf.text(val, margin + colW + 3, ry + 6);
            if (i === 0) {
              pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...C.midGray);
              const trimmed = activeCase.name.length > 28 ? activeCase.name.slice(0, 26) + '…' : activeCase.name;
              pdf.text(trimmed, margin + colW * 2 + 3, ry + 6);
            }
          });
          y = tableY + rowH + stats.length * rowH + 4;

          if (activeCase.description?.trim()) {
            y += 3; pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8.5); pdf.setTextColor(...C.darkGray);
            const descLines = pdf.splitTextToSize(activeCase.description.trim(), contentW);
            descLines.forEach((line: string) => { pdf.text(line, margin, y); y += 4.5; });
          }

          const entitiesWithNotes = activeCase.nodes
            .filter((n) => (n.data as EntityData).notes?.trim())
            .map((n) => ({ id: n.id, data: n.data as EntityData }));
          const hasCaseNotes = !!activeCase.caseNotes?.trim();
          if (!hasCaseNotes && entitiesWithNotes.length === 0) { pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_rapport.pdf`); resolve(); return; }

          pdf.addPage(); pageIndex++; drawHeader(); drawFooter();
          const lineH = 5; const sectionGap = 8; y = 14;
          const ensureSpace = (needed: number) => {
            if (y + needed > pdfH - 14) { pdf.addPage(); pageIndex++; drawHeader(); drawFooter(); y = 14; }
          };

          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(...C.black);
          pdf.text('Rapport d\'enquête', margin, y); y += 5;
          pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.5); pdf.line(margin, y, margin + 55, y); pdf.setLineWidth(0.2); y += 2;
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...C.midGray);
          pdf.text(`Généré le ${dateStr} à ${timeStr}`, margin, y); y += sectionGap;

          if (hasCaseNotes) {
            ensureSpace(20);
            pdf.setFillColor(...C.accentLt); pdf.rect(margin, y - 4, contentW, 7, 'F');
            pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.4); pdf.line(margin, y - 4, margin, y + 3);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...C.accent);
            pdf.text('Notes de dossier', margin + 3, y); y += 6;
            const lines = pdf.splitTextToSize(stripMd(activeCase.caseNotes!), contentW);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...C.darkGray);
            for (const line of lines) { ensureSpace(lineH); pdf.text(line, margin, y); y += lineH; }
            y += sectionGap;
          }

          if (entitiesWithNotes.length > 0) {
            ensureSpace(20);
            pdf.setFillColor(...C.accentLt); pdf.rect(margin, y - 4, contentW, 7, 'F');
            pdf.setDrawColor(...C.accent); pdf.setLineWidth(0.4); pdf.line(margin, y - 4, margin, y + 3);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...C.accent);
            pdf.text('Notes par entité', margin + 3, y); y += 8;
            for (const entity of entitiesWithNotes) {
              const entityLines = pdf.splitTextToSize(stripMd(entity.data.notes), contentW - 6);
              ensureSpace(8 + entityLines.length * lineH + 4);
              pdf.setFillColor(...C.border); pdf.rect(margin, y - 4, contentW, 7, 'F');
              pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...C.black);
              pdf.text(entity.data.label, margin + 3, y);
              pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...C.midGray);
              const typeLabel = entity.data.entityType.charAt(0).toUpperCase() + entity.data.entityType.slice(1);
              pdf.text(typeLabel, pdfW - margin - 3, y, { align: 'right' }); y += 5;
              pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...C.darkGray);
              for (const line of entityLines) { ensureSpace(lineH); pdf.text(line, margin + 4, y); y += lineH; }
              pdf.setDrawColor(...C.border); pdf.setLineWidth(0.2); pdf.line(margin, y + 1, pdfW - margin, y + 1); y += sectionGap - 2;
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

interface InfoTabProps {
  nodes: EntityNode[];
  edges: Edge[];
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  notePanelOpen: boolean;
  activeCase: CaseData | null;
  onNodesChange: OnNodesChange<EntityNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onEdgeClick: (e: React.MouseEvent, edge: Edge) => void;
  onNodeClick: (e: React.MouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onSetNotePanelOpen: (open: boolean) => void;
  onSetSelectedNodeId: (id: string | null) => void;
  updateNodeData: (nodeId: string, data: Partial<EntityData>) => void;
  updateCaseNotes: (notes: string) => void;
  updateCaseTitle: (title: string) => void;
  onRegisterExportPng: (fn: () => Promise<void>) => void;
  onRegisterExportPdf: (fn: () => Promise<void>) => void;
}

export default function InfoTab({
  nodes,
  edges,
  selectedEdgeId,
  selectedNodeId,
  notePanelOpen,
  activeCase,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeClick,
  onNodeClick,
  onPaneClick,
  onSetNotePanelOpen,
  onSetSelectedNodeId,
  updateNodeData,
  updateCaseNotes,
  updateCaseTitle,
  onRegisterExportPng,
  onRegisterExportPdf,
}: InfoTabProps) {
  const selectedNode = (nodes.find((n) => n.id === selectedNodeId) as EntityNode | undefined) ?? null;

  const miniMapNodeColor = useCallback((node: Node) => {
    const data = node.data as EntityData | undefined;
    return data?.color || '#1e3a5f';
  }, []);

  const handleUpdateEntityNotes = useCallback(
    (nodeId: string, notes: string) => updateNodeData(nodeId, { notes }),
    [updateNodeData]
  );

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      <div className="flex-1 react-flow-canvas-wrapper min-w-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          className="bg-cyber-black"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e3a5f" />
          <Controls showInteractive={false} className="!border-cyber-border !rounded-xl !overflow-hidden" />
          <MiniMap nodeColor={miniMapNodeColor} maskColor="rgba(10, 14, 23, 0.8)" className="!border-cyber-border !rounded-xl" />
          <FlowExporter
            activeCase={activeCase}
            onRegisterExportPng={onRegisterExportPng}
            onRegisterExportPdf={onRegisterExportPdf}
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
          onClose={() => { onSetNotePanelOpen(false); onSetSelectedNodeId(null); }}
        />
      )}
    </div>
  );
}
