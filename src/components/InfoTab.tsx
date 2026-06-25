import { useCallback, useEffect, memo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
  EdgeLabelRenderer,
  getBezierPath,
  type NodeTypes,
  type Node,
  type Edge,
  type EdgeProps,
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

const CustomEdgeComponent = memo(function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        className="react-flow__edge-interaction"
      />
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2.5,
          stroke: selected ? '#ef4444' : '#1e3a5f',
          strokeDasharray: '5,5',
          opacity: selected ? 1 : 0.75,
          transition: 'stroke 0.15s, opacity 0.15s',
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              pointerEvents: 'all',
              zIndex: 1001,
            }}
            className="nodrag nopan"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('edge-delete', { detail: { id } }));
              }}
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: '#0a0e17',
                border: '1px solid #ef4444',
                color: '#ef4444',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

const nodeTypes: NodeTypes = {
  entity: EntityNodeComponent as NodeTypes['entity'],
  social: SocialNodeComponent as NodeTypes['social'],
};

const edgeTypes = {
  custom: CustomEdgeComponent,
};

function FlowExporter({
  activeCase,
  nodes,
  edges,
  onRegisterExportPng,
  onRegisterExportPdf,
}: {
  activeCase: CaseData | null;
  nodes: EntityNode[];
  edges: Edge[];
  onRegisterExportPng: (fn: () => Promise<void>) => void;
  onRegisterExportPdf: (fn: () => Promise<void>) => void;
}) {
  const captureViewport = useCallback(async (): Promise<string> => {
    const element = document.querySelector('.react-flow') as HTMLElement | null;
    if (!element) {
      throw new Error('Graphique non trouvé');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    return toPng(element, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#0a0e17',
      width: element.offsetWidth,
      height: element.offsetHeight,
      style: { transform: 'none', margin: '0' },
      filter: (node) => {
        if (node instanceof Element) {
          if (node.classList.contains('react-flow__controls')) return false;
          if (node.classList.contains('react-flow__minimap')) return false;
          if (node.classList.contains('react-flow__panel')) return false;
          if (node.tagName === 'BUTTON') return false;
        }
        return true;
      },
    });
  }, []);

  useEffect(() => {
    const exportPng = async () => {
      if (!activeCase) {
        alert('Aucun cas actif');
        return;
      }
      try {
        const dataUrl = await captureViewport();
        const link = document.createElement('a');
        link.download = `${activeCase.name.replace(/\s+/g, '_')}_graph.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Erreur export PNG:", err);
        alert('Erreur export PNG: ' + (err as Error).message);
      }
    };

    const exportPdf = async () => {
      if (!activeCase) {
        alert('Aucun cas actif');
        return;
      }
      try {
        // Capturer le graphe
        const element = document.querySelector('.react-flow') as HTMLElement | null;
        if (!element) throw new Error('Graphique non trouvé');
        await new Promise(resolve => setTimeout(resolve, 300));
        const graphImage = await toPng(element, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: '#0a0e17',
          width: element.offsetWidth,
          height: element.offsetHeight,
          style: { transform: 'none', margin: '0' },
          filter: (node) => {
            if (node instanceof Element) {
              if (node.classList.contains('react-flow__controls')) return false;
              if (node.classList.contains('react-flow__minimap')) return false;
              if (node.classList.contains('react-flow__panel')) return false;
              if (node.tagName === 'BUTTON') return false;
            }
            return true;
          },
        });

        // Créer le PDF
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        
        // ========== PAGE 1: COUVERTURE + GRAPHE ==========
        // En-tête bleu
        pdf.setFillColor(30, 58, 138);
        pdf.rect(0, 0, pageWidth, 25, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text("Rapport d'Investigation OSINT", margin, 15);
        
        let y = 35;
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(activeCase.name, margin, y);
        y += 8;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Dossier: ${activeCase.name}`, margin, y);
        y += 15;
        
        // Image du graphe
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (element.offsetHeight / element.offsetWidth) * imgWidth;
        pdf.addImage(graphImage, 'PNG', margin, y, imgWidth, Math.min(imgHeight, 100));
        y += Math.min(imgHeight, 100) + 10;
        
        // Légende
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Graphe d'investigation — ${nodes.length} entités, ${edges.length} liens`, pageWidth / 2, y, { align: 'center' });
        y += 15;
        
        // Tableau statistiques
        pdf.setFillColor(30, 58, 138);
        pdf.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Statistique', margin + 2, y + 5);
        pdf.text('Valeur', pageWidth / 2, y + 5);
        pdf.text('Dossier', pageWidth - margin - 2, y + 5, { align: 'right' });
        
        y += 10;
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        
        pdf.setFillColor(240, 240, 250);
        pdf.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
        pdf.text('Entités', margin + 2, y + 5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(String(nodes.length), pageWidth / 2, y + 5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(activeCase.name, pageWidth - margin - 2, y + 5, { align: 'right' });
        y += 7;
        
        pdf.text('Liens', margin + 2, y + 5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(String(edges.length), pageWidth / 2, y + 5);
        pdf.setFont('helvetica', 'normal');
        y += 7;
        
        pdf.text('Date', margin + 2, y + 5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(new Date().toLocaleDateString('fr-FR'), pageWidth / 2, y + 5);
        pdf.setFont('helvetica', 'normal');
        y += 15;
        
        // Nom de la personne
        const personNode = nodes.find(n => (n.data as EntityData).entityType === 'person');
        if (personNode) {
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'italic');
          pdf.text(`Nom: ${(personNode.data as EntityData).label}`, margin, y);
        }
        
        // ========== PAGE 2+: LISTE DÉTAILLÉE DES ENTITÉS ==========
        pdf.addPage();
        y = margin;
        
        // Titre de la page 2
        pdf.setFillColor(30, 58, 138);
        pdf.rect(0, 0, pageWidth, 15, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Détail des Entités', margin, 10);
        
        y = 22;
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        
        // Grouper les entités par type
        const entitiesByType: Record<string, EntityNode[]> = {};
        nodes.forEach(node => {
          const type = (node.data as EntityData).entityType || 'other';
          if (!entitiesByType[type]) {
            entitiesByType[type] = [];
          }
          entitiesByType[type].push(node);
        });
        
        // Afficher chaque type d'entité
        Object.entries(entitiesByType).forEach(([type, typeNodes]) => {
          // Vérifier si on a besoin d'une nouvelle page
          if (y > pageHeight - 30) {
            pdf.addPage();
            y = margin;
          }
          
          // Titre de la section
          pdf.setFillColor(230, 230, 240);
          pdf.rect(margin, y - 3, pageWidth - (margin * 2), 7, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(30, 58, 138);
          pdf.text(`${type.charAt(0).toUpperCase() + type.slice(1)} (${typeNodes.length})`, margin + 2, y + 2);
          y += 10;
          
          // Liste des entités de ce type
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(8);
          
          typeNodes.forEach(node => {
            if (y > pageHeight - 15) {
              pdf.addPage();
              y = margin;
            }
            
            const data = node.data as EntityData;
            pdf.setFont('helvetica', 'bold');
            pdf.text(`• ${data.label}`, margin + 5, y);
            y += 4;
            
            pdf.setFont('helvetica', 'normal');
            if (data.notes) {
              const splitNotes = pdf.splitTextToSize(data.notes, pageWidth - (margin * 2) - 10);
              pdf.text(splitNotes, margin + 7, y);
              y += splitNotes.length * 4;
            }
            
            // Afficher les champs personnalisés s'ils existent
            if (data.fields) {
              Object.entries(data.fields).forEach(([key, value]) => {
                if (y > pageHeight - 10) {
                  pdf.addPage();
                  y = margin;
                }
                pdf.text(`  ${key}: ${value}`, margin + 7, y);
                y += 4;
              });
            }
            
            y += 3;
          });
          
          y += 5;
        });
        
        // Sauvegarder le PDF
        pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_rapport.pdf`);
      } catch (err) {
        console.error("Erreur export PDF:", err);
        alert('Erreur export PDF: ' + (err as Error).message);
      }
    };

    onRegisterExportPng(exportPng);
    onRegisterExportPdf(exportPdf);
  }, [activeCase, captureViewport, onRegisterExportPng, onRegisterExportPdf, nodes, edges]);

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
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Bezier}
          defaultEdgeOptions={{ type: 'custom' }}
          proOptions={{ hideAttribution: true }}
          className="bg-cyber-black"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e3a5f" />
          <Controls showInteractive={false} className="!border-cyber-border !rounded-xl !overflow-hidden" />
          <MiniMap nodeColor={() => '#1e3a5f'} maskColor="rgba(10, 14, 23, 0.8)" className="!border-cyber-border !rounded-xl" />
          <FlowExporter
            activeCase={activeCase}
            nodes={nodes}
            edges={edges}
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
          onUpdateEntityNotes={(id, notes) => updateNodeData(id, { notes })}
          onUpdateCaseNotes={updateCaseNotes}
          onUpdateCaseTitle={updateCaseTitle}
          onClose={() => { onSetNotePanelOpen(false); onSetSelectedNodeId(null); }}
        />
      )}
    </div>
  );
}