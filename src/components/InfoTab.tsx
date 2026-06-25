function FlowExporter({
  activeCase,
  nodes, // ✅ Ajout de nodes
  edges, // ✅ Ajout de edges
  onRegisterExportPng,
  onRegisterExportPdf,
}: {
  activeCase: CaseData | null;
  nodes: EntityNode[]; // ✅ Type ajouté
  edges: Edge[];       // ✅ Type ajouté
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
      style: {
        transform: 'none',
        margin: '0',
      },
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
        console.log('Début export PNG...');
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
        console.log('Début export PDF...');
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
        
        const pdf = new jsPDF({ 
          orientation: 'portrait', 
          unit: 'mm', 
          format: 'a4' 
        });
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 15;
        let y = margin;
        
        // En-tête
        pdf.setFillColor(30, 58, 138);
        pdf.rect(0, 0, pageWidth, 25, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Rapport d\'Investigation OSINT', margin, 15);
        
        y = 35;
        
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
        pdf.addImage(graphImage, 'PNG', margin, y, imgWidth, Math.min(imgHeight, 120));
        y += Math.min(imgHeight, 120) + 10;
        
        // Légende
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        // ✅ Utilise nodes et edges passés en props
        pdf.text(`Graphe d'investigation — ${nodes.length} entités, ${edges.length} liens`, pageWidth / 2, y, { align: 'center' });
        y += 15;
        
        // Tableau de statistiques
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
        
        const personNode = nodes.find(n => (n.data as EntityData).entityType === 'person');
        if (personNode) {
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'italic');
          pdf.text(`Nom: ${(personNode.data as EntityData).label}`, margin, y);
        }
        
        pdf.save(`${activeCase.name.replace(/\s+/g, '_')}_rapport.pdf`);
        console.log('Export PDF rapport terminé');
      } catch (err) {
        console.error("Erreur export PDF:", err);
        alert('Erreur export PDF: ' + (err as Error).message);
      }
    };

    onRegisterExportPng(exportPng);
    onRegisterExportPdf(exportPdf);
  }, [activeCase, captureViewport, onRegisterExportPng, onRegisterExportPdf, nodes, edges]); // ✅ Ajout des dépendances

  return null;
}