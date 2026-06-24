import { useCallback, useEffect, memo } from 'react';
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

const nodeTypes: NodeTypes = {
  entity: EntityNodeComponent as NodeTypes['entity'],
  social: SocialNodeComponent as NodeTypes['social'],
};

// Gestionnaire d'exportation réinitialisé et robuste
function FlowExporter({
  activeCase,
  onRegisterExportPng,
  onRegisterExportPdf,
}: {
  activeCase: CaseData | null;
  onRegisterExportPng: (fn: () => Promise<void>) => void;
  onRegisterExportPdf: (fn: () => Promise<void>) => void;
}) {
  const captureViewport = useCallback(async (): Promise<string> => {
    // Recherche large pour éviter l'erreur "Viewport non trouvé"
    let viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewport) {
      viewport = document.querySelector('.react-flow__renderer') as HTMLElement | null;
    }
    if (!viewport) {
      viewport = document.querySelector('.react-flow') as HTMLElement | null;
    }
    
    if (!viewport) throw new Error('Conteneur de graphique introuvable');
    
    return toPng(viewport, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#0a0e17',
      filter: (node) => {
        if (node instanceof Element) {
          if (node.classList.contains('react-flow__controls')) return false;
          if (node.classList.contains('react-flow__minimap')) return false;
        }
        return true;
      },
    });
  }, []);

  useEffect(() => {
    const exportPng = async () => {
      if (!activeCase) return;
      try {
        const dataUrl = await captureViewport();
        const link = document.createElement('a');
        link.download = `${activeCase.name.replace(/\s+/g, '_')}_graph.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Erreur Export PNG:", err);
      }
    };

    const exportPdf = async () => {
      if (!activeCase) return;
      try {
        const dataUrl = await captureViewport();
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        pdf.setFillColor(10, 14, 23);
        pdf.rect(0, 0, 297, 210, 'F');
        pdf.addImage(dataUrl, 'PNG', 10, 10, 277, 190);
        pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_export.pdf`);
      } catch (err) {
        console.error("Erreur Export PDF:", err);
      }
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
    <div className="flex-1 flex overflow-hidden min-h-0">
      <div className="flex-1 react-flow-canvas-wrapper min-w-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          edgesSelectable={true}
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