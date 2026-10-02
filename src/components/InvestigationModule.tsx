import { useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowLeft, Calendar, CheckCircle2, ChevronRight, Clipboard,
  ExternalLink, FileCode2, FileText, Filter, Fingerprint,
  Globe2, Hash, Loader, Plus, Printer, Search, ShieldCheck, Timer, UserRound,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { CaptureResponse, EvidenceArtifact, EvidenceArtifactType, InvestigationCase } from '../types/investigation';

const CAPTURE_FUNCTION_URL = 'https://placeholder.supabase.co/functions/v1/capture-evidence';
const typeLabels: Record<EvidenceArtifactType, string> = {
  screenshot: 'Screenshot',
  downloaded_page: 'Page téléchargée',
  extracted_link: 'Liens extraits',
  text_note: 'Note',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeSvg(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] || character));
}

function createPreviewDataUrl(capture: CaptureResponse, capturedAt: string): string {
  const host = new URL(capture.finalUrl).hostname;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#0d1321"/><rect x="28" y="28" width="1144" height="54" rx="8" fill="#111827" stroke="#1e3a5f"/><circle cx="56" cy="55" r="9" fill="#10b981"/><text x="82" y="62" fill="#e2e8f0" font-family="monospace" font-size="20">${escapeSvg(host)}</text><text x="46" y="150" fill="#00f0ff" font-family="monospace" font-size="28">FULL-PAGE EVIDENCE PREVIEW</text><text x="46" y="208" fill="#e2e8f0" font-family="sans-serif" font-size="30">${escapeSvg(capture.title || host)}</text><text x="46" y="258" fill="#94a3b8" font-family="monospace" font-size="18">Captured ${escapeSvg(formatDate(capturedAt))}</text><rect x="46" y="318" width="1108" height="2" fill="#1e3a5f"/><text x="46" y="380" fill="#94a3b8" font-family="monospace" font-size="18">HTTP ${capture.status}  •  ${escapeSvg(capture.contentType || 'unknown content type')}</text><text x="46" y="435" fill="#94a3b8" font-family="monospace" font-size="18">${capture.links.length} links extracted  •  ${capture.html.length.toLocaleString('fr-FR')} bytes</text><rect x="46" y="500" width="310" height="48" rx="7" fill="#00f0ff" fill-opacity=".12" stroke="#00f0ff" stroke-opacity=".45"/><text x="70" y="531" fill="#00f0ff" font-family="monospace" font-size="17">CHAIN OF CUSTODY READY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function sanitizePreviewHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, iframe, object, embed, form, base').forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
    }
  });
  return document.documentElement.outerHTML;
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

interface Props {
  onClose: () => void;
}

