import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import React from 'react';
import {
  AlertTriangle, Archive, ArrowLeft, Calendar, CheckCircle2, ChevronRight, Clipboard,
  Download, ExternalLink, FileCode2, FileSearch, FileText, Filter, Fingerprint,
  Globe2, Hash, Image as ImageIcon, Loader, Pencil, Plus, Printer, RotateCw, Search,
  ShieldCheck, Timer, Trash2, Upload, UserRound, X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  LOCAL_CASES_KEY, CaptureError, artifactImages, buildArtifact,
  emptyMetadata, escapeHtml, formatRawContent, isHtmlContent, isProtectedTarget,
  parseHtmlDocument, readFileAsDataUrl, readFileAsText, readLocalList,
  requestPageCapture, safeImageSource, sanitizePreviewHtml, writeLocalList,
} from '../lib/capture';
import {
  listArtifactsOfCase, migrateLegacyArtifacts, readOriginal,
  removeArtifact, removeArtifactsOfCase, saveArtifact, updateArtifact,
} from '../lib/evidenceStore';
import { buildArtifactFromFile, type ImportFailure } from '../lib/evidenceImport';
import CaseBrowser from './CaseBrowser';
import EvidenceReader from './EvidenceReader';
import EvidenceTimeline from './EvidenceTimeline';
import { useToast } from './Toast';
import { useStore } from '../store/useStore';
import { exportEvidencePack } from '../lib/evidencePdf';
import {
  RELIABILITY_LABEL_KEY,
  RELIABILITY_STYLE,
  assessReliability,
} from '../lib/evidenceInsight';
import type { EvidenceArtifact, EvidenceArtifactType, InvestigationCase, MetadataResponse } from '../types/investigation';

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
  const [captureError, setCaptureError] = useState('');
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

  const loadArtifacts = async (caseId: string) => {
    const data = await listArtifactsOfCase(caseId);
    setArtifacts(data);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Reprise des preuves écrites par l'ancienne version dans `localStorage`.
      // Sans elle, les dossiers existants paraîtraient vides.
      await migrateLegacyArtifacts();
      loadCases();
      setLoading(false);
    };
    void load();
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      if (selectedCase) void loadArtifacts(selectedCase.id);
    };
    window.addEventListener('investigation-refresh-artifacts', handleRefresh);
    return () => window.removeEventListener('investigation-refresh-artifacts', handleRefresh);
  }, [selectedCase]);

  const filteredArtifacts = useMemo(() => artifacts.filter((artifact) => {
    const haystack = [artifact.target_url, artifact.final_url, artifact.title, artifact.notes, artifact.sha512].join(' ').toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.toLowerCase().trim());
    const matchesDate = !dateFilter || artifact.captured_at.startsWith(dateFilter);
    return matchesSearch && matchesDate;
  }), [artifacts, dateFilter, search]);

  const handleSelectCase = async (investigationCase: InvestigationCase) => {
    setSelectedCase(investigationCase);
    setError('');
    window.dispatchEvent(new CustomEvent('investigation-case-selected', { detail: { caseId: investigationCase.id } }));
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
    window.dispatchEvent(new CustomEvent('investigation-case-selected', { detail: { caseId: created.id } }));
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

  const handleCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const minimalSave = submitter?.dataset.minimal === 'true';

    const form = new FormData(event.currentTarget);
    const targetUrl = String(form.get('target_url') || '').trim();
    const notes = String(form.get('notes') || '').trim();
    const pastedHtml = String(form.get('html_paste') || '').trim();
    const imageFile = form.get('screenshot') instanceof File && (form.get('screenshot') as File).size > 0 ? form.get('screenshot') as File : null;
    const htmlFile = form.get('html_file') instanceof File && (form.get('html_file') as File).size > 0 ? form.get('html_file') as File : null;

    if (!targetUrl && !htmlFile && !pastedHtml) {
      setCaptureError(t('investigation.needTargetOrHtml'));
      return;
    }
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        setCaptureError(t('investigation.invalidUrl'));
        return;
      }
    }

    setLoading(true);
    setCaptureError('');
    setError('');
    try {
      let metadata: MetadataResponse;
      let source = 'local-capture-engine';

      if (htmlFile) {
        // Imported page saved from the investigator's own browser: fully local.
        metadata = parseHtmlDocument(await readFileAsText(htmlFile), targetUrl);
        source = 'imported-html-file';
      } else if (pastedHtml) {
        metadata = parseHtmlDocument(pastedHtml, targetUrl);
        source = 'pasted-html';
      } else {
        try {
          metadata = await requestPageCapture(targetUrl);
        } catch (cause) {
          console.warn('Page capture unavailable', cause);
          if (!minimalSave) {
            // Keep the modal open so the investigator can import the HTML instead.
            const code = cause instanceof CaptureError ? cause.code : 'UNKNOWN';
            const reasonKey = `investigation.captureReason${code.charAt(0)}${code.slice(1).toLowerCase()}`;
            const reason = t(reasonKey) !== reasonKey ? t(reasonKey) : (cause instanceof Error ? cause.message : String(cause));
            const status = cause instanceof CaptureError && cause.status ? ` (HTTP ${cause.status})` : '';
            setCaptureError(`${t('investigation.captureFailed')} ${reason}${status} ${t('investigation.captureImportHint')}`);
            return;
          }
          metadata = emptyMetadata(targetUrl);
          source = 'manual-record-no-content';
        }
      }

      const artifact = await buildArtifact(selectedCase.id, { targetUrl: targetUrl || metadata.finalUrl, notes, imageFile }, metadata, source);
      const stored = await saveArtifact(artifact);
      setArtifacts((current) => [artifact, ...current]);
      setShowCapture(false);
      if (!stored) setError(t('investigation.storageFull'));
      else if (source === 'manual-record-no-content') setError(t('investigation.capturePartial'));
    } catch (cause) {
      setError(t('investigation.captureError'));
      console.error(cause);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateArtifactCapture = async (artifact: EvidenceArtifact): Promise<void> => {
    setError('');
    try {
      const targetUrl = artifact.final_url || artifact.target_url;
      const metadata = await requestPageCapture(targetUrl);
      const updates: Partial<EvidenceArtifact> = {
        final_url: metadata.finalUrl || artifact.final_url,
        title: metadata.title || artifact.title,
        http_status: metadata.status || artifact.http_status || null,
        content_type: metadata.contentType || artifact.content_type,
        raw_html: metadata.html || artifact.raw_html,
        browser_metadata: {
          ...artifact.browser_metadata,
          source: 'local-capture-engine',
          refreshedAt: new Date().toISOString(),
          textLines: metadata.text?.length ?? artifact.extracted_text?.length ?? 0,
          bytes: metadata.bytes ?? metadata.html.length,
          elapsedMs: metadata.elapsedMs ?? 0,
        },
        meta: { ...artifact.meta, ...metadata.meta },
        screenshot_preview: safeImageSource(metadata.screenshotDataUrl) || artifact.screenshot_preview,
        screenshot_previews: safeImageSource(metadata.screenshotDataUrl) ? [metadata.screenshotDataUrl] : artifact.screenshot_previews,
        extracted_links: metadata.links.length > 0 ? metadata.links : artifact.extracted_links,
        extracted_text: metadata.text && metadata.text.length > 0 ? metadata.text : artifact.extracted_text,
        extracted_assets: metadata.assets && metadata.assets.length > 0 ? metadata.assets : artifact.extracted_assets,
      };
      const updatedArtifact = { ...artifact, ...updates } as EvidenceArtifact;
      const stored = await updateArtifact(artifact.id, updates);
      setArtifacts((current) => current.map((item) => item.id === artifact.id ? (stored ?? updatedArtifact) : item));
    } catch (cause) {
      setError(t('investigation.captureError'));
      console.error(cause);
    }
  };

  const handleDeleteCase = async (investigationCase: InvestigationCase) => {
    if (!window.confirm(`${t('investigation.deleteConfirm')}\n\n${investigationCase.case_name}`)) return;
    const nextCases = readLocalList<InvestigationCase>(LOCAL_CASES_KEY).filter((item) => item.id !== investigationCase.id);
    writeLocalList(LOCAL_CASES_KEY, nextCases);
    await removeArtifactsOfCase(investigationCase.id);
    setCases(nextCases);
    if (selectedCase?.id === investigationCase.id) {
      setSelectedCase(null);
      setArtifacts([]);
      window.dispatchEvent(new CustomEvent('investigation-case-selected', { detail: { caseId: null } }));
    }
  };

  const handleDeleteArtifact = async (artifactId: string) => {
    if (!window.confirm(t('investigation.deleteArtifactConfirm'))) return;
    await removeArtifact(artifactId);
    setArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
  };

  const handleUpdateArtifactNotes = async (artifactId: string, notes: string) => {
    const stored = await updateArtifact(artifactId, { notes });
    setArtifacts((current) => current.map((artifact) => artifact.id === artifactId ? (stored ?? { ...artifact, notes }) : artifact));
  };

  const handleUpdateArtifactPreview = async (artifactId: string, screenshotPreviews: string[]) => {
    const patch = { screenshot_preview: screenshotPreviews[0] ?? '', screenshot_previews: screenshotPreviews };
    const stored = await updateArtifact(artifactId, patch);
    setArtifacts((current) => current.map((artifact) => artifact.id === artifactId ? (stored ?? { ...artifact, ...patch }) : artifact));
  };

  if (showReport && selectedCase) {
    return <InvestigationReport investigationCase={selectedCase} artifacts={filteredArtifacts} onBack={() => setShowReport(false)} />;
  }

  return (
    <section className="flex-1 min-h-0 overflow-hidden bg-cyber-black text-cyber-text">
      <div className="h-full overflow-y-auto custom-scrollbar p-6 pb-32 lg:p-8 lg:pb-32">
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

          {error && <div className="mt-5 flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-cyber-red"><span>{error}</span><button onClick={() => setError('')}><X size={14} /></button></div>}

          {!selectedCase ? (
            <div className="mt-7">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyber-text-dim">{t('investigation.workspace')}</h2><span className="font-mono text-[11px] text-cyber-text-dim">{cases.length} {t('investigation.caseCount')}</span></div><div className="flex items-center gap-1 rounded-lg border border-cyber-border bg-cyber-panel p-1"><button onClick={() => setCardDensity('compact')} className={`rounded px-2 py-1 text-[10px] ${cardDensity === 'compact' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim'}`}>{t('investigation.compact')}</button><button onClick={() => setCardDensity('comfortable')} className={`rounded px-2 py-1 text-[10px] ${cardDensity === 'comfortable' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim'}`}>{t('investigation.comfortable')}</button></div></div>
              {loading ? <LoadingState label={t('investigation.loading')} /> : cases.length === 0 ? <EmptyCases onCreate={() => setShowCreate(true)} /> : <div className={`grid gap-4 md:grid-cols-2 ${cardDensity === 'compact' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>{cases.map((investigationCase) => <CaseCard key={investigationCase.id} investigationCase={investigationCase} compact={cardDensity === 'compact'} onClick={() => void handleSelectCase(investigationCase)} onEdit={() => { setSelectedCase(investigationCase); setShowEdit(true); }} onDelete={() => void handleDeleteCase(investigationCase)} />)}</div>}
            </div>
          ) : (
            <CaseWorkspace investigationCase={selectedCase} artifacts={filteredArtifacts} loading={loading} search={search} dateFilter={dateFilter} onSearch={setSearch} onDateFilter={setDateFilter} onBack={() => { setSelectedCase(null); window.dispatchEvent(new CustomEvent('investigation-case-selected', { detail: { caseId: null } })); }} onEdit={() => setShowEdit(true)} onCapture={() => { setCaptureError(''); setShowCapture(true); }} onReport={() => setShowReport(true)} onDeleteCase={() => void handleDeleteCase(selectedCase)} onDeleteArtifact={(id) => void handleDeleteArtifact(id)} onUpdateArtifactNotes={(id, notes) => void handleUpdateArtifactNotes(id, notes)} onUpdateArtifactPreview={(id, previews) => void handleUpdateArtifactPreview(id, previews)} onGenerateArtifactCapture={(artifact) => void handleGenerateArtifactCapture(artifact)} onArtifactAdded={(artifact) => setArtifacts((current) => current.some((item) => item.id === artifact.id) ? current : [artifact, ...current])} />
          )}
        </div>
      </div>

      {showCreate && <Modal title={t('investigation.createTitle')} onClose={() => setShowCreate(false)}><CaseForm submitLabel={t('investigation.create')} onSubmit={handleCreateCase} /></Modal>}
      {showEdit && selectedCase && <Modal title={t('investigation.editTitle')} onClose={() => setShowEdit(false)}><CaseForm investigationCase={selectedCase} submitLabel={t('investigation.save')} onSubmit={handleUpdateCase} /></Modal>}
      {showCapture && (
        <Modal title={t('investigation.captureTitle')} onClose={() => !loading && setShowCapture(false)}>
          <form onSubmit={handleCapture} className="space-y-4">
            <Field label={t('investigation.targetUrl')} name="target_url" type="url" placeholder="https://example.org/page" />
            <Field label={t('investigation.captureNoteLabel')} name="notes" placeholder={t('investigation.captureNotePlaceholder')} textarea />

            <div className="rounded-lg border border-cyber-border bg-cyber-black/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyber-cyan">
                <FileCode2 size={13} /> {t('investigation.htmlImportTitle')}
              </div>
              <p className="mb-3 text-[11px] leading-5 text-cyber-text-dim">{t('investigation.htmlImportHint')}</p>
              <label className="block text-sm font-medium text-cyber-text-dim">
                <span className="mb-1.5 block">{t('investigation.htmlImportFile')}</span>
                <input
                  name="html_file"
                  type="file"
                  accept=".html,.htm,text/html"
                  className="block w-full rounded-lg border border-cyber-border bg-cyber-black/60 p-2 text-xs text-cyber-text file:mr-3 file:rounded-md file:border-0 file:bg-cyber-cyan/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyber-cyan"
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-cyber-text-dim">
                <span className="mb-1.5 block">{t('investigation.htmlPaste')}</span>
                <textarea
                  name="html_paste"
                  rows={3}
                  spellCheck={false}
                  placeholder="<!doctype html>…"
                  className="input-cyber resize-y font-mono text-[11px] leading-5"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-cyber-text-dim">
              <span className="mb-1.5 block">{t('investigation.customScreenshot')}</span>
              <input
                name="screenshot"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="block w-full rounded-lg border border-cyber-border bg-cyber-black/60 p-2 text-xs text-cyber-text file:mr-3 file:rounded-md file:border-0 file:bg-cyber-cyan/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyber-cyan"
              />
            </label>

            <div className="rounded-lg border border-cyber-border bg-cyber-black/60 p-3 text-xs leading-5 text-cyber-text-dim">
              <div className="flex items-center gap-2 text-cyber-cyan"><Globe2 size={13} /> {t('investigation.serverCapture')}</div>
              <p className="mt-1">{t('investigation.serverCaptureDescription')}</p>
            </div>

            {captureError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{captureError}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" disabled={loading} onClick={() => setShowCapture(false)} className="rounded-lg border border-cyber-border px-4 py-2 text-xs text-cyber-text-dim">{t('investigation.cancel')}</button>
              <button
                type="submit"
                data-minimal="true"
                formNoValidate
                disabled={loading}
                className="rounded-lg border border-cyber-border px-4 py-2 text-xs text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan disabled:opacity-60"
              >
                {t('investigation.saveWithoutContent')}
              </button>
              <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black disabled:opacity-60">
                {loading ? <Loader size={13} className="animate-spin" /> : <Archive size={13} />} {t('investigation.capture')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function CaseCard({ investigationCase, compact, onClick, onEdit, onDelete }: { investigationCase: InvestigationCase; compact: boolean; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className={`group relative rounded-xl border border-cyber-border bg-cyber-panel/60 text-left transition hover:-translate-y-0.5 hover:border-cyber-cyan/50 hover:bg-cyber-panel ${compact ? 'p-4' : 'p-5'}`}><button onClick={onClick} className="block w-full text-left"><div className={`flex items-start justify-between ${compact ? 'mb-4' : 'mb-6'}`}><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan"><Archive size={18} /></div><ChevronRight size={16} className="text-cyber-text-dim transition group-hover:translate-x-1 group-hover:text-cyber-cyan" /></div><h3 className="truncate text-sm font-semibold text-cyber-text">{investigationCase.case_name}</h3><div className="mt-3 space-y-2 text-xs text-cyber-text-dim"><div className="flex items-center gap-2"><UserRound size={12} /> {investigationCase.investigating_officer || 'Officer not assigned'}</div><div className="flex items-center gap-2"><Calendar size={12} /> Updated {formatDate(investigationCase.updated_at)}</div></div></button><div className="mt-4 flex justify-end gap-1 border-t border-cyber-border pt-3"><button onClick={onEdit} className="rounded-md p-1.5 text-cyber-text-dim hover:bg-cyber-cyan/10 hover:text-cyber-cyan" title="Edit case"><Pencil size={13} /></button><button onClick={onDelete} className="rounded-md p-1.5 text-cyber-text-dim hover:bg-red-500/10 hover:text-cyber-red" title="Delete case"><Trash2 size={13} /></button></div></div>;
}

function CaseWorkspace({
  investigationCase,
  artifacts,
  loading,
  search,
  dateFilter,
  onSearch,
  onDateFilter,
  onBack,
  onEdit,
  onCapture,
  onReport,
  onDeleteCase,
  onDeleteArtifact,
  onUpdateArtifactNotes,
  onUpdateArtifactPreview,
  onGenerateArtifactCapture,
  onArtifactAdded,
}: {
  investigationCase: InvestigationCase;
  artifacts: EvidenceArtifact[];
  loading: boolean;
  search: string;
  dateFilter: string;
  onSearch: (value: string) => void;
  onDateFilter: (value: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onCapture: () => void;
  onReport: () => void;
  onDeleteCase: () => void;
  onDeleteArtifact: (id: string) => void;
  onUpdateArtifactNotes: (id: string, notes: string) => void;
  onUpdateArtifactPreview: (id: string, previews: string[]) => void;
  onGenerateArtifactCapture: (artifact: EvidenceArtifact) => void;
  onArtifactAdded: (artifact: EvidenceArtifact) => void;
}) {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const [view, setView] = useState<'evidence' | 'browser' | 'timeline' | 'reader'>('evidence');
  const [packLoading, setPackLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importFailures, setImportFailures] = useState<ImportFailure[]>([]);

  /**
   * Import de fichiers depuis le poste.
   *
   * Traité fichier par fichier : sur un lot de vingt photos, une seule
   * illisible ne doit pas faire perdre les dix-neuf autres. Le compte rendu
   * distingue ce qui est entré de ce qui a été refusé, et pourquoi.
   */
  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportFailures([]);
    const failures: ImportFailure[] = [];
    let added = 0;
    for (const file of Array.from(files)) {
      const { artifact, failure } = await buildArtifactFromFile(investigationCase.id, file);
      if (!artifact) {
        if (failure) failures.push(failure);
        continue;
      }
      if (!(await saveArtifact(artifact))) {
        failures.push({ name: file.name, reason: 'storage' });
        continue;
      }
      onArtifactAdded(artifact);
      added += 1;
    }
    setImporting(false);
    setImportFailures(failures);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (added > 0) toast.success(t('investigation.importDone'), String(added));
    if (failures.length > 0) toast.error(t('investigation.importFailed'), String(failures.length));
  };

  /** Libellés des entités du dossier graphique actif, pour le surlignage. */
  const entityTerms = useStore((state) => {
    const active = state.cases.find((item) => item.id === state.activeCaseId);
    if (!active) return [] as string[];
    return active.nodes
      .map((node) => String((node.data as { label?: unknown })?.label ?? '').trim())
      .filter((label) => label.length >= 3)
      .slice(0, 400);
  });

  const handleExportPack = async () => {
    if (artifacts.length === 0) {
      toast.warning(t('investigation.noArtifacts'));
      return;
    }
    setPackLoading(true);
    try {
      const fileName = await exportEvidencePack({
        investigationCase,
        artifacts,
        translate: t,
        lang,
      });
      toast.success(t('investigation.exportPack'), fileName);
    } catch (cause) {
      console.error('Evidence pack error:', cause);
      toast.error(t('toast.exportFailed'), (cause as Error).message);
    } finally {
      setPackLoading(false);
    }
  };

  return (
    <div className="mt-7">
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-xs text-cyber-text-dim hover:text-cyber-cyan">
        <ArrowLeft size={14} /> {t('investigation.allCases')}
      </button>
      <div className="rounded-xl border border-cyber-border bg-cyber-panel/60 p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.15em] text-cyber-green">
              <CheckCircle2 size={13} /> {t('investigation.activeCase')}
            </div>
            <h2 className="text-xl font-semibold">{investigationCase.case_name}</h2>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-cyber-text-dim">
              {investigationCase.notes || t('investigation.noNotes')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-text"
            >
              <Pencil size={14} /> {t('investigation.edit')}
            </button>
            <button
              onClick={onReport}
              className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-text"
            >
              <Printer size={14} /> {t('investigation.report')}
            </button>
            <button
              onClick={() => void handleExportPack()}
              disabled={packLoading}
              className="flex items-center gap-2 rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-xs font-semibold text-cyber-green transition hover:bg-cyber-green/20 disabled:opacity-60"
            >
              {packLoading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              {t('investigation.exportPack')}
            </button>
            <button
              onClick={onDeleteCase}
              className="flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-cyber-red hover:bg-red-500/10"
            >
              <Trash2 size={14} /> {t('investigation.delete')}
            </button>
            <button
              onClick={onCapture}
              className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-3 py-2 text-xs font-semibold text-cyber-black hover:bg-cyan-300"
            >
              <Plus size={14} /> {t('investigation.captureEvidence')}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-cyber-border pt-5 sm:grid-cols-3">
          <Meta label={t('investigation.officer')} value={investigationCase.investigating_officer || '—'} icon={<UserRound size={13} />} />
          <Meta label={t('investigation.agency')} value={investigationCase.agency || '—'} icon={<ShieldCheck size={13} />} />
          <Meta label={t('investigation.artifacts')} value={loading ? '…' : String(artifacts.length)} icon={<Fingerprint size={13} />} />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2 rounded-lg border border-cyber-border bg-cyber-panel/60 p-1">
        <button
          onClick={() => setView('evidence')}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'evidence' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}
        >
          <Fingerprint size={13} /> {t('investigation.viewEvidence')}
        </button>
        <button
          onClick={() => setView('browser')}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'browser' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}
        >
          <Globe2 size={13} /> {t('investigation.viewBrowser')}
        </button>
        <button
          onClick={() => setView('timeline')}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'timeline' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}
        >
          <Calendar size={13} /> {t('investigation.viewTimeline')}
        </button>
        <button
          onClick={() => setView('reader')}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'reader' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}
        >
          <FileSearch size={13} /> {t('investigation.viewReader')}
        </button>

        {/* Import depuis le poste : photos, captures, HTML sauvegardé, texte. */}
        <div className="ml-auto flex items-center gap-2 pl-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            data-testid="evidence-file-input"
            accept="image/*,.pdf,.html,.htm,.txt,.md,.csv,.json,.xml,.log"
            onChange={(event) => void handleImportFiles(event.target.files)}
          />
          <button
            type="button"
            data-testid="evidence-import-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-md border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyber-cyan transition hover:bg-cyber-cyan/20 disabled:cursor-wait disabled:opacity-60"
          >
            {importing ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
            {importing ? t('investigation.importing') : t('investigation.importFiles')}
          </button>
        </div>
      </div>

      {importFailures.length > 0 && (
        <div className="mt-2 rounded-lg border border-cyber-orange/40 bg-cyber-orange/10 px-3 py-2 text-xs text-cyber-orange" data-testid="evidence-import-failures">
          {t('investigation.importRejected')}{' '}
          {importFailures.map((failure) => `${failure.name} (${failure.reason})`).join(' · ')}
        </div>
      )}

      {view === 'browser' ? (
        <CaseBrowser caseId={investigationCase.id} onArtifactAdded={onArtifactAdded} />
      ) : view === 'timeline' ? (
        <EvidenceTimeline artifacts={artifacts} />
      ) : view === 'reader' ? (
        <EvidenceReader artifacts={artifacts} entityTerms={entityTerms} />
      ) : (
        <>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyber-text-dim" />
            <input
              type="text"
              placeholder={t('investigation.searchPlaceholder')}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="input-cyber h-10 w-full pl-10 text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyber-text-dim" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => onDateFilter(e.target.value)}
              className="input-cyber h-10 w-40 pl-10 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/40 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-cyber-border bg-cyber-dark/50 text-[10px] font-bold uppercase tracking-wider text-cyber-text-dim">
                <th className="px-4 py-3 font-semibold">Evidence</th>
                <th className="px-4 py-3 font-semibold">Target URL</th>
                <th className="px-4 py-3 font-semibold">Integrity Hash</th>
                <th className="px-4 py-3 font-semibold">{t('reliability.title')}</th>
                <th className="px-4 py-3 font-semibold">Captured</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyber-border/30">
              {artifacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-cyber-text-dim">
                    {t('investigation.noArtifacts')}
                  </td>
                </tr>
              ) : (
                artifacts.map((artifact) => (
                  <ArtifactRow
                    key={artifact.id}
                    artifact={artifact}
                    onCaptureModal={onCapture}
                    onDelete={() => onDeleteArtifact(artifact.id)}
                    onUpdateNotes={onUpdateArtifactNotes}
                    onUpdatePreview={onUpdateArtifactPreview}
                    onGenerateCapture={onGenerateArtifactCapture}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

/**
 * Rend le fichier d'origine tel qu'il a été importé.
 *
 * C'est la pièce à présenter si l'authenticité est contestée : l'aperçu
 * affiché peut être une version réduite, l'original non.
 */
async function downloadOriginal(artifact: EvidenceArtifact): Promise<void> {
  const blob = await readOriginal(artifact.id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = String(artifact.browser_metadata?.originalName ?? artifact.title ?? 'original');
  link.rel = 'noopener';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function ArtifactRow({
  artifact,
  onCaptureModal,
  onDelete,
  onUpdateNotes,
  onUpdatePreview,
  onGenerateCapture,
}: {
  artifact: EvidenceArtifact;
  onCaptureModal: () => void;
  onDelete: () => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onUpdatePreview: (id: string, previews: string[]) => void;
  onGenerateCapture: (artifact: EvidenceArtifact) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const reliability = assessReliability(artifact);
  const reliabilityStyle = RELIABILITY_STYLE[reliability.level];
  return (
    <>
      <tr className="group hover:bg-cyber-cyan/5">
        <td className="px-4 py-3">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 text-sm text-cyber-text hover:text-cyber-cyan"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan">
              {/* L'icône suit la nature de la pièce : une photo annoncée par une
                  icône de code se lit mal dans une liste de preuves. */}
              {artifact.artifact_type === 'screenshot' ? <ImageIcon size={14} />
                : artifact.artifact_type === 'text_note' ? <FileText size={14} />
                : <FileCode2 size={14} />}
            </div>
            <span>
              <span className="block font-semibold">{artifact.title || artifactTypeLabel(t, artifact.artifact_type)}</span>
              <span className="block text-xs text-cyber-text-dim">
                {artifactTypeLabel(t, artifact.artifact_type)} · HTTP {artifact.http_status || '—'}
              </span>
            </span>
          </button>
        </td>
        <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-cyber-text-dim" title={artifact.final_url || artifact.target_url}>
          {artifact.final_url || artifact.target_url}
        </td>
        <td className="px-4 py-3">
          <span className="flex max-w-[180px] items-center gap-1.5 truncate font-mono text-xs text-cyber-green" title={artifact.sha512}>
            <Hash size={12} /> {artifact.sha512.slice(0, 18)}…
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${reliabilityStyle.border} ${reliabilityStyle.bg} ${reliabilityStyle.text}`}
            title={reliability.checks
              .map((check) => `${check.applicable === false ? 'n/a' : check.ok ? 'OK' : '—'} ${t(check.labelKey)}`)
              .join('\n')}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${reliabilityStyle.dot}`} />
            {t(RELIABILITY_LABEL_KEY[reliability.level])} · {reliability.score}%
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-cyber-text-dim">{formatDate(artifact.captured_at)}</td>
        <td className="px-4 py-3 text-right">
          {artifact.has_original && (
            <button
              onClick={() => void downloadOriginal(artifact)}
              className="rounded-md p-1.5 text-cyber-text-dim opacity-0 transition group-hover:opacity-100 hover:bg-cyber-cyan/10 hover:text-cyber-cyan"
              title={t('investigation.downloadOriginal')}
            >
              <Download size={14} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-cyber-text-dim opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-cyber-red"
            title="Delete artifact"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-cyber-black/40 p-4">
            <ArtifactDetail
              artifact={artifact}
              onCaptureModal={onCaptureModal}
              onUpdateNotes={onUpdateNotes}
              onUpdatePreview={onUpdatePreview}
              onGenerateCapture={onGenerateCapture}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ArtifactDetail({
  artifact,
  onCaptureModal,
  onUpdateNotes,
  onUpdatePreview,
  onGenerateCapture,
}: {
  artifact: EvidenceArtifact;
  onCaptureModal: () => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onUpdatePreview: (id: string, previews: string[]) => void;
  onGenerateCapture: (artifact: EvidenceArtifact) => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'preview' | 'text' | 'html' | 'links' | 'metadata'>('preview');
  const [imageIndex, setImageIndex] = useState(0);
  const [notes, setNotes] = useState(artifact.notes);
  const [imageFailed, setImageFailed] = useState(false);
  const [htmlPreviewFailed, setHtmlPreviewFailed] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [textFilter, setTextFilter] = useState('');
  const [previewView, setPreviewView] = useState<'page' | 'image'>('page');
  const [imageFit, setImageFit] = useState<'width' | 'contain'>('width');

  useEffect(() => {
    setTab('preview');
    setImageIndex(0);
    setNotes(artifact.notes);
    setImageFailed(false);
    setHtmlPreviewFailed(false);
    setTextFilter('');
    setImageFit('width');
    setPreviewView(artifactImages(artifact).length > 0 && !isHtmlContent(artifact.raw_html, artifact.content_type) ? 'image' : 'page');
  }, [artifact.id, artifact.raw_html]);

  const extractedText = artifact.extracted_text ?? [];
  const filteredText = useMemo(() => {
    const needle = textFilter.trim().toLowerCase();
    if (!needle) return extractedText;
    return extractedText.filter((line) => line.toLowerCase().includes(needle));
  }, [extractedText, textFilter]);

  const images = artifactImages(artifact);
  const clampedIndex = Math.min(imageIndex, Math.max(0, images.length - 1));
  const activeImage = images[clampedIndex] ?? '';

  useEffect(() => {
    setImageFailed(false);
  }, [activeImage]);

  const isHtml = isHtmlContent(artifact.raw_html, artifact.content_type);
  const safeHtml = useMemo(
    () => sanitizePreviewHtml(artifact.raw_html, artifact.final_url || artifact.target_url),
    [artifact.raw_html, artifact.final_url, artifact.target_url]
  );
  const rawFormatted = useMemo(() => formatRawContent(artifact.raw_html, artifact.content_type), [artifact.raw_html, artifact.content_type]);
  const protectedTarget = isProtectedTarget(artifact.final_url || artifact.target_url);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-cyber-border p-0.5">
          {(['preview', 'text', 'html', 'links', 'metadata'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                tab === item ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              {item === 'links'
                ? t('investigation.linksTab')
                : item === 'text'
                  ? `${t('browser.tabText')}${extractedText.length ? ` (${extractedText.length})` : ''}`
                  : item}
            </button>
          ))}
        </div>
                <button
                  onClick={onCaptureModal}
                  className="flex items-center gap-1.5 rounded-lg bg-cyber-cyan px-3 py-2 text-xs font-semibold text-cyber-black hover:bg-cyan-300"
                >
                  <Plus size={13} /> {t('investigation.captureEvidence')}
                </button>
                <button
                  onClick={() => {
                    setCaptureLoading(true);
                    void Promise.resolve(onGenerateCapture(artifact)).finally(() => setCaptureLoading(false));
                  }}
                  disabled={captureLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-2 text-xs font-semibold text-cyber-cyan transition hover:bg-cyber-cyan/20 disabled:opacity-60"
                >
                  {captureLoading ? <Loader size={13} className="animate-spin" /> : <RotateCw size={13} />} {t('investigation.retryCapture')}
                </button>
                <a
                  href={artifact.final_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-cyber-text-dim hover:text-cyber-cyan"
                >
                  <ExternalLink size={12} /> {t('investigation.openTarget')}
                </a>
              </div>

      <div className="mb-4 grid gap-2 rounded-lg border border-cyber-border bg-cyber-dark/80 p-3 text-sm sm:grid-cols-3">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">HTTP status</span>
          <strong className="mt-1 block font-mono text-cyber-green">{artifact.http_status || '—'}</strong>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">Content type</span>
          <strong className="mt-1 block break-words font-mono text-cyber-text">{artifact.content_type || '—'}</strong>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">Target</span>
          <strong className="mt-1 block break-all font-mono text-cyber-text">{artifact.final_url || artifact.target_url}</strong>
        </div>
      </div>

      {tab === 'metadata' && artifact.browser_metadata && Object.entries(artifact.browser_metadata).length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(artifact.browser_metadata).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-cyber-border bg-cyber-dark/40 p-3">
              <span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">{key}</span>
              <span className="mt-1 block truncate font-mono text-xs text-cyber-text" title={String(value)}>
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'preview' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Visionneuse principale : occupe toute la place disponible ── */}
          <div className="flex min-h-[480px] flex-col overflow-hidden rounded-lg border border-cyber-border bg-[var(--cyber-black)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-cyber-border bg-cyber-dark px-3 py-2">
              <div className="flex rounded-md border border-cyber-border p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewView('page')}
                  disabled={!isHtml && !rawFormatted}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition disabled:opacity-40 ${previewView === 'page' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}
                >
                  {t('investigation.previewPage')}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewView('image')}
                  disabled={images.length === 0}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition disabled:opacity-40 ${previewView === 'image' ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}
                >
                  {t('investigation.previewImage')}{images.length > 0 ? ` (${images.length})` : ''}
                </button>
              </div>

              {previewView === 'image' && activeImage && (
                <button
                  type="button"
                  onClick={() => setImageFit((current) => (current === 'width' ? 'contain' : 'width'))}
                  className="rounded-md border border-cyber-border px-2.5 py-1 text-[11px] font-semibold text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                >
                  {imageFit === 'width' ? t('investigation.fitContain') : t('investigation.fitWidth')}
                </button>
              )}

              <span className="ml-auto truncate font-mono text-[10px] text-cyber-text-dim">
                {previewView === 'image'
                  ? `${activeImage ? t('investigation.previewImage') : '—'} · ${clampedIndex + 1}/${images.length || 0}`
                  : `${artifact.content_type || t('investigation.rawContent')} · ${artifact.raw_html.length.toLocaleString('fr-FR')} ${t('investigation.characters')}`}
              </span>

              {previewView === 'image' && activeImage && (
                <button
                  type="button"
                  onClick={() => {
                    const nextImages = images.filter((_, index) => index !== clampedIndex);
                    setImageIndex(nextImages.length === 0 ? 0 : Math.min(clampedIndex, nextImages.length - 1));
                    setImageFailed(false);
                    onUpdatePreview(artifact.id, nextImages);
                    if (nextImages.length === 0) setPreviewView('page');
                  }}
                  className="flex items-center gap-1 rounded-md border border-red-400/40 px-2 py-1 text-[11px] font-semibold text-cyber-red transition hover:bg-red-500/20"
                  title={t('investigation.removeImage')}
                >
                  <Trash2 size={12} /> {t('investigation.removeImage')}
                </button>
              )}
            </div>

            <div className="relative flex-1 overflow-auto bg-[var(--cyber-black)]">
              {previewView === 'image' && activeImage && !imageFailed ? (
                <img
                  src={safeImageSource(activeImage)}
                  alt={`${t('investigation.previewAlt')} ${clampedIndex + 1}`}
                  onError={() => setImageFailed(true)}
                  className={imageFit === 'width' ? 'block h-auto w-full' : 'absolute inset-0 h-full w-full object-contain'}
                />
              ) : previewView === 'image' ? (
                <div className="flex h-full min-h-[440px] w-full flex-col items-center justify-center gap-3 p-8 text-center">
                  <FileText size={28} className="text-cyber-border" />
                  <p className="text-sm text-cyber-text-dim">
                    {imageFailed ? t('investigation.previewError') : t('investigation.noPreview')}
                  </p>
                </div>
              ) : protectedTarget && !isHtml ? (
                <DomSnapshotCard artifact={artifact} />
              ) : isHtml && !htmlPreviewFailed ? (
                <PreviewErrorBoundary fallback={<DomSnapshotCard artifact={artifact} />}>
                  <iframe
                    title="Captured page preview"
                    sandbox="allow-same-origin"
                    srcDoc={safeHtml}
                    onLoad={(event) => {
                      const body = event.currentTarget.contentDocument?.body;
                      if (body && !body.textContent?.trim() && body.children.length === 0) setHtmlPreviewFailed(true);
                    }}
                    className="h-full min-h-[480px] w-full bg-white"
                  />
                </PreviewErrorBoundary>
              ) : (
                <pre className="min-h-[480px] w-full whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-6 text-slate-100">
                  {rawFormatted || t('investigation.noHtml')}
                </pre>
              )}

              {previewView === 'image' && images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setImageIndex((current) => (current - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-cyber-border bg-cyber-black/90 text-lg text-cyber-text shadow-lg hover:border-cyber-cyan hover:text-cyber-cyan"
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageIndex((current) => (current + 1) % images.length)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-cyber-border bg-cyber-black/90 text-lg text-cyber-text shadow-lg hover:border-cyber-cyan hover:text-cyber-cyan"
                    aria-label="Next image"
                  >
                    ›
                  </button>
                  <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-cyber-black/90 px-2.5 py-1 text-[11px] font-mono text-cyber-text">
                    {clampedIndex + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ── Colonne latérale compacte : vignettes, import, empreinte ── */}
          <div className="space-y-3">
            <div className="rounded-lg border border-cyber-border bg-cyber-dark p-3">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black transition hover:bg-cyan-300">
                <Plus size={13} />
                {t('investigation.attachImage')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      onUpdatePreview(artifact.id, [dataUrl, ...images]);
                      setImageIndex(0);
                      setImageFailed(false);
                      setPreviewView('image');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {images.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {images.map((image, index) => (
                    <button
                      key={`${index}-${image.slice(-24)}`}
                      type="button"
                      onClick={() => { setImageIndex(index); setImageFailed(false); setPreviewView('image'); }}
                      className={`overflow-hidden rounded-md border transition ${index === clampedIndex && previewView === 'image' ? 'border-cyber-cyan' : 'border-cyber-border hover:border-cyber-cyan/50'}`}
                    >
                      <img src={safeImageSource(image)} alt="" className="h-16 w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-cyber-border bg-cyber-dark p-4 text-sm text-cyber-text">
              <p className="mb-2 text-xs font-semibold text-cyber-green">SHA-512 VERIFIED RECORD</p>
              <p className="break-all font-mono text-xs leading-5">{artifact.sha512}</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'text' && (
        <div className="overflow-hidden rounded-lg border border-cyber-border bg-[var(--cyber-black)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-cyber-border bg-cyber-dark px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyber-cyan">
              {t('browser.textExtracted')} · {filteredText.length}/{extractedText.length}
            </span>
            <div className="relative ml-auto min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyber-text-dim" />
              <input
                value={textFilter}
                onChange={(event) => setTextFilter(event.target.value)}
                placeholder={t('browser.searchInPage')}
                className="input-cyber h-8 w-full pl-8 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(filteredText.join('\n'))}
              className="flex items-center gap-1.5 rounded-md border border-cyber-border px-2.5 py-1 text-[11px] text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
            >
              <Clipboard size={12} /> {t('browser.copyText')}
            </button>
          </div>
          {filteredText.length === 0 ? (
            <div className="p-8 text-center text-sm text-cyber-text-dim">{t('browser.noText')}</div>
          ) : (
            <ol className="max-h-[460px] divide-y divide-cyber-border/30 overflow-auto">
              {filteredText.map((line, index) => (
                <li key={`${index}-${line.slice(0, 24)}`} className="flex gap-3 px-4 py-2 hover:bg-cyber-cyan/5">
                  <span className="w-10 shrink-0 select-none text-right font-mono text-[10px] text-cyber-text-dim">{index + 1}</span>
                  <span className="break-words text-[13px] leading-6 text-cyber-text">{line}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === 'html' && (
        <div className="overflow-hidden rounded-lg border border-cyber-border bg-[var(--cyber-black)]">
          <div className="border-b border-cyber-border bg-cyber-dark px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-cyan">
            HTML source · {artifact.raw_html.length.toLocaleString('fr-FR')} characters
          </div>
          <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-6 text-slate-100">
            {artifact.raw_html}
          </pre>
        </div>
      )}

      {tab === 'links' && (
        <div className="overflow-hidden rounded-lg border border-cyber-border bg-[var(--cyber-black)]">
          <div className="border-b border-cyber-border bg-cyber-dark px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-cyan">
            {t('investigation.linksTab')} · {artifact.extracted_links.length}
          </div>
          {artifact.extracted_links.length === 0 ? (
            <div className="p-8 text-center text-sm text-cyber-text-dim">{t('investigation.noLinks')}</div>
          ) : (
            <ul className="max-h-[460px] divide-y divide-cyber-border/50 overflow-auto">
              {artifact.extracted_links.map((link) => (
                <li key={link} className="px-4 py-2.5">
                  <a href={link} target="_blank" rel="noopener noreferrer" className="block break-all font-mono text-xs text-cyber-cyan hover:underline">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 border-t border-cyber-border pt-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="text-xs font-semibold text-cyber-text-dim">
          <span className="mb-1.5 block">{t('investigation.contextNotes')}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => onUpdateNotes(artifact.id, notes)}
            rows={3}
            placeholder={t('investigation.contextNotesPlaceholder')}
            className="input-cyber resize-y text-sm leading-6"
          />
        </label>
        <button
          onClick={() => onUpdateNotes(artifact.id, notes)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-2 text-xs font-semibold text-cyber-cyan"
        >
          <Clipboard size={13} /> {t('investigation.saveNote')}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-cyber-text-dim">
        <span className="flex items-center gap-1">
          <Timer size={12} /> {formatDate(artifact.captured_at)}
        </span>
        <span className="flex items-center gap-1">
          <Globe2 size={12} /> {artifact.extracted_links.length} {t('investigation.linksExtracted')}
        </span>
        <span className="flex items-center gap-1">
          <Clipboard size={12} /> {artifact.raw_html.length.toLocaleString('fr-FR')} {t('investigation.characters')}
        </span>
      </div>
    </div>
  );
}

function DomSnapshotCard({ artifact }: { artifact: EvidenceArtifact }) {
  return (
    <div className="flex h-[460px] flex-col items-center justify-center bg-[var(--cyber-black)] p-6 text-center">
      <FileText size={32} className="mb-3 text-cyber-cyan" />
      <h3 className="text-sm font-semibold text-cyber-text">{artifact.title || 'Protected Target'}</h3>
      <p className="mt-1 font-mono text-xs text-cyber-text-dim">{artifact.final_url || artifact.target_url}</p>
      <span className="mt-4 rounded-md border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-1 text-xs text-cyber-cyan">
        Aperçu visuel indisponible (Protection anti-bot)
      </span>
    </div>
  );
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
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-4 pb-[104px] pt-6 backdrop-blur-sm"><div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-cyber-border bg-cyber-dark shadow-2xl"><div className="flex items-center justify-between border-b border-cyber-border px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2><button onClick={onClose} className="text-cyber-text-dim hover:text-cyber-text"><X size={16} /></button></div><div className="custom-scrollbar overflow-y-auto p-5">{children}</div></div></div>; }
function LoadingState({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 p-12 text-sm text-cyber-text-dim"><Loader size={15} className="animate-spin text-cyber-cyan" /> {label}</div>; }
function EmptyCases({ onCreate }: { onCreate: () => void }) { const { t } = useLanguage(); return <div className="rounded-xl border border-dashed border-cyber-border p-16 text-center"><Archive size={32} className="mx-auto mb-4 text-cyber-border" /><h3 className="text-sm font-semibold">{t('investigation.emptyTitle')}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-cyber-text-dim">{t('investigation.emptyDescription')}</p><button onClick={onCreate} className="mt-5 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black">{t('investigation.createFirst')}</button></div>; }