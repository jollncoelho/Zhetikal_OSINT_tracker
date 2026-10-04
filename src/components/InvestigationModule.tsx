import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import React from 'react';
import {
  Archive, ArrowLeft, Calendar, Camera, CheckCircle2, ChevronRight, Clipboard,
  Download, ExternalLink, FileCode2, FileText, Filter, Fingerprint,
  Globe2, Hash, Loader, Pencil, Plus, Printer, Search, ShieldCheck, Timer,
  Trash2, UserRound, X,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { useLanguage } from '../i18n/LanguageContext';
import type { CaptureResponse, EvidenceArtifact, EvidenceArtifactType, InvestigationCase } from '../types/investigation';

const CAPTURE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-evidence`;
const LOCAL_CASES_KEY = 'zhetikal-investigation-cases-v1';
const LOCAL_ARTIFACTS_KEY = 'zhetikal-investigation-artifacts-v1';
const typeLabelKeys: Record<EvidenceArtifactType, string> = {
  screenshot: 'investigation.typeScreenshot',
  downloaded_page: 'investigation.typeDownloadedPage',
  extracted_link: 'investigation.typeExtractedLink',
  text_note: 'investigation.typeTextNote',
};

function artifactTypeLabel(translate: (key: string) => string, type: EvidenceArtifactType): string {
  return translate(typeLabelKeys[type]);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function readLocalList<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch (cause) {
    console.error(cause);
    return [];
  }
}

function writeLocalList<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (cause) {
    console.error(cause);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}

function safeImageSource(value: string): string {
  return value.startsWith('data:image/') ? value : '';
}

function artifactImages(artifact: EvidenceArtifact): string[] {
  const images = artifact.screenshot_previews?.filter(Boolean) ?? [];
  return images.length > 0 ? images : artifact.screenshot_preview ? [artifact.screenshot_preview] : [];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

function printCleanReport(investigationCase: InvestigationCase, artifacts: EvidenceArtifact[], translate: (key: string) => string): void {
  const reportWindow = window.open('', '_blank', 'width=960,height=800');
  if (!reportWindow) {
    window.print();
    return;
  }
  const artifactMarkup = artifacts.map((artifact, index) => {
    return `<article class="evidence"><div class="eyebrow">${escapeHtml(translate('investigation.evidence'))} ${String(index + 1).padStart(2, '0')} · ${escapeHtml(artifactTypeLabel(translate, artifact.artifact_type))}</div><h2>${escapeHtml(artifact.title || artifact.final_url)}</h2><p class="url">${escapeHtml(artifact.final_url || artifact.target_url)}</p>${artifact.notes ? `<p class="notes">${escapeHtml(artifact.notes)}</p>` : ''}<div class="evidence-grid">${safeImageSource(artifactImages(artifact)[0] ?? '') ? `<img src="${safeImageSource(artifactImages(artifact)[0] ?? '')}" alt="${escapeHtml(translate('investigation.previewAlt'))}">` : `<div class="no-image">${escapeHtml(translate('investigation.noPreview'))}</div>`}<div><div class="label">SHA-512</div><p class="hash">${escapeHtml(artifact.sha512)}</p><div class="technical">HTTP ${artifact.http_status || '—'} · ${escapeHtml(artifact.content_type || '—')} · ${artifact.extracted_links.length} ${escapeHtml(translate('investigation.linksExtracted'))}</div></div></div></article>`;
  }).join('');
  reportWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(investigationCase.case_name)}</title><style>body{margin:0;padding:42px;color:#172033;background:#fff;font-family:Arial,sans-serif;line-height:1.55}main{max-width:900px;margin:auto}.brand{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#176b88}.header{border-bottom:2px solid #17344a;padding-bottom:24px}.header h1{font-size:30px;margin:12px 0}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.label,.eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#52657a}.value{font-weight:700;margin-top:4px}.case-notes{white-space:pre-wrap;margin:24px 0}.evidence{break-inside:avoid;border:1px solid #ccd6df;border-radius:10px;padding:20px;margin-top:18px}.evidence h2{font-size:17px;margin:8px 0}.url,.hash,.technical{font-family:monospace;font-size:11px;overflow-wrap:anywhere}.url{color:#52657a}.notes{white-space:pre-wrap}.evidence-grid{display:grid;grid-template-columns:220px 1fr;gap:22px;margin-top:16px}.evidence img{width:220px;max-height:150px;object-fit:cover;border:1px solid #ccd6df;border-radius:5px}.no-image{height:100px;border:1px dashed #aab8c5;display:grid;place-items:center;color:#68798a;font-size:12px}.hash{color:#176b57;line-height:1.6}@media print{body{padding:0}.evidence{break-inside:avoid}}</style></head><body><main><div class="header"><div class="brand">Ghostint · ${escapeHtml(translate('investigation.reportTitle'))}</div><h1>${escapeHtml(investigationCase.case_name)}</h1><div class="meta"><div><div class="label">${escapeHtml(translate('investigation.officer'))}</div><div class="value">${escapeHtml(investigationCase.investigating_officer || '—')}</div></div><div><div class="label">${escapeHtml(translate('investigation.agency'))}</div><div class="value">${escapeHtml(investigationCase.agency || '—')}</div></div><div><div class="label">${escapeHtml(translate('investigation.artifacts'))}</div><div class="value">${artifacts.length}</div></div></div></div><p class="case-notes">${escapeHtml(investigationCase.notes)}</p>${artifactMarkup}</main><script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
  reportWindow.document.close();
}

async function createPreviewDataUrl(capture: CaptureResponse): Promise<string> {
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Evidence capture renderer');
  const markup = sanitizePreviewHtml(capture.html, capture.finalUrl);
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;opacity:1;pointer-events:none;background:#fff;';
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Capture timed out')), 15000);
      frame.onload = () => { window.clearTimeout(timeout); resolve(); };
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error('Capture renderer failed')); };
      frame.srcdoc = markup;
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
    const documentElement = frame.contentDocument?.documentElement;
    if (!documentElement) throw new Error('Capture document unavailable');
    const pageHeight = Math.min(Math.max(documentElement.scrollHeight, 900), 6000);
    return await toPng(documentElement, {
      cacheBust: true,
      width: 1200,
      height: pageHeight,
      canvasWidth: 1200,
      canvasHeight: pageHeight,
      style: { width: '1200px', minHeight: `${pageHeight}px`, backgroundColor: '#ffffff' },
    });
  } finally {
    frame.remove();
  }
}

function sanitizePreviewHtml(html: string, baseUrl = ''): string {
  if (typeof DOMParser === 'undefined') return html;
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, iframe, object, embed, form').forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
    }
  });
  const existingBase = document.querySelector('base');
  if (!existingBase && baseUrl) {
    const base = document.createElement('base');
    base.href = baseUrl;
    document.head.prepend(base);
  }
  return document.documentElement.outerHTML;
}

function isHtmlContent(html: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('xml') && !ct.includes('html')) return false;
  if (ct.includes('json')) return false;
  if (ct.includes('text/plain')) return false;
  if (ct.startsWith('image/')) return false;
  const trimmed = html.trimStart();
  if (trimmed.startsWith('<?xml')) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  return /<html[\s>]/i.test(trimmed) || /<(body|div|p|span|table|head)[\s>]/i.test(trimmed);
}

function formatRawContent(content: string, contentType: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (contentType.toLowerCase().includes('json')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return content;
    }
  }
  return content;
}

function browserMetadata(): Record<string, string | number> {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

async function sha512(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-512', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface Props { onClose: () => void }

class PreviewErrorBoundary extends React.Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('Preview render error:', error); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

export default function InvestigationModule({ onClose }: Props) {
  const { t } = useLanguage();
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<InvestigationCase | null>(null);
  const [artifacts, setArtifacts] = useState<EvidenceArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [cardDensity, setCardDensity] = useState<'compact' | 'comfortable'>('comfortable');

  const loadCases = () => {
    const data = readLocalList<InvestigationCase>(LOCAL_CASES_KEY).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    setCases(data);
    if (selectedCase) {
      const refreshed = data.find((item) => item.id === selectedCase.id);
      if (refreshed) setSelectedCase(refreshed);
    }
  };

  const loadArtifacts = (caseId: string) => {
    const data = readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY)
      .filter((artifact) => artifact.case_id === caseId)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
    setArtifacts(data);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadCases();
      setLoading(false);
    };
    void load();
  }, []);

  const filteredArtifacts = useMemo(() => artifacts.filter((artifact) => {
    const haystack = [artifact.target_url, artifact.final_url, artifact.title, artifact.notes, artifact.sha512].join(' ').toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.toLowerCase().trim());
    const matchesDate = !dateFilter || artifact.captured_at.startsWith(dateFilter);
    return matchesSearch && matchesDate;
  }), [artifacts, dateFilter, search]);

  const handleSelectCase = async (investigationCase: InvestigationCase) => {
    setSelectedCase(investigationCase);
    setError('');
    await loadArtifacts(investigationCase.id);
  };

  const handleCreateCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      case_name: String(form.get('case_name') || '').trim(),
      investigating_officer: String(form.get('investigating_officer') || '').trim(),
      agency: String(form.get('agency') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
    };
    if (!payload.case_name) return;
    const now = new Date().toISOString();
    const created = { id: crypto.randomUUID(), ...payload, created_at: now, updated_at: now } as InvestigationCase;
    const nextCases = [created, ...readLocalList<InvestigationCase>(LOCAL_CASES_KEY)];
    writeLocalList(LOCAL_CASES_KEY, nextCases);
    setCases(nextCases);
    setSelectedCase(created);
    setArtifacts([]);
    setShowCreate(false);
  };

  const handleUpdateCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase) return;
    const form = new FormData(event.currentTarget);
    const updates = {
      case_name: String(form.get('case_name') || '').trim(),
      investigating_officer: String(form.get('investigating_officer') || '').trim(),
      agency: String(form.get('agency') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
      updated_at: new Date().toISOString(),
    };
    if (!updates.case_name) return;
    const updated = { ...selectedCase, ...updates } as InvestigationCase;
    const nextCases = readLocalList<InvestigationCase>(LOCAL_CASES_KEY).map((item) => item.id === updated.id ? updated : item);
    writeLocalList(LOCAL_CASES_KEY, nextCases);
    setCases(nextCases);
    setSelectedCase(updated);
    setShowEdit(false);
  };

  const handleDeleteCase = async (investigationCase: InvestigationCase) => {
    if (!window.confirm(`${t('investigation.deleteConfirm')}\n\n${investigationCase.case_name}`)) return;
    const nextCases = readLocalList<InvestigationCase>(LOCAL_CASES_KEY).filter((item) => item.id !== investigationCase.id);
    const nextArtifacts = readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY).filter((artifact) => artifact.case_id !== investigationCase.id);
    writeLocalList(LOCAL_CASES_KEY, nextCases);
    writeLocalList(LOCAL_ARTIFACTS_KEY, nextArtifacts);
    setCases(nextCases);
    if (selectedCase?.id === investigationCase.id) {
      setSelectedCase(null);
      setArtifacts([]);
    }
  };

  const handleCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase) return;
    const form = new FormData(event.currentTarget);
    const targetUrl = String(form.get('target_url') || '').trim();
    const notes = String(form.get('notes') || '').trim();
    const imageFile = form.get('screenshot') instanceof File ? form.get('screenshot') as File : null;
    if (!targetUrl) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(CAPTURE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ url: targetUrl }),
      });
      const payload = await response.json() as CaptureResponse & { error?: string };
      if (!response.ok || !payload.html || !payload.finalUrl) throw new Error(payload.error || 'Capture failed');
      const capturedAt = new Date().toISOString();
      const hash = await sha512(payload.html);
      let generatedPreview = '';
      let previewFailed = false;
      if (imageFile && imageFile.size > 0) {
        generatedPreview = await readFileAsDataUrl(imageFile);
      } else {
        try {
          generatedPreview = await createPreviewDataUrl(payload);
        } catch {
          generatedPreview = '';
          previewFailed = true;
        }
      }
      const preview = generatedPreview;
      const sharedEvidence = {
        case_id: selectedCase.id,
        target_url: targetUrl,
        final_url: payload.finalUrl,
        http_status: payload.status,
        content_type: payload.contentType,
        sha512: hash,
        captured_at: capturedAt,
        browser_metadata: browserMetadata(),
      };
      const records: EvidenceArtifact[] = [
        { id: crypto.randomUUID(), ...sharedEvidence, artifact_type: 'downloaded_page', title: payload.title, raw_html: payload.html, screenshot_preview: preview, screenshot_previews: preview ? [preview] : [], extracted_links: payload.links, notes, created_at: capturedAt },
        { id: crypto.randomUUID(), ...sharedEvidence, artifact_type: 'screenshot', title: payload.title || t('investigation.fullPagePreview'), raw_html: payload.html, screenshot_preview: preview, screenshot_previews: preview ? [preview] : [], extracted_links: [], notes: t('investigation.generatedPreview'), created_at: capturedAt },
        { id: crypto.randomUUID(), ...sharedEvidence, artifact_type: 'extracted_link', title: `${payload.links.length} ${t('investigation.extractedLinks')}`, raw_html: payload.html, screenshot_preview: preview, screenshot_previews: preview ? [preview] : [], extracted_links: payload.links, notes: '', created_at: capturedAt },
        ...(notes ? [{ id: crypto.randomUUID(), ...sharedEvidence, artifact_type: 'text_note' as const, title: t('investigation.captureNote'), raw_html: '', screenshot_preview: preview, screenshot_previews: preview ? [preview] : [], extracted_links: [], notes, created_at: capturedAt }] : []),
      ];
      const nextArtifacts = [...records, ...readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY)];
      writeLocalList(LOCAL_ARTIFACTS_KEY, nextArtifacts);
      setArtifacts((current) => [...records, ...current]);
      setShowCapture(false);
      if (previewFailed) setError(t('investigation.capturePartial'));
    } catch (cause) {
      setError(t('investigation.captureError'));
      console.error(cause);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteArtifact = async (artifactId: string) => {
    if (!window.confirm(t('investigation.deleteArtifactConfirm'))) return;
    const nextArtifacts = readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY).filter((artifact) => artifact.id !== artifactId);
    writeLocalList(LOCAL_ARTIFACTS_KEY, nextArtifacts);
    setArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
  };

  const handleUpdateArtifactNotes = async (artifactId: string, notes: string) => {
    const nextArtifacts = readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY).map((artifact) => artifact.id === artifactId ? { ...artifact, notes } : artifact);
    writeLocalList(LOCAL_ARTIFACTS_KEY, nextArtifacts);
    setArtifacts((current) => current.map((artifact) => artifact.id === artifactId ? { ...artifact, notes } : artifact));
  };

  const handleUpdateArtifactPreview = async (artifactId: string, screenshotPreviews: string[]) => {
    const nextArtifacts = readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY).map((artifact) => artifact.id === artifactId ? { ...artifact, screenshot_preview: screenshotPreviews[0] ?? '', screenshot_previews: screenshotPreviews } : artifact);
    writeLocalList(LOCAL_ARTIFACTS_KEY, nextArtifacts);
    setArtifacts((current) => current.map((artifact) => artifact.id === artifactId ? { ...artifact, screenshot_preview: screenshotPreviews[0] ?? '', screenshot_previews: screenshotPreviews } : artifact));
  };

  if (showReport && selectedCase) {
    return <InvestigationReport investigationCase={selectedCase} artifacts={filteredArtifacts} onBack={() => setShowReport(false)} />;
  }

  return (
    <section className="flex-1 min-h-0 overflow-hidden bg-cyber-black text-cyber-text">
      <div className="h-full overflow-y-auto custom-scrollbar p-6 lg:p-8">
        <div className="mx-auto max-w-[1500px]">
          <header className="flex flex-col gap-5 border-b border-cyber-border pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-cyber-cyan"><ShieldCheck size={14} /> {t('investigation.eyebrow')}</div>
              <h1 className="text-2xl font-semibold tracking-tight text-cyber-text">{t('investigation.title')}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-cyber-text-dim">{t('investigation.subtitle')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onClose} className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-text"><ArrowLeft size={14} /> {t('investigation.back')}</button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-2 text-xs font-semibold text-cyber-cyan transition hover:bg-cyber-cyan/20"><Plus size={14} /> {t('investigation.newCase')}</button>
            </div>
          </header>

          {error && <div className="mt-5 flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300"><span>{error}</span><button onClick={() => setError('')}><X size={14} /></button></div>}

          {!selectedCase ? (
            <div className="mt-7">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyber-text-dim">{t('investigation.workspace')}</h2><span className="font-mono text-[11px] text-cyber-text-dim">{cases.length} {t('investigation.caseCount')}</span></div><div className="flex items-center gap-1 rounded-lg border border-cyber-border bg-cyber-panel p-1"><button onClick={() => setCardDensity('compact')} className={`rounded px-2 py-1 text-[10px] ${cardDensity === 'compact' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim'}`}>{t('investigation.compact')}</button><button onClick={() => setCardDensity('comfortable')} className={`rounded px-2 py-1 text-[10px] ${cardDensity === 'comfortable' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim'}`}>{t('investigation.comfortable')}</button></div></div>
              {loading ? <LoadingState label={t('investigation.loading')} /> : cases.length === 0 ? <EmptyCases onCreate={() => setShowCreate(true)} /> : <div className={`grid gap-4 md:grid-cols-2 ${cardDensity === 'compact' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>{cases.map((investigationCase) => <CaseCard key={investigationCase.id} investigationCase={investigationCase} compact={cardDensity === 'compact'} onClick={() => void handleSelectCase(investigationCase)} onEdit={() => { setSelectedCase(investigationCase); setShowEdit(true); }} onDelete={() => void handleDeleteCase(investigationCase)} />)}</div>}
            </div>
          ) : (
            <CaseWorkspace investigationCase={selectedCase} artifacts={filteredArtifacts} loading={loading} search={search} dateFilter={dateFilter} onSearch={setSearch} onDateFilter={setDateFilter} onBack={() => setSelectedCase(null)} onEdit={() => setShowEdit(true)} onCapture={() => setShowCapture(true)} onReport={() => setShowReport(true)} onDeleteCase={() => void handleDeleteCase(selectedCase)} onDeleteArtifact={(id) => void handleDeleteArtifact(id)} onUpdateArtifactNotes={(id, notes) => void handleUpdateArtifactNotes(id, notes)} onUpdateArtifactPreview={(id, previews) => void handleUpdateArtifactPreview(id, previews)} />
          )}
        </div>
      </div>

      {showCreate && <Modal title={t('investigation.createTitle')} onClose={() => setShowCreate(false)}><CaseForm submitLabel={t('investigation.create')} onSubmit={handleCreateCase} /></Modal>}
      {showEdit && selectedCase && <Modal title={t('investigation.editTitle')} onClose={() => setShowEdit(false)}><CaseForm investigationCase={selectedCase} submitLabel={t('investigation.save')} onSubmit={handleUpdateCase} /></Modal>}
      {showCapture && <Modal title={t('investigation.captureTitle')} onClose={() => !loading && setShowCapture(false)}><form onSubmit={handleCapture} className="space-y-4"><Field label={t('investigation.targetUrl')} name="target_url" type="url" placeholder="https://example.org/page" required /><Field label={t('investigation.captureNoteLabel')} name="notes" placeholder={t('investigation.captureNotePlaceholder')} textarea /><label className="block text-sm font-medium text-cyber-text-dim"><span className="mb-1.5 block">{t('investigation.customScreenshot')}</span><input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full rounded-lg border border-cyber-border bg-cyber-black/60 p-2 text-xs text-cyber-text file:mr-3 file:rounded-md file:border-0 file:bg-cyber-cyan/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyber-cyan" /></label><div className="rounded-lg border border-cyber-border bg-cyber-black/60 p-3 text-xs leading-5 text-cyber-text-dim"><div className="flex items-center gap-2 text-cyber-cyan"><Globe2 size={13} /> {t('investigation.serverCapture')}</div><p className="mt-1">{t('investigation.serverCaptureDescription')}</p></div><div className="flex justify-end gap-2 pt-2"><button type="button" disabled={loading} onClick={() => setShowCapture(false)} className="rounded-lg border border-cyber-border px-4 py-2 text-xs text-cyber-text-dim">{t('investigation.cancel')}</button><button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black disabled:opacity-60">{loading ? <Loader size={13} className="animate-spin" /> : <Archive size={13} />} {t('investigation.capture')}</button></div></form></Modal>}
    </section>
  );
}