export default function InvestigationModule({ onClose }: Props) {
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<InvestigationCase | null>(null);
  const [artifacts, setArtifacts] = useState<EvidenceArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const loadCases = async () => {
    const { data, error: queryError } = await supabase.from('investigation_cases').select('*').order('updated_at', { ascending: false });
    if (queryError) {
      setError('Impossible de charger les dossiers d’enquête.');
      console.error(queryError);
      return;
    }
    setCases((data || []) as InvestigationCase[]);
    if (selectedCase) {
      const refreshed = (data || []).find((item) => item.id === selectedCase.id) as InvestigationCase | undefined;
      if (refreshed) setSelectedCase(refreshed);
    }
  };

  const loadArtifacts = async (caseId: string) => {
    const { data, error: queryError } = await supabase.from('evidence_artifacts').select('*').eq('case_id', caseId).order('captured_at', { ascending: false });
    if (queryError) {
      setError('Impossible de charger les éléments de preuve.');
      console.error(queryError);
      return;
    }
    setArtifacts((data || []) as EvidenceArtifact[]);
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

  const handleCreateCase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      case_name: String(form.get('case_name') || '').trim(),
      investigating_officer: String(form.get('investigating_officer') || '').trim(),
      agency: String(form.get('agency') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
    };
    if (!payload.case_name) return;
    const { data, error: insertError } = await supabase.from('investigation_cases').insert(payload).select().maybeSingle();
    if (insertError || !data) {
      setError('Le dossier n’a pas pu être créé.');
      console.error(insertError);
      return;
    }
    setCases((current) => [data as InvestigationCase, ...current]);
    setSelectedCase(data as InvestigationCase);
    setArtifacts([]);
    setShowCreate(false);
  };

  const handleCapture = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase) return;
    const form = new FormData(event.currentTarget);
    const targetUrl = String(form.get('target_url') || '').trim();
    const notes = String(form.get('notes') || '').trim();
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
      const preview = createPreviewDataUrl(payload, capturedAt);
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
      const records = [
        { ...sharedEvidence, artifact_type: 'downloaded_page', title: payload.title, raw_html: payload.html, screenshot_preview: preview, extracted_links: payload.links, notes },
        { ...sharedEvidence, artifact_type: 'screenshot', title: payload.title || 'Full-page capture preview', raw_html: '', screenshot_preview: preview, extracted_links: [], notes: 'Visual preview generated from the captured page.' },
        { ...sharedEvidence, artifact_type: 'extracted_link', title: `${payload.links.length} extracted links`, raw_html: '', screenshot_preview: preview, extracted_links: payload.links, notes: '' },
        ...(notes ? [{ ...sharedEvidence, artifact_type: 'text_note', title: 'Capture note', raw_html: '', screenshot_preview: preview, extracted_links: [], notes }] : []),
      ];
      const { data, error: insertError } = await supabase.from('evidence_artifacts').insert(records).select();
      if (insertError || !data) throw new Error('Storage failed');
      setArtifacts((current) => [...(data as EvidenceArtifact[]), ...current]);
      setShowCapture(false);
    } catch (cause) {
      setError('La capture a échoué. Vérifiez l’URL et réessayez.');
      console.error(cause);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteArtifact = async (artifactId: string) => {
    const { error: deleteError } = await supabase.from('evidence_artifacts').delete().eq('id', artifactId);
    if (deleteError) {
      setError('L’élément n’a pas pu être supprimé.');
      console.error(deleteError);
      return;
    }
    setArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
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
              <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-cyber-cyan"><ShieldCheck size={14} /> Evidence operations</div>
              <h1 className="text-2xl font-semibold tracking-tight text-cyber-text">Investigation cases</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-cyber-text-dim">Collect, verify and organise web evidence with a timestamped chain of custody.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-text"><ArrowLeft size={14} /> Back to tracker</button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-2 text-xs font-semibold text-cyber-cyan transition hover:bg-cyber-cyan/20"><Plus size={14} /> New investigation</button>
            </div>
          </header>

          {error && <div className="mt-5 flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300"><span>{error}</span><button onClick={() => setError('')}><X size={14} /></button></div>}

          {!selectedCase ? (
            <div className="mt-7">
              <div className="mb-4 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyber-text-dim">Active workspace</h2><span className="font-mono text-[11px] text-cyber-text-dim">{cases.length} dossier{cases.length === 1 ? '' : 's'}</span></div>
              {loading ? <LoadingState /> : cases.length === 0 ? <EmptyCases onCreate={() => setShowCreate(true)} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cases.map((investigationCase) => <CaseCard key={investigationCase.id} investigationCase={investigationCase} onClick={() => void handleSelectCase(investigationCase)} />)}</div>}
            </div>
          ) : (
            <CaseWorkspace investigationCase={selectedCase} artifacts={filteredArtifacts} loading={loading} search={search} dateFilter={dateFilter} onSearch={setSearch} onDateFilter={setDateFilter} onBack={() => setSelectedCase(null)} onCapture={() => setShowCapture(true)} onReport={() => setShowReport(true)} onDeleteArtifact={(id) => void handleDeleteArtifact(id)} />
          )}
        </div>
      </div>

      {showCreate && <Modal title="Create investigation case" onClose={() => setShowCreate(false)}><form onSubmit={handleCreateCase} className="space-y-4"><Field label="Case name" name="case_name" placeholder="Operation Northstar" required /><div className="grid gap-4 sm:grid-cols-2"><Field label="Investigating officer" name="investigating_officer" placeholder="Name / badge" /><Field label="Agency" name="agency" placeholder="Organisation" /></div><Field label="Notes" name="notes" placeholder="Scope, legal authority, working notes..." textarea /><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-cyber-border px-4 py-2 text-xs text-cyber-text-dim">Cancel</button><button type="submit" className="rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black">Create case</button></div></form></Modal>}
      {showCapture && <Modal title="Capture web evidence" onClose={() => !loading && setShowCapture(false)}><form onSubmit={handleCapture} className="space-y-4"><Field label="Target URL" name="target_url" type="url" placeholder="https://example.org/page" required /><Field label="Capture note" name="notes" placeholder="Context or observation..." textarea /><div className="rounded-lg border border-cyber-border bg-cyber-black/60 p-3 text-[11px] leading-5 text-cyber-text-dim"><div className="flex items-center gap-2 text-cyber-cyan"><Globe2 size={13} /> Server-side capture enabled</div><p className="mt-1">The page HTML, redirects, HTTP status, extracted links, timestamp and SHA-512 digest will be preserved together.</p></div><div className="flex justify-end gap-2 pt-2"><button type="button" disabled={loading} onClick={() => setShowCapture(false)} className="rounded-lg border border-cyber-border px-4 py-2 text-xs text-cyber-text-dim">Cancel</button><button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black disabled:opacity-60">{loading ? <Loader size={13} className="animate-spin" /> : <Archive size={13} />} Capture evidence</button></div></form></Modal>}
    </section>
  );
}

function CaseCard({ investigationCase, onClick }: { investigationCase: InvestigationCase; onClick: () => void }) {
  return <button onClick={onClick} className="group rounded-xl border border-cyber-border bg-cyber-panel/60 p-5 text-left transition hover:-translate-y-0.5 hover:border-cyber-cyan/50 hover:bg-cyber-panel"><div className="mb-6 flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan"><Archive size={18} /></div><ChevronRight size={16} className="text-cyber-text-dim transition group-hover:translate-x-1 group-hover:text-cyber-cyan" /></div><h3 className="truncate text-sm font-semibold text-cyber-text">{investigationCase.case_name}</h3><div className="mt-3 space-y-2 text-[11px] text-cyber-text-dim"><div className="flex items-center gap-2"><UserRound size={12} /> {investigationCase.investigating_officer || 'Officer not assigned'}</div><div className="flex items-center gap-2"><Calendar size={12} /> Updated {formatDate(investigationCase.updated_at)}</div></div></button>;
}

function CaseWorkspace({ investigationCase, artifacts, loading, search, dateFilter, onSearch, onDateFilter, onBack, onCapture, onReport, onDeleteArtifact }: { investigationCase: InvestigationCase; artifacts: EvidenceArtifact[]; loading: boolean; search: string; dateFilter: string; onSearch: (value: string) => void; onDateFilter: (value: string) => void; onBack: () => void; onCapture: () => void; onReport: () => void; onDeleteArtifact: (id: string) => void }) {
  return <div className="mt-7"><button onClick={onBack} className="mb-4 flex items-center gap-2 text-xs text-cyber-text-dim hover:text-cyber-cyan"><ArrowLeft size={14} /> All investigations</button><div className="rounded-xl border border-cyber-border bg-cyber-panel/60 p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.15em] text-cyber-green"><CheckCircle2 size={13} /> Case active</div><h2 className="text-xl font-semibold">{investigationCase.case_name}</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-cyber-text-dim">{investigationCase.notes || 'No case notes added.'}</p></div><div className="flex gap-2"><button onClick={onReport} className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim hover:border-cyber-cyan/50 hover:text-cyber-text"><Printer size={14} /> Report view</button><button onClick={onCapture} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-3 py-2 text-xs font-semibold text-cyber-black hover:bg-cyan-300"><Archive size={14} /> Capture evidence</button></div></div><div className="mt-5 grid gap-3 border-t border-cyber-border pt-5 sm:grid-cols-3"><Meta label="Officer" value={investigationCase.investigating_officer || '—'} icon={<UserRound size={13} />} /><Meta label="Agency" value={investigationCase.agency || '—'} icon={<ShieldCheck size={13} />} /><Meta label="Evidence artifacts" value={String(artifacts.length)} icon={<Fingerprint size={13} />} /></div></div><div className="mt-5 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-dim" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter URL, title, hash or notes..." className="input-cyber h-9 pl-9" /></div><div className="relative"><Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-dim" /><input type="date" value={dateFilter} onChange={(event) => onDateFilter(event.target.value)} className="input-cyber h-9 pl-9" /></div></div><div className="mt-4 overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/50">{loading ? <LoadingState /> : artifacts.length === 0 ? <div className="p-12 text-center"><FileText size={28} className="mx-auto mb-3 text-cyber-border" /><p className="text-sm text-cyber-text-dim">No evidence captured yet.</p><button onClick={onCapture} className="mt-4 text-xs text-cyber-cyan hover:underline">Capture the first item</button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-cyber-border bg-cyber-dark/60 text-[10px] uppercase tracking-wider text-cyber-text-dim"><tr><th className="px-4 py-3">Artifact</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Integrity</th><th className="px-4 py-3">Captured</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-cyber-border/70">{artifacts.map((artifact) => <ArtifactRow key={artifact.id} artifact={artifact} onDelete={() => onDeleteArtifact(artifact.id)} />)}</tbody></table></div>}</div></div>;
}

function ArtifactRow({ artifact, onDelete }: { artifact: EvidenceArtifact; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return <><tr className="group hover:bg-cyber-cyan/5"><td className="px-4 py-3"><button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-xs text-cyber-text hover:text-cyber-cyan"><div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan"><FileCode2 size={13} /></div><span><span className="block font-semibold">{artifact.title || typeLabels[artifact.artifact_type]}</span><span className="block text-[10px] text-cyber-text-dim">{typeLabels[artifact.artifact_type]} · HTTP {artifact.http_status || '—'}</span></span></button></td><td className="max-w-[280px] truncate px-4 py-3 font-mono text-[11px] text-cyber-text-dim" title={artifact.final_url || artifact.target_url}>{artifact.final_url || artifact.target_url}</td><td className="px-4 py-3"><span className="flex max-w-[180px] items-center gap-1.5 truncate font-mono text-[10px] text-cyber-green" title={artifact.sha512}><Hash size={12} /> {artifact.sha512.slice(0, 18)}…</span></td><td className="whitespace-nowrap px-4 py-3 text-[11px] text-cyber-text-dim">{formatDate(artifact.captured_at)}</td><td className="px-4 py-3 text-right"><button onClick={onDelete} className="text-[10px] text-cyber-text-dim opacity-0 transition group-hover:opacity-100 hover:text-red-400">Delete</button></td></tr>{open && <tr><td colSpan={5} className="bg-cyber-black/40 p-4"><ArtifactDetail artifact={artifact} /></td></tr>}</>;
}

function ArtifactDetail({ artifact }: { artifact: EvidenceArtifact }) {
  const [tab, setTab] = useState<'preview' | 'html' | 'metadata'>('preview');
  const safeHtml = useMemo(() => sanitizePreviewHtml(artifact.raw_html), [artifact.raw_html]);
  return <div><div className="mb-3 flex flex-wrap items-center gap-2">{(['preview', 'html', 'metadata'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${tab === item ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'}`}>{item}</button>)}<a href={artifact.final_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[10px] text-cyber-text-dim hover:text-cyber-cyan"><ExternalLink size={12} /> Open target</a></div>{tab === 'preview' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]"><div className="overflow-hidden rounded-lg border border-cyber-border bg-white"><iframe title="Captured page preview" sandbox="" srcDoc={safeHtml} className="h-[420px] w-full" /></div><div className="space-y-3"><img src={artifact.screenshot_preview} alt="Evidence capture preview" className="w-full rounded-lg border border-cyber-border" /><div className="rounded-lg border border-cyber-border bg-cyber-dark p-3 text-[10px] text-cyber-text-dim"><p className="mb-2 font-semibold text-cyber-green">SHA-512 VERIFIED RECORD</p><p className="break-all font-mono leading-4">{artifact.sha512}</p></div></div></div>}{tab === 'html' && <pre className="max-h-[430px] overflow-auto rounded-lg border border-cyber-border bg-cyber-black p-4 text-[10px] leading-5 text-cyber-text-dim">{artifact.raw_html}</pre>}{tab === 'metadata' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(artifact.browser_metadata).map(([key, value]) => <div key={key} className="rounded-lg border border-cyber-border bg-cyber-black/60 p-3"><div className="text-[10px] uppercase tracking-wider text-cyber-text-dim">{key}</div><div className="mt-2 break-words font-mono text-xs text-cyber-text">{String(value)}</div></div>)}</div>}<div className="mt-4 flex flex-wrap items-center gap-4 border-t border-cyber-border pt-3 text-[10px] text-cyber-text-dim"><span className="flex items-center gap-1"><Timer size={12} /> {formatDate(artifact.captured_at)}</span><span className="flex items-center gap-1"><Globe2 size={12} /> {artifact.extracted_links.length} links extracted</span><span className="flex items-center gap-1"><Clipboard size={12} /> {artifact.raw_html.length.toLocaleString('fr-FR')} characters</span></div></div>;
}

function InvestigationReport({ investigationCase, artifacts, onBack }: { investigationCase: InvestigationCase; artifacts: EvidenceArtifact[]; onBack: () => void }) {
  return <section className="flex-1 min-h-0 overflow-y-auto bg-cyber-black p-6 text-cyber-text print:bg-white print:p-10 print:text-black"><div className="mx-auto max-w-[1100px]"><div className="mb-8 flex items-center justify-between print:hidden"><button onClick={onBack} className="flex items-center gap-2 text-xs text-cyber-text-dim hover:text-cyber-cyan"><ArrowLeft size={14} /> Back to case</button><button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-3 py-2 text-xs font-semibold text-cyber-black"><Printer size={14} /> Print / save PDF</button></div><div className="border-b border-cyber-border pb-6 print:border-black"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyber-cyan print:text-black">Ghostint · Evidence report</p><h1 className="mt-3 text-3xl font-semibold">{investigationCase.case_name}</h1><div className="mt-5 grid gap-4 text-xs sm:grid-cols-3"><Meta label="Officer" value={investigationCase.investigating_officer || '—'} icon={<UserRound size={13} />} /><Meta label="Agency" value={investigationCase.agency || '—'} icon={<ShieldCheck size={13} />} /><Meta label="Captured artifacts" value={String(artifacts.length)} icon={<Fingerprint size={13} />} /></div></div><p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-cyber-text-dim print:text-gray-700">{investigationCase.notes}</p><div className="mt-8 space-y-5">{artifacts.map((artifact, index) => <article key={artifact.id} className="break-inside-avoid rounded-xl border border-cyber-border bg-cyber-panel/50 p-5 print:border-gray-300 print:bg-white"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-wider text-cyber-cyan print:text-gray-600">Evidence {String(index + 1).padStart(2, '0')} · {typeLabels[artifact.artifact_type]}</div><h2 className="mt-2 text-sm font-semibold">{artifact.title || artifact.final_url}</h2></div><span className="whitespace-nowrap text-[10px] text-cyber-text-dim print:text-gray-600">{formatDate(artifact.captured_at)}</span></div><p className="mt-3 break-all font-mono text-[10px] text-cyber-text-dim print:text-gray-600">{artifact.final_url}</p><div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]"><img src={artifact.screenshot_preview} alt="Evidence preview" className="w-full rounded border border-cyber-border print:border-gray-300" /><div><div className="mb-2 text-[10px] uppercase tracking-wider text-cyber-text-dim print:text-gray-600">SHA-512 integrity digest</div><p className="break-all font-mono text-[10px] leading-5 text-cyber-green print:text-gray-700">{artifact.sha512}</p><div className="mt-4 text-[10px] text-cyber-text-dim print:text-gray-600">HTTP {artifact.http_status || '—'} · {artifact.extracted_links.length} links · {artifact.raw_html.length.toLocaleString('fr-FR')} HTML characters</div></div></div></article>)}</div></div></section>;
}

function Meta({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="flex items-center gap-2 text-xs"><span className="text-cyber-cyan">{icon}</span><span><span className="block text-[10px] uppercase tracking-wider text-cyber-text-dim">{label}</span><span className="block truncate font-medium text-cyber-text">{value}</span></span></div>; }
function Field({ label, name, placeholder, type = 'text', required = false, textarea = false }: { label: string; name: string; placeholder: string; type?: string; required?: boolean; textarea?: boolean }) { return <label className="block text-xs font-medium text-cyber-text-dim"><span className="mb-1.5 block">{label}</span>{textarea ? <textarea name={name} placeholder={placeholder} required={required} rows={4} className="input-cyber resize-none" /> : <input name={name} type={type} placeholder={placeholder} required={required} className="input-cyber h-10" />}</label>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-xl border border-cyber-border bg-cyber-dark shadow-2xl"><div className="flex items-center justify-between border-b border-cyber-border px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2><button onClick={onClose} className="text-cyber-text-dim hover:text-cyber-text"><X size={16} /></button></div><div className="p-5">{children}</div></div></div>; }
function LoadingState() { return <div className="flex items-center justify-center gap-2 p-12 text-xs text-cyber-text-dim"><Loader size={15} className="animate-spin text-cyber-cyan" /> Loading evidence workspace</div>; }
function EmptyCases({ onCreate }: { onCreate: () => void }) { return <div className="rounded-xl border border-dashed border-cyber-border p-16 text-center"><Archive size={32} className="mx-auto mb-4 text-cyber-border" /><h3 className="text-sm font-semibold">No investigation cases yet</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-cyber-text-dim">Create a case to start preserving web captures, hashes, links and investigation notes.</p><button onClick={onCreate} className="mt-5 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black">Create first case</button></div>; }
