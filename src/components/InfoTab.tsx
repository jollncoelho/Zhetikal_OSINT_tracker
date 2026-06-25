// Ajoute ces imports au début du fichier
import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';

// ... (le reste des imports)

// Ajoute cette fonction directement dans InfoTab
const exportToPng = useCallback(async () => {
  const element = document.querySelector('.react-flow') as HTMLElement;
  if (!element) {
    alert('Graphique non trouvé');
    return;
  }
  
  try {
    const dataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: '#0a0e17',
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
    
    const link = document.createElement('a');
    link.download = `graph_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Export PNG error:', err);
    alert('Erreur export PNG: ' + (err as Error).message);
  }
}, []);

const exportToPdf = useCallback(async () => {
  const element = document.querySelector('.react-flow') as HTMLElement;
  if (!element) {
    alert('Graphique non trouvé');
    return;
  }
  
  try {
    const dataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: '#0a0e17',
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
      orientation: 'landscape', 
      unit: 'mm', 
      format: 'a4',
      compress: true 
    });
    
    pdf.setFillColor(10, 14, 23);
    pdf.rect(0, 0, 297, 210, 'F');
    pdf.addImage(dataUrl, 'PNG', 10, 10, 277, 190);
    pdf.save(`graph_${Date.now()}.pdf`);
  } catch (err) {
    console.error('Export PDF error:', err);
    alert('Erreur export PDF: ' + (err as Error).message);
  }
}, []);

// ... (dans le return du composant InfoTab, ajoute ces boutons temporaires pour tester)