function CaseCard({ investigationCase, compact, onClick, onEdit, onDelete }: { investigationCase: InvestigationCase; compact: boolean; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className={`group relative rounded-xl border border-cyber-border bg-cyber-panel/60 text-left transition hover:-translate-y-0.5 hover:border-cyber-cyan/50 hover:bg-cyber-panel ${compact ? 'p-4' : 'p-5'}`}><button onClick={onClick} className="block w-full text-left"><div className={`flex items-start justify-between ${compact ? 'mb-4' : 'mb-6'}`}><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan"><Archive size={18} /></div><ChevronRight size={16} className="text-cyber-text-dim transition group-hover:translate-x-1 group-hover:text-cyber-cyan" /></div><h3 className="truncate text-sm font-semibold text-cyber-text">{investigationCase.case_name}</h3><div className="mt-3 space-y-2 text-xs text-cyber-text-dim"><div className="flex items-center gap-2"><UserRound size={12} /> {investigationCase.investigating_officer || 'Officer not assigned'}</div><div className="flex items-center gap-2"><Calendar size={12} /> Updated {formatDate(investigationCase.updated_at)}</div></div></button><div className="mt-4 flex justify-end gap-1 border-t border-cyber-border pt-3"><button onClick={onEdit} className="rounded-md p-1.5 text-cyber-text-dim hover:bg-cyber-cyan/10 hover:text-cyber-cyan" title="Edit case"><Pencil size={13} /></button><button onClick={onDelete} className="rounded-md p-1.5 text-cyber-text-dim hover:bg-red-500/10 hover:text-red-400" title="Delete case"><Trash2 size={13} /></button></div></div>;
}

function CaseWorkspace({ investigationCase, artifacts, loading, search, dateFilter, onSearch, onDateFilter, onBack, onEdit, onCapture, onReport, onDeleteCase, onDeleteArtifact, onUpdateArtifactNotes, onUpdateArtifactPreview }: { investigationCase: InvestigationCase; artifacts: EvidenceArtifact[]; loading: boolean; search: string; dateFilter: string; onSearch: (value: string) => void; onDateFilter: (value: string) => void; onBack: () => void; onEdit: () => void; onCapture: () => void; onReport: () => void; onDeleteCase: () => void; onDeleteArtifact: (id: string) => void; onUpdateArtifactNotes: (id: string, notes: string) => void; onUpdateArtifactPreview: (id: string, previews: string[]) => void }) {
  const { t } = useLanguage();
  return <div className="mt-7"><button onClick={onBack} className="mb-4 flex items-center gap-2 text-xs text-cyber-text-dim hover:text-cyber-cyan"><ArrowLeft size={14} /> {t('investigation.allCases')}</button><div className="rounded-xl border border-cyber-border bg-cyber-panel/60 p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.15em] text-cyber-green"><CheckCircle2 size={13} /> {t('investigation.activeCase')}</div><h2 className="text-xl font-semibold">{investigationCase.case_name}</h2><p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-cyber-text-dim">{investigationCase.notes || t('investigation.noNotes')}</p></div><div className="flex flex-wrap gap-2"><button onClick={onEdit} className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-text"><Pencil size={14} /> {t('investigation.edit')}</button><button onClick={onReport} className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-text"><Printer size={14} /> {t('investigation.report')}</button><button onClick={onDeleteCase} className="flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> {t('investigation.delete')}</button><button onClick={onCapture} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-3 py-2 text-xs font-semibold text-cyber-black hover:bg-cyan-300"><Archive size={14} /> {t('investigation.capture')}</button></div></div><div className="mt-5 grid gap-3 border-t border-cyber-border pt-5 sm:grid-cols-3"><Meta label={t('investigation.officer')} value={investigationCase.investigating_officer || '—'} icon={<UserRound size={13} />} /><Meta label={t('investigation.agency')} value={investigationCase.agency || '—'} icon={<ShieldCheck size={13} />} /><Meta label={t('investigation.artifacts')} value={String(artifacts.length)} icon={<Fingerprint size={13} />} /></div></div><div className="mt-5 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-dim" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('investigation.filterPlaceholder')} className="input-cyber h-10 pl-9 text-sm" /></div><div className="relative"><Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-dim" /><input aria-label={t('investigation.dateFilter')} type="date" value={dateFilter} onChange={(event) => onDateFilter(event.target.value)} className="input-cyber h-10 pl-9 text-sm" /></div></div><div className="mt-4 overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/50">{loading ? <LoadingState label={t('investigation.loading')} /> : artifacts.length === 0 ? <div className="p-12 text-center"><FileText size={28} className="mx-auto mb-3 text-cyber-border" /><p className="text-sm text-cyber-text-dim">{t('investigation.noEvidence')}</p><button onClick={onCapture} className="mt-4 text-xs text-cyber-cyan hover:underline">{t('investigation.captureFirst')}</button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left"><thead className="border-b border-cyber-border bg-cyber-dark/60 text-xs uppercase tracking-wider text-cyber-text-dim"><tr><th className="px-4 py-3">{t('investigation.artifact')}</th><th className="px-4 py-3">{t('investigation.target')}</th><th className="px-4 py-3">{t('investigation.integrity')}</th><th className="px-4 py-3">{t('investigation.captured')}</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-cyber-border/70">{artifacts.map((artifact) => <ArtifactRow key={artifact.id} artifact={artifact} onDelete={() => onDeleteArtifact(artifact.id)} onUpdateNotes={onUpdateArtifactNotes} onUpdatePreview={onUpdateArtifactPreview} onRetryCapture={onCapture} />)}</tbody></table></div>}</div></div>;
}

function ArtifactRow({ artifact, onDelete, onUpdateNotes, onUpdatePreview, onRetryCapture }: { artifact: EvidenceArtifact; onDelete: () => void; onUpdateNotes: (id: string, notes: string) => void; onUpdatePreview: (id: string, previews: string[]) => void; onRetryCapture: () => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return <><tr className="group hover:bg-cyber-cyan/5"><td className="px-4 py-3"><button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm text-cyber-text hover:text-cyber-cyan"><div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan"><FileCode2 size={14} /></div><span><span className="block font-semibold">{artifact.title || artifactTypeLabel(t, artifact.artifact_type)}</span><span className="block text-xs text-cyber-text-dim">{artifactTypeLabel(t, artifact.artifact_type)} · HTTP {artifact.http_status || '—'}</span></span></button></td><td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-cyber-text-dim" title={artifact.final_url || artifact.target_url}>{artifact.final_url || artifact.target_url}</td><td className="px-4 py-3"><span className="flex max-w-[180px] items-center gap-1.5 truncate font-mono text-xs text-cyber-green" title={artifact.sha512}><Hash size={12} /> {artifact.sha512.slice(0, 18)}…</span></td><td className="whitespace-nowrap px-4 py-3 text-xs text-cyber-text-dim">{formatDate(artifact.captured_at)}</td><td className="px-4 py-3 text-right"><button onClick={onDelete} className="rounded-md p-1.5 text-cyber-text-dim opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400" title="Delete artifact"><Trash2 size={14} /></button></td></tr>{open && <tr><td colSpan={5} className="bg-cyber-black/40 p-4"><ArtifactDetail artifact={artifact} onUpdateNotes={onUpdateNotes} onUpdatePreview={onUpdatePreview} onRetryCapture={onRetryCapture} /></td></tr>}</>;
}

function ArtifactDetail({ artifact, onUpdateNotes, onUpdatePreview, onRetryCapture }: { artifact: EvidenceArtifact; onUpdateNotes: (id: string, notes: string) => void; onUpdatePreview: (id: string, previews: string[]) => void; onRetryCapture: () => void }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'preview' | 'html' | 'links' | 'metadata'>('preview');
  const [imageIndex, setImageIndex] = useState(0);
  const [notes, setNotes] = useState(artifact.notes);
  const [imageFailed, setImageFailed] = useState(false);
  const [htmlPreviewFailed, setHtmlPreviewFailed] = useState(false);
  useEffect(() => { setTab('preview'); setImageIndex(0); setNotes(artifact.notes); setImageFailed(false); setHtmlPreviewFailed(false); }, [artifact.id, artifact.raw_html]);
  const images = artifactImages(artifact);
  const clampedIndex = Math.min(imageIndex, Math.max(0, images.length - 1));
  const activeImage = images[clampedIndex] ?? '';
  useEffect(() => { setImageFailed(false); }, [activeImage]);
  const isHtml = isHtmlContent(artifact.raw_html, artifact.content_type);
  const safeHtml = useMemo(() => sanitizePreviewHtml(artifact.raw_html, artifact.final_url || artifact.target_url), [artifact.raw_html, artifact.final_url, artifact.target_url]);  const rawFormatted = useMemo(() => formatRawContent(artifact.raw_html, artifact.content_type), [artifact.raw_html, artifact.content_type]);
  const handleAttachImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const preview = await readFileAsDataUrl(file);
      onUpdatePreview(artifact.id, [...images, preview]);
      setImageIndex(images.length);
    } catch (cause) {
      console.error(cause);
    }
  };

  const downloadPreview = async () => {
    if (!activeImage) return;
    const safeName = (artifact.title || 'evidence-preview').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'evidence-preview';
    try {
      const response = await fetch(activeImage);
      if (!response.ok) throw new Error('Preview unavailable');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${safeName}.svg`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      console.error(cause);
    }
  };
  return <div><div className="mb-3 flex flex-wrap items-center gap-2"><div className="flex rounded-md border border-cyber-border p-0.5">{(['preview', 'html', 'links', 'metadata'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${tab === item ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}>{item === 'links' ? t('investigation.linksTab') : item}</button>)}</div><button onClick={() => void downloadPreview()} disabled={!activeImage} className="flex items-center gap-1 text-xs text-cyber-text-dim hover:text-cyber-cyan disabled:opacity-40"><Camera size={13} /> {t('investigation.quickCapture')}</button><label className="flex cursor-pointer items-center gap-1 text-xs text-cyber-text-dim hover:text-cyber-cyan"><Pencil size={13} /> {t('investigation.attachImage')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void handleAttachImage(event)} className="hidden" /></label><a href={artifact.final_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-xs text-cyber-text-dim hover:text-cyber-cyan"><ExternalLink size={12} /> {t('investigation.openTarget')}</a></div><div className="mb-4 grid gap-2 rounded-lg border border-cyber-border bg-cyber-dark/80 p-3 text-sm sm:grid-cols-3"><div><span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">HTTP status</span><strong className="mt-1 block font-mono text-cyber-green">{artifact.http_status || '—'}</strong></div><div><span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">Content type</span><strong className="mt-1 block break-words font-mono text-cyber-text">{artifact.content_type || '—'}</strong></div><div><span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">Target</span><strong className="mt-1 block break-all font-mono text-cyber-text">{artifact.final_url || artifact.target_url}</strong></div></div>{tab === 'preview' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(420px,.88fr)]"><div className="overflow-hidden rounded-lg border border-cyber-border bg-white">{isHtml && !htmlPreviewFailed ? <PreviewErrorBoundary fallback={<div className="flex h-[460px] flex-col items-center justify-center gap-3 bg-cyber-dark/40 p-8"><FileText size={28} className="text-cyber-border" /><p className="text-center text-sm text-cyber-text-dim">{t('investigation.previewError')}</p><button type="button" onClick={onRetryCapture} className="rounded-md border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyber-cyan">{t('investigation.retryCapture')}</button></div>}><iframe title="Captured page preview" sandbox="allow-same-origin" srcDoc={safeHtml} onLoad={(event) => { const body = event.currentTarget.contentDocument?.body; if (body && !body.textContent?.trim() && body.children.length === 0) setHtmlPreviewFailed(true); }} className="h-[460px] w-full" /></PreviewErrorBoundary> : <div className="flex h-[460px] flex-col"><div className="border-b border-cyber-border bg-cyber-dark px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-cyan">{artifact.content_type || 'Raw content'} · {artifact.raw_html.length.toLocaleString('fr-FR')} characters</div><pre className="flex-1 overflow-auto whitespace-pre-wrap break-words bg-[#080c14] p-5 font-mono text-[12px] leading-6 text-slate-100">{rawFormatted || t('investigation.noHtml')}</pre></div>}</div><div className="space-y-3"><div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-lg border border-cyber-border bg-[#080c14] p-3">{activeImage && !imageFailed ? <div className="flex max-h-[640px] w-full items-center justify-center overflow-auto rounded-md bg-white/5"><img src={safeImageSource(activeImage)} alt={`${t('investigation.previewAlt')} ${clampedIndex + 1}`} onError={() => setImageFailed(true)} className="block max-h-[620px] w-auto max-w-full object-contain object-center" /></div> : <div className="flex min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-cyber-border/60 bg-cyber-dark/40 p-8"><FileText size={28} className="text-cyber-border" /><p className="text-center text-sm text-cyber-text-dim">{imageFailed ? t('investigation.previewError') : t('investigation.noPreview')}</p><div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={onRetryCapture} className="rounded-md border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyber-cyan hover:bg-cyber-cyan/20">{t('investigation.retryCapture')}</button><label className="cursor-pointer rounded-md border border-cyber-border px-3 py-1.5 text-xs font-semibold text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-text">{t('investigation.attachImage')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void handleAttachImage(event)} className="hidden" /></label></div></div>}{images.length > 1 && <><button type="button" onClick={() => setImageIndex((current) => (current - 1 + images.length) % images.length)} className="absolute left-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-cyber-border bg-cyber-black/90 text-lg text-cyber-text shadow-lg hover:border-cyber-cyan hover:text-cyber-cyan" aria-label="Previous image">‹</button><button type="button" onClick={() => setImageIndex((current) => (current + 1) % images.length)} className="absolute right-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-cyber-border bg-cyber-black/90 text-lg text-cyber-text shadow-lg hover:border-cyber-cyan hover:text-cyber-cyan" aria-label="Next image">›</button><span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-cyber-black/90 px-2.5 py-1 text-[11px] font-mono text-cyber-text">{clampedIndex + 1} / {images.length}</span></>}{activeImage && <button type="button" onClick={() => { const nextImages = images.filter((_, index) => index !== clampedIndex); setImageIndex(nextImages.length === 0 ? 0 : Math.min(clampedIndex, nextImages.length - 1)); setImageFailed(false); onUpdatePreview(artifact.id, nextImages); }} className="absolute right-5 top-5 flex items-center gap-1 rounded-md border border-red-400/40 bg-cyber-black/90 px-2 py-1.5 text-xs font-semibold text-red-300 shadow-lg transition hover:bg-red-500/20" title={t('investigation.removeImage')}><Trash2 size={13} /> {t('investigation.removeImage')}</button>}</div><div className="rounded-lg border border-cyber-border bg-cyber-dark p-4 text-sm text-cyber-text"><p className="mb-2 text-xs font-semibold text-cyber-green">SHA-512 VERIFIED RECORD</p><p className="break-all font-mono text-xs leading-5">{artifact.sha512}</p></div></div></div>}{tab === 'html' && <div className="overflow-hidden rounded-lg border border-cyber-border bg-[#080c14]"><div className="border-b border-cyber-border bg-cyber-dark px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-cyan">HTML source · {artifact.raw_html.length.toLocaleString('fr-FR')} characters</div><pre className="max-h-[460px] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-6 text-slate-100">{artifact.raw_html || t('investigation.noHtml')}</pre></div>}{tab === 'links' && <div className="overflow-hidden rounded-lg border border-cyber-border bg-[#080c14]"><div className="border-b border-cyber-border bg-cyber-dark px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-cyan">{t('investigation.linksTab')} · {artifact.extracted_links.length}</div>{artifact.extracted_links.length === 0 ? <div className="p-8 text-center text-sm text-cyber-text-dim">{t('investigation.noLinks')}</div> : <ul className="max-h-[460px] divide-y divide-cyber-border/50 overflow-auto">{artifact.extracted_links.map((link) => <li key={link} className="px-4 py-2.5"><a href={link} target="_blank" rel="noopener noreferrer" className="block break-all font-mono text-xs text-cyber-cyan hover:underline">{link}</a></li>)}</ul>}</div>}{tab === 'metadata' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(artifact.browser_metadata).map(([key, value]) => <div key={key} className="rounded-lg border border-cyber-border bg-[#080c14] p-4"><div className="text-xs font-semibold uppercase tracking-wider text-cyber-cyan">{key}</div><div className="mt-2 break-words font-mono text-[13px] leading-6 text-slate-100">{String(value)}</div></div>)}</div>}<div className="mt-4 grid gap-3 border-t border-cyber-border pt-3 md:grid-cols-[1fr_auto] md:items-end"><label className="text-xs font-semibold text-cyber-text-dim"><span className="mb-1.5 block">{t('investigation.contextNotes')}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => onUpdateNotes(artifact.id, notes)} rows={3} placeholder={t('investigation.contextNotesPlaceholder')} className="input-cyber resize-y text-sm leading-6" /></label><button onClick={() => onUpdateNotes(artifact.id, notes)} className="flex items-center justify-center gap-1.5 rounded-lg border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-2 text-xs font-semibold text-cyber-cyan"><Clipboard size={13} /> {t('investigation.saveNote')}</button></div><div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-cyber-text-dim"><span className="flex items-center gap-1"><Timer size={12} /> {formatDate(artifact.captured_at)}</span><span className="flex items-center gap-1"><Globe2 size={12} /> {artifact.extracted_links.length} {t('investigation.linksExtracted')}</span><span className="flex items-center gap-1"><Clipboard size={12} /> {artifact.raw_html.length.toLocaleString('fr-FR')} {t('investigation.characters')}</span></div></div>;
}

function InvestigationReport({ investigationCase, artifacts, onBack }: { investigationCase: InvestigationCase; artifacts: EvidenceArtifact[]; onBack: () => void }) {
  const { t } = useLanguage();
  return <section className="flex-1 min-h-0 overflow-y-auto bg-cyber-black p-6 text-cyber-text print:bg-white print:p-10 print:text-black"><div className="mx-auto max-w-[1100px]"><div className="mb-8 flex items-center justify-between print:hidden"><button onClick={onBack} className="flex items-center gap-2 text-xs text-cyber-text-dim hover:text-cyber-cyan"><ArrowLeft size={14} /> {t('investigation.backToCase')}</button><button onClick={() => printCleanReport(investigationCase, artifacts, t)} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-3 py-2 text-xs font-semibold text-cyber-black"><Download size={14} /> {t('investigation.exportReport')}</button></div><div className="border-b border-cyber-border pb-6 print:border-black"><p className="font-mono text-xs uppercase tracking-[0.2em] text-cyber-cyan print:text-black">Ghostint · {t('investigation.reportTitle')}</p><h1 className="mt-3 text-3xl font-semibold">{investigationCase.case_name}</h1><div className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><Meta label={t('investigation.officer')} value={investigationCase.investigating_officer || '—'} icon={<UserRound size={13} />} /><Meta label={t('investigation.agency')} value={investigationCase.agency || '—'} icon={<ShieldCheck size={13} />} /><Meta label={t('investigation.artifacts')} value={String(artifacts.length)} icon={<Fingerprint size={13} />} /></div></div><p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-cyber-text-dim print:text-gray-700">{investigationCase.notes}</p><div className="mt-8 space-y-5">{artifacts.map((artifact, index) => <article key={artifact.id} className="break-inside-avoid rounded-xl border border-cyber-border bg-cyber-panel/50 p-5 print:border-gray-300 print:bg-white"><div className="flex items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-wider text-cyber-cyan print:text-gray-600">{t('investigation.evidence')} {String(index + 1).padStart(2, '0')} · {artifactTypeLabel(t, artifact.artifact_type)}</div><h2 className="mt-2 text-base font-semibold">{artifact.title || artifact.final_url}</h2></div><span className="whitespace-nowrap text-xs text-cyber-text-dim print:text-gray-600">{formatDate(artifact.captured_at)}</span></div><p className="mt-3 break-all font-mono text-xs text-cyber-text-dim print:text-gray-600">{artifact.final_url}</p>{artifact.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-cyber-text-dim print:text-gray-700">{artifact.notes}</p>}<div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">{safeImageSource(artifactImages(artifact)[0] ?? '') ? <img src={safeImageSource(artifactImages(artifact)[0] ?? '')} alt={t('investigation.previewAlt')} className="w-full rounded border border-cyber-border print:border-gray-300" /> : <div className="flex min-h-[100px] items-center justify-center rounded border border-dashed border-cyber-border p-4 text-center text-xs text-cyber-text-dim print:border-gray-300 print:text-gray-600">{t('investigation.noPreview')}</div>}<div><div className="mb-2 text-xs uppercase tracking-wider text-cyber-text-dim print:text-gray-600">SHA-512 integrity digest</div><p className="break-all font-mono text-xs leading-5 text-cyber-green print:text-gray-700">{artifact.sha512}</p><div className="mt-4 text-xs text-cyber-text-dim print:text-gray-600">HTTP {artifact.http_status || '—'} · {artifact.extracted_links.length} links · {artifact.raw_html.length.toLocaleString('fr-FR')} HTML characters</div></div></div></article>)}</div></div></section>;
}

function CaseForm({ investigationCase, submitLabel, onSubmit }: { investigationCase?: InvestigationCase; submitLabel: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useLanguage();
  return <form onSubmit={onSubmit} className="space-y-4"><Field label={t('investigation.caseName')} name="case_name" placeholder={t('investigation.caseNamePlaceholder')} defaultValue={investigationCase?.case_name} required /><div className="grid gap-4 sm:grid-cols-2"><Field label={t('investigation.officer')} name="investigating_officer" placeholder={t('investigation.officerPlaceholder')} defaultValue={investigationCase?.investigating_officer} /><Field label={t('investigation.agency')} name="agency" placeholder={t('investigation.agencyPlaceholder')} defaultValue={investigationCase?.agency} /></div><Field label={t('investigation.notes')} name="notes" placeholder={t('investigation.notesPlaceholder')} defaultValue={investigationCase?.notes} textarea /><div className="flex justify-end gap-2 pt-2"><button type="submit" className="rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black">{submitLabel}</button></div></form>;
}

function Meta({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="flex items-center gap-2 text-sm"><span className="text-cyber-cyan">{icon}</span><span><span className="block text-xs uppercase tracking-wider text-cyber-text-dim">{label}</span><span className="block truncate font-medium text-cyber-text">{value}</span></span></div>; }
function Field({ label, name, placeholder, type = 'text', required = false, textarea = false, defaultValue }: { label: string; name: string; placeholder: string; type?: string; required?: boolean; textarea?: boolean; defaultValue?: string }) { return <label className="block text-sm font-medium text-cyber-text-dim"><span className="mb-1.5 block">{label}</span>{textarea ? <textarea name={name} placeholder={placeholder} defaultValue={defaultValue} required={required} rows={4} className="input-cyber resize-none text-sm leading-6" /> : <input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} className="input-cyber h-10 text-sm" />}</label>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-xl border border-cyber-border bg-cyber-dark shadow-2xl"><div className="flex items-center justify-between border-b border-cyber-border px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2><button onClick={onClose} className="text-cyber-text-dim hover:text-cyber-text"><X size={16} /></button></div><div className="p-5">{children}</div></div></div>; }
function LoadingState({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 p-12 text-sm text-cyber-text-dim"><Loader size={15} className="animate-spin text-cyber-cyan" /> {label}</div>; }
function EmptyCases({ onCreate }: { onCreate: () => void }) { const { t } = useLanguage(); return <div className="rounded-xl border border-dashed border-cyber-border p-16 text-center"><Archive size={32} className="mx-auto mb-4 text-cyber-border" /><h3 className="text-sm font-semibold">{t('investigation.emptyTitle')}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-cyber-text-dim">{t('investigation.emptyDescription')}</p><button onClick={onCreate} className="mt-5 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black">{t('investigation.createFirst')}</button></div>; }
