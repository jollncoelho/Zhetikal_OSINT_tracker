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
    addPin,
    updatePin,
    deletePin,
    addPinLink,
    removePinLink,
  } = useStore();

  const { view, setView } = useNavigation();

  // Connexion standard pour laisser les flèches libres
  const onConnect = useCallback((params: any) => {
    if (storeOnConnect) {
      storeOnConnect(params);
    }
  }, [storeOnConnect]);

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
  const [fieldsNodeId, setFieldsNodeId] = useState<string | null>(null);

  const fieldsNode = fieldsNodeId
    ? (nodes.find((n) => n.id === fieldsNodeId) as EntityNodeType | undefined) ?? null
    : null;

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const { id, label, notes, socialPlatform, color } = (e as CustomEvent).detail;
      updateNodeData(id, { label, notes, ...(socialPlatform !== undefined && { socialPlatform }), ...(color !== undefined && { color }) });
    };
    const handleDeleteNode = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      deleteNode(id);
    };
    
    // Correction ici : On nettoie l'état du Edge sélectionné à chaque suppression
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
      const { nodeId } = (e as CustomEvent).detail;
      const pinLinks = activeCase?.pinLinks ?? [];
      const link = pinLinks.find((l) => l.identifierId === nodeId);

      setView('map');

      if (link) {
        const pin = activeCase?.locations?.find((p) => p.id === link.pinId);
        const lat = pin?.lat ?? 48.8566;
        const lng = pin?.lng ?? 2.3522;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('map-navigate-pin', {
            detail: { pinId: link.pinId, lat, lng },
          }));
        }, 60);
      } else {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const fields = (node.data.fields ?? {}) as Record<string, string>;
        const lat = parseFloat(fields.lat ?? '');
        const lng = parseFloat(fields.lng ?? '');
        const resolvedLat = isNaN(lat) ? 48.8566 : lat;
        const resolvedLng = isNaN(lng) ? 2.3522 : lng;
        const pinId = addPin({
          label: node.data.label,
          address: (fields.address ?? '').trim(),
          notes: node.data.notes ?? '',
          lat: resolvedLat,
          lng: resolvedLng,
          color: node.data.color ?? '#10b981