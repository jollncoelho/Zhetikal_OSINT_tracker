import type { EvidenceArtifact, EvidenceArtifactType } from '../types/investigation';
import { parseHtmlDocument } from './capture';
import { saveOriginal } from './evidenceStore';

/**
 * Import de fichiers depuis le poste de l'analyste.
 *
 * Le module d'enquête ne savait recevoir une image que par la capture d'écran
 * ou par le formulaire de capture. Une photo prise sur le terrain, une
 * capture faite avec un autre outil, un HTML sauvegardé à la main n'avaient
 * aucun chemin d'entrée — alors que ce sont les pièces les plus courantes.
 *
 * Deux règles tenues ici :
 *   1. **l'original est conservé** (dans le magasin `blobs`), et l'empreinte
 *      SHA-512 porte sur ses octets, pas sur la version réduite ;
 *   2. la **prévisualisation** est réduite pour l'affichage, et le compte rendu
 *      dit explicitement si l'image montrée est l'originale ou une dérivée.
 */

/** Bord le plus long de la prévisualisation. Au-delà, on réduit. */
const PREVIEW_MAX_EDGE = 1920;
/** En dessous, on garde les octets d'origine : aucune raison de ré-encoder. */
const PREVIEW_KEEP_BYTES = 1_200_000;
/** Un texte plus gros que cela n'est pas une preuve exploitable ici. */
const TEXT_MAX_BYTES = 4_000_000;

export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportOutcome {
  artifact: EvidenceArtifact | null;
  failure: ImportFailure | null;
}

async function sha512Bytes(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(blob);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsText(file, 'utf-8');
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible'));
    };
    image.src = url;
  });
}

interface Preview {
  dataUrl: string;
  width: number;
  height: number;
  /** `original` = octets du fichier ; `resized` = dérivé ré-encodé. */
  fidelity: 'original' | 'resized';
}

async function buildImagePreview(file: File): Promise<Preview> {
  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longest = Math.max(width, height);

  if (longest <= PREVIEW_MAX_EDGE && file.size <= PREVIEW_KEEP_BYTES) {
    return { dataUrl: await readAsDataUrl(file), width, height, fidelity: 'original' };
  }

  const ratio = longest > 0 ? Math.min(1, PREVIEW_MAX_EDGE / longest) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponible');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // JPEG : une photo ou une capture ré-encodée en PNG dépasserait la taille
  // de l'original, ce qui rendrait la réduction inutile.
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    width: canvas.width,
    height: canvas.height,
    fidelity: 'resized',
  };
}

function isTextLike(file: File): boolean {
  return /^text\//i.test(file.type)
    || /^application\/(json|xml|xhtml\+xml)$/i.test(file.type)
    || /\.(txt|md|csv|json|log|xml|html?)$/i.test(file.name);
}

function isHtmlLike(file: File): boolean {
  return /^text\/html$/i.test(file.type) || /\.(html?|xhtml)$/i.test(file.name);
}

function typeFor(file: File): EvidenceArtifactType {
  if (file.type.startsWith('image/')) return 'screenshot';
  if (isHtmlLike(file)) return 'downloaded_page';
  return 'text_note';
}

/**
 * Transforme un fichier choisi par l'analyste en élément de preuve.
 *
 * Ne lève pas : un fichier refusé revient avec sa raison, pour que l'appelant
 * puisse dire lequel a échoué et pourquoi plutôt que d'échouer en bloc sur un
 * lot de dix photos.
 */
export async function buildArtifactFromFile(caseId: string, file: File): Promise<ImportOutcome> {
  const capturedAt = new Date().toISOString();
  const fail = (reason: string): ImportOutcome => ({ artifact: null, failure: { name: file.name, reason } });

  try {
    if (file.size === 0) return fail('empty');

    const buffer = await file.arrayBuffer();
    const digest = await sha512Bytes(buffer);
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isTextLike(file)) {
      // PDF, archives, binaires : l'original est conservé, mais il n'y a pas
      // d'aperçu à en tirer ici. Le fichier reste téléchargeable depuis la
      // fiche de preuve.
      if (file.size > 25_000_000) return fail('tooLarge');
    }

    if (!isImage && isTextLike(file) && file.size > TEXT_MAX_BYTES) return fail('tooLarge');

    let preview: Preview | null = null;
    if (isImage) {
      try {
        preview = await buildImagePreview(file);
      } catch {
        return fail('unreadableImage');
      }
    }

    let rawHtml = '';
    let title = file.name;
    let extractedLinks: string[] = [];
    let extractedText: string[] = [];
    let contentType = file.type || 'application/octet-stream';

    if (!isImage && isTextLike(file)) {
      const text = await readAsText(file);
      if (isHtmlLike(file)) {
        // Un HTML sauvegardé est une page : on en tire le titre, les liens et
        // le texte avec le même analyseur que la capture réseau.
        const parsed = parseHtmlDocument(text, `file:///${encodeURIComponent(file.name)}`);
        rawHtml = parsed.html;
        title = parsed.title || file.name;
        extractedLinks = parsed.links;
        extractedText = parsed.text ?? [];
        contentType = 'text/html';
      } else {
        rawHtml = text;
        extractedText = text.split(/\r?\n/).slice(0, 20_000);
      }
    }

    const artifact: EvidenceArtifact = {
      id: crypto.randomUUID(),
      case_id: caseId,
      artifact_type: typeFor(file),
      target_url: `file:///${encodeURIComponent(file.name)}`,
      final_url: `file:///${encodeURIComponent(file.name)}`,
      title,
      http_status: null,
      content_type: contentType,
      raw_html: rawHtml,
      // L'empreinte porte sur les octets du fichier choisi : c'est la seule
      // valeur qui prouve que la pièce n'a pas changé depuis l'import.
      sha512: digest,
      captured_at: capturedAt,
      browser_metadata: {
        source: 'local-file-import',
        originalName: file.name,
        originalSize: file.size,
        originalType: file.type || 'inconnu',
        originalSha512: digest,
        lastModified: new Date(file.lastModified).toISOString(),
        previewFidelity: preview?.fidelity ?? 'none',
        previewWidth: preview?.width ?? 0,
        previewHeight: preview?.height ?? 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      meta: {},
      screenshot_preview: preview?.dataUrl ?? '',
      screenshot_previews: preview ? [preview.dataUrl] : [],
      extracted_links: extractedLinks,
      extracted_text: extractedText,
      extracted_assets: [],
      notes: '',
      created_at: capturedAt,
      has_original: true,
    };

    await saveOriginal(artifact.id, file);
    return { artifact, failure: null };
  } catch (cause) {
    console.error(cause);
    return fail('unreadable');
  }
}
