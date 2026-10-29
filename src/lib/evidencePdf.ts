import { jsPDF } from 'jspdf';
import type { EvidenceArtifact, InvestigationCase } from '../types/investigation';
import { artifactImages } from './capture';
import { RELIABILITY_LABEL_KEY, assessReliability } from './evidenceInsight';

/**
 * Génère un « pack de preuves » PDF : couverture, index, puis une fiche par
 * élément de preuve (métadonnées, empreinte, contrôle de fiabilité, aperçu).
 *
 * Contrairement au rapport imprimable (`printCleanReport`, qui passe par la
 * fenêtre d'impression du navigateur), ce document est un vrai fichier PDF
 * horodaté, partageable tel quel.
 */

const MARGIN = 14;
const HEADER_BAND = 26;

interface PackOptions {
  investigationCase: InvestigationCase;
  artifacts: EvidenceArtifact[];
  translate: (key: string) => string;
  lang: string;
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function formatDateTime(value: string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Ajuste un libellé à une largeur de colonne donnée (en mm).
 *
 * jsPDF ne rogne pas le texte : il déborde simplement hors de la page. Comme
 * les intitulés de colonnes sont traduits (« Fiabilité de la preuve » fait
 * 22 caractères en français, 25 en espagnol), on réduit d'abord la taille de
 * police jusqu'à `min`, puis on tronque avec une ellipsis si ça ne suffit pas.
 */
function fitText(
  pdf: jsPDF,
  text: string,
  maxWidth: number,
  start = 7.5,
  min = 6,
): string {
  let size = start;
  pdf.setFontSize(size);
  while (size > min && pdf.getTextWidth(text) > maxWidth) {
    size = Math.round((size - 0.25) * 100) / 100;
    pdf.setFontSize(size);
  }
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && pdf.getTextWidth(`${fitted}…`) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

export async function exportEvidencePack({
  investigationCase,
  artifacts,
  translate: t,
  lang,
}: PackOptions): Promise<string> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = 0;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  const drawBand = (title: string, subtitle: string) => {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageWidth, HEADER_BAND, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(fitText(pdf, title, contentWidth, 14, 11), MARGIN, 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(148, 197, 214);
    // L'URL de l'artefact peut être très longue : on la tronque proprement
    // plutôt que de la laisser déborder hors de la page.
    pdf.text(fitText(pdf, subtitle, contentWidth, 8.5, 8.5), MARGIN, 19);
  };

  const labelValue = (label: string, value: string, x: number, width: number) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(120, 130, 145);
    pdf.text(label.toUpperCase(), x, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(20, 26, 38);
    const lines = pdf.splitTextToSize(value || '—', width);
    pdf.text(lines, x, y + 4.5);
    return 4.5 + lines.length * 4.2;
  };

  /* ---------------- Couverture ---------------- */

  drawBand(t('investigation.packTitle'), `Ghostint · OSINT Tracker`);
  y = HEADER_BAND + 14;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(15, 23, 42);
  pdf.text(pdf.splitTextToSize(investigationCase.case_name || '—', contentWidth), MARGIN, y);
  y += 12;

  pdf.setDrawColor(200, 208, 216);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 8;

  const third = contentWidth / 3;
  const colHeight = Math.max(
    labelValue(t('investigation.officer'), investigationCase.investigating_officer || '—', MARGIN, third - 4),
    labelValue(t('investigation.agency'), investigationCase.agency || '—', MARGIN + third, third - 4),
    labelValue(t('investigation.artifacts'), String(artifacts.length), MARGIN + third * 2, third - 4),
  );
  y += colHeight + 6;

  const generated = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : lang, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(110, 120, 134);
  pdf.text(`${t('investigation.packGenerated')} : ${generated}`, MARGIN, y);
  y += 10;

  if (investigationCase.notes) {
    pdf.setFontSize(8);
    pdf.setTextColor(120, 130, 145);
    pdf.text(t('investigation.notes').toUpperCase(), MARGIN, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(40, 48, 62);
    const notes = pdf.splitTextToSize(investigationCase.notes, contentWidth);
    pdf.text(notes.slice(0, 24), MARGIN, y);
    y += Math.min(notes.length, 24) * 4.4 + 8;
  }

  /* ---------------- Synthèse de fiabilité ---------------- */

  const reports = artifacts.map((artifact) => assessReliability(artifact));
  const verified = reports.filter((report) => report.level === 'verified').length;
  const partial = reports.filter((report) => report.level === 'partial').length;
  const weak = reports.filter((report) => report.level === 'weak').length;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(t('investigation.packSummary'), MARGIN, y);
  y += 6;

  const cards: [string, number, [number, number, number]][] = [
    [t(RELIABILITY_LABEL_KEY.verified), verified, [16, 150, 105]],
    [t(RELIABILITY_LABEL_KEY.partial), partial, [217, 119, 6]],
    [t(RELIABILITY_LABEL_KEY.weak), weak, [200, 45, 45]],
  ];
  const cardWidth = contentWidth / 3 - 3;
  cards.forEach(([label, value, color], index) => {
    const x = MARGIN + index * (cardWidth + 4.5);
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.roundedRect(x, y, cardWidth, 18, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(String(value), x + 4, y + 9);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(label, x + 4, y + 14.5);
  });
  y += 26;

  /* ---------------- Index ---------------- */

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(t('investigation.packIndex'), MARGIN, y);
  y += 5;

  /* Largeurs de colonnes de l'index (mm). La colonne « capturée » n'a besoin
     que de ~24 mm pour « 9 oct. 2026, 16:22 » ; on récupère la marge pour la
     colonne fiabilité, dont l'intitulé est le plus long une fois traduit. */
  const COL_NUM = 9;
  const COL_CAPTURED = 30;
  const COL_RELIABILITY = 34;
  const titleWidth = contentWidth - COL_NUM - COL_CAPTURED - COL_RELIABILITY - 6;

  const columns: [string, number][] = [
    ['#', COL_NUM],
    [t('investigation.artifact'), titleWidth],
    [t('investigation.captured'), COL_CAPTURED],
    [t('reliability.title'), COL_RELIABILITY],
  ];

  const drawIndexHeader = () => {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(MARGIN, y, contentWidth, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    let x = MARGIN + 2;
    columns.forEach(([label, width]) => {
      pdf.text(fitText(pdf, label.toUpperCase(), width - 2), x, y + 4.8);
      x += width + 2;
    });
    y += 7;
  };

  drawIndexHeader();

  artifacts.forEach((artifact, index) => {
    if (y + 7 > pageHeight - MARGIN) {
      pdf.addPage();
      y = MARGIN;
      drawIndexHeader();
    }
    const report = reports[index];
    const rawTitle = artifact.title || artifact.final_url || artifact.target_url || '—';

    if (index % 2 === 1) {
      pdf.setFillColor(244, 246, 249);
      pdf.rect(MARGIN, y, contentWidth, 6.5, 'F');
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(40, 48, 62);
    let x = MARGIN + 2;
    pdf.text(String(index + 1).padStart(2, '0'), x, y + 4.4);
    x += COL_NUM + 2;
    pdf.text(fitText(pdf, rawTitle, titleWidth, 8, 8), x, y + 4.4);
    x += titleWidth + 2;
    pdf.setFontSize(7.5);
    pdf.setTextColor(110, 120, 134);
    pdf.text(
      fitText(pdf, formatDateTime(artifact.captured_at, lang), COL_CAPTURED - 2, 7.5, 7.5),
      x,
      y + 4.4,
    );
    x += COL_CAPTURED + 2;
    pdf.setTextColor(40, 48, 62);
    pdf.text(
      fitText(
        pdf,
        `${t(RELIABILITY_LABEL_KEY[report.level])} · ${report.score}%`,
        COL_RELIABILITY - 2,
        7.5,
        7.5,
      ),
      x,
      y + 4.4,
    );
    y += 6.5;
  });

  /* ---------------- Fiches détaillées ---------------- */

  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const report = reports[index];
    const images = artifactImages(artifact);
    const imageSize = images[0] ? await loadImageSize(images[0]) : null;

    pdf.addPage();
    y = 0;
    drawBand(
      `${t('investigation.evidence')} ${String(index + 1).padStart(2, '0')}`,
      artifact.final_url || artifact.target_url || '—',
    );
    y = HEADER_BAND + 12;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    const heading = pdf.splitTextToSize(artifact.title || artifact.final_url || '—', contentWidth);
    pdf.text(heading, MARGIN, y);
    y += heading.length * 6 + 4;

    // Métadonnées en deux colonnes
    const half = contentWidth / 2 - 3;
    const leftH = labelValue(t('investigation.target'), artifact.final_url || artifact.target_url || '—', MARGIN, half);
    const rightH = labelValue(t('investigation.captured'), formatDateTime(artifact.captured_at, lang), MARGIN + half + 6, half);
    y += Math.max(leftH, rightH) + 3;
    const leftH2 = labelValue('HTTP', String(artifact.http_status ?? '—'), MARGIN, half);
    const rightH2 = labelValue('Content-Type', artifact.content_type || '—', MARGIN + half + 6, half);
    y += Math.max(leftH2, rightH2) + 3;
    labelValue(t('investigation.typeScreenshot'), t(`investigation.type${artifact.artifact_type === 'downloaded_page' ? 'DownloadedPage' : artifact.artifact_type === 'extracted_link' ? 'ExtractedLink' : artifact.artifact_type === 'text_note' ? 'TextNote' : 'Screenshot'}`), MARGIN, contentWidth);
    y += 11;

    // Empreinte
    ensureSpace(16);
    pdf.setFillColor(240, 250, 246);
    pdf.roundedRect(MARGIN, y, contentWidth, 13, 2, 2, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(90, 120, 110);
    pdf.text('SHA-512', MARGIN + 3, y + 4.5);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(20, 90, 70);
    pdf.text(pdf.splitTextToSize(artifact.sha512 || '—', contentWidth - 6), MARGIN + 3, y + 9.5);
    y += 18;

    // Contrôles de fiabilité
    ensureSpace(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`${t('reliability.title')} — ${t(RELIABILITY_LABEL_KEY[report.level])} (${report.score}%)`, MARGIN, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    report.checks.forEach((check, checkIndex) => {
      const column = checkIndex % 2;
      const row = Math.floor(checkIndex / 2);
      const x = MARGIN + column * (half + 6);
      const cy = y + row * 5;
      // Un critère sans objet n'est ni vert ni rouge : il est gris, et marqué
      // « n/a ». Le compter comme un manque fausserait le rapport papier.
      const skipped = check.applicable === false;
      pdf.setTextColor(skipped ? 140 : check.ok ? 16 : 190, skipped ? 145 : check.ok ? 150 : 45, skipped ? 150 : check.ok ? 105 : 45);
      pdf.text(skipped ? 'n/a' : check.ok ? 'OK' : '—', x, cy);
      pdf.setTextColor(70, 80, 95);
      pdf.text(t(check.labelKey), x + 9, cy);
    });
    y += Math.ceil(report.checks.length / 2) * 5 + 5;

    // Notes
    if (artifact.notes) {
      ensureSpace(14);
      pdf.setFontSize(7);
      pdf.setTextColor(120, 130, 145);
      pdf.text(t('investigation.contextNotes').toUpperCase(), MARGIN, y);
      y += 4;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(40, 48, 62);
      const notes = pdf.splitTextToSize(artifact.notes, contentWidth);
      pdf.text(notes, MARGIN, y);
      y += notes.length * 4.2 + 6;
    }

    // Aperçu
    if (images[0] && imageSize) {
      ensureSpace(40);
      pdf.setFontSize(7);
      pdf.setTextColor(120, 130, 145);
      pdf.text(t('investigation.previewImage').toUpperCase(), MARGIN, y);
      y += 4;
      const maxHeight = Math.min(120, pageHeight - MARGIN - y);
      const ratio = imageSize.w > 0 ? imageSize.h / imageSize.w : 0.6;
      let drawWidth = contentWidth;
      let drawHeight = drawWidth * ratio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = ratio > 0 ? drawHeight / ratio : contentWidth;
      }
      try {
        pdf.addImage(images[0], 'PNG', MARGIN, y, drawWidth, drawHeight);
      } catch (error) {
        console.error('Evidence pack image error:', error);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 60, 60);
        pdf.text(t('investigation.noPreview'), MARGIN, y + 4);
        drawHeight = 6;
      }
      y += drawHeight + 6;
    }

    // Pied de page
    pdf.setFontSize(7);
    pdf.setTextColor(150, 158, 170);
    pdf.text(
      `${t('investigation.packFooter')} · ${index + 1}/${artifacts.length}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' },
    );
  }

  // Numérotation globale
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(160, 168, 180);
    pdf.text(`${page} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 8, { align: 'right' });
  }

  const safeName = (investigationCase.case_name || 'case').replace(/[^\w\-.]+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${safeName}_pack-preuves_${stamp}.pdf`;
  pdf.save(fileName);
  return fileName;
}
