import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, Clipboard, Copy, Download,
  ExternalLink, FileCode2, FileUp, Globe2, Image as ImageIcon, Info, Link2, Loader, Plus,
  RotateCw, Search, ShieldAlert, Text, Trash2, X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { EvidenceArtifact, MetadataResponse } from '../types/investigation';
import {
  buildArtifact, formatRawContent, isHtmlContent, isProtectedTarget, parseHtmlDocument,
  persistArtifact, readFileAsText, requestPageCapture, sanitizePreviewHtml,
} from '../lib/capture';

interface Props {
  caseId: string;
  onArtifactAdded: (artifact: EvidenceArtifact) => void;
}

type Tab = 'preview' | 'text' | 'html' | 'metadata' | 'links' | 'assets';

/** Grab a full frame from the user's screen (100% local, no upload). */
async function captureScreenFrame(): Promise<string> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('unsupported');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } as MediaTrackConstraints, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.addEventListener('loadeddata', () => resolve(), { once: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function normalizeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export default function CaseBrowser({ caseId, onArtifactAdded }: Props) {
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('preview');
  const [textFilter, setTextFilter] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [screenShot, setScreenShot] = useState('');
  const [shotError, setShotError] = useState('');
  const [copied, setCopied] = useState('');
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState('');
  const [importName, setImportName] = useState('');
  const textEndRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (rawUrl: string, pushHistory = true) => {
    const url = normalizeInput(rawUrl);
    if (!url) return;
    setLoading(true);
    setError('');
    setSaved(false);
    setTab('preview');
    setInput(url);
    setCurrentUrl(url);
    try {
      const result = await requestPageCapture(url);
      setMetadata(result);
      if (pushHistory) {
        setHistory((previous) => {
          const trimmed = previous.slice(0, historyIndex + 1);
          return [...trimmed, url];
        });
        setHistoryIndex((index) => index + 1);
      }
    } catch (cause) {
      setMetadata(null);
      setError(cause instanceof Error ? cause.message : t('browser.error'));
    } finally {
      setLoading(false);
    }
  }, [historyIndex, t]);

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    void load(history[nextIndex], false);
  }, [history, historyIndex, load]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    void load(history[nextIndex], false);
  }, [history, historyIndex, load]);

  useEffect(() => {
    setMetadata(null);
    setCurrentUrl('');
    setInput('');
    setHistory([]);
    setHistoryIndex(-1);
    setError('');
    setScreenShot('');
    setNotes('');
    setImportName('');
  }, [caseId]);

  const safeHtml = useMemo(
    () => (metadata?.html ? sanitizePreviewHtml(metadata.html, metadata.finalUrl) : ''),
    [metadata],
  );

  const isHtml = metadata ? isHtmlContent(metadata.html, metadata.contentType) : false;
  const rawFormatted = metadata ? formatRawContent(metadata.html, metadata.contentType) : '';

  const textLines = metadata?.text ?? [];
  const filteredLines = useMemo(() => {
    const needle = textFilter.trim().toLowerCase();
    if (!needle) return textLines;
    return textLines.filter((line) => line.toLowerCase().includes(needle));
  }, [textLines, textFilter]);

  const copyToClipboard = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }, []);

  const handleAddEvidence = useCallback(async () => {
    if (!metadata) return;
    const targetUrl = currentUrl || metadata.finalUrl || metadata.meta.canonical || importName || 'imported-html';
    const source = currentUrl ? 'local-capture-engine' : 'imported-html-file';
    const artifact = await buildArtifact(caseId, { targetUrl, notes }, metadata, source);
    if (screenShot) {
      artifact.screenshot_preview = screenShot;
      artifact.screenshot_previews = [screenShot];
      artifact.artifact_type = 'screenshot';
    }
    persistArtifact(artifact);
    onArtifactAdded(artifact);
    window.dispatchEvent(new CustomEvent('investigation-artifact-added', { detail: { caseId, artifact } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [caseId, currentUrl, importName, metadata, notes, onArtifactAdded, screenShot]);

  const handleScreenCapture = useCallback(async () => {
    setShotError('');
    try {
      setScreenShot(await captureScreenFrame());
    } catch {
      setShotError(t('browser.screenCaptureError'));
    }
  }, [t]);

  const handleDownloadHtml = useCallback(() => {
    if (!metadata) return;
    const blob = new Blob([metadata.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const host = (() => {
      try {
        return new URL(metadata.finalUrl).hostname;
      } catch {
        return 'page';
      }
    })();
    anchor.href = url;
    anchor.download = `${host}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [metadata]);

  const handleImportHtml = useCallback(async (file: File) => {
    setLoading(true);
    setError('');
    setSaved(false);
    setTab('preview');
    try {
      const html = await readFileAsText(file);
      if (!html.trim()) throw new Error(t('browser.importEmpty'));
      const parsed = parseHtmlDocument(html, '');
      const guess = parsed.meta.canonical || parsed.meta['og:url'] || '';
      setMetadata(parsed);
      setCurrentUrl(guess);
      setImportName(file.name);
      setInput(guess || file.name);
    } catch (cause) {
      setMetadata(null);
      setError(cause instanceof Error ? cause.message : t('browser.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const domain = useMemo(() => {
    if (!currentUrl) return '';
    try {
      return new URL(currentUrl).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }, [currentUrl]);

  const quickLinks = useMemo(() => (domain ? [
    { label: 'Google', href: `https://www.google.com/search?q=${encodeURIComponent(domain)}` },
    { label: 'Bing', href: `https://www.bing.com/search?q=${encodeURIComponent(domain)}` },
    { label: 'DuckDuckGo', href: `https://duckduckgo.com/?q=${encodeURIComponent(domain)}` },
    { label: 'Wayback', href: `https://web.archive.org/web/*/${domain}` },
    { label: 'urlscan.io', href: `https://urlscan.io/domain/${domain}` },
    { label: 'crt.sh', href: `https://crt.sh/?q=${encodeURIComponent(domain)}` },
    { label: 'Whois', href: `https://who.is/whois/${domain}` },
    { label: 'VirusTotal', href: `https://www.virustotal.com/gui/domain/${domain}` },
  ] : []), [domain]);

  const tabs: { id: Tab; label: string; count?: number; icon: ReactNode }[] = [
    { id: 'preview', label: t('browser.tabPreview'), icon: <Globe2 size={13} /> },
    { id: 'text', label: t('browser.tabText'), count: textLines.length, icon: <Text size={13} /> },
    { id: 'html', label: t('browser.tabHtml'), icon: <FileCode2 size={13} /> },
    { id: 'metadata', label: t('browser.tabMeta'), count: metadata ? Object.keys(metadata.meta).length : 0, icon: <Info size={13} /> },
    { id: 'links', label: t('browser.tabLinks'), count: metadata?.links.length ?? 0, icon: <Link2 size={13} /> },
    { id: 'assets', label: t('browser.tabAssets'), count: metadata?.assets?.length ?? 0, icon: <ImageIcon size={13} /> },
  ];

  return (
    <div className="mt-6 space-y-4">
      {/* ── Address bar ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-cyber-border bg-cyber-panel/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-cyber-cyan">
          <Globe2 size={13} /> {t('browser.title')}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load(input);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex items-center gap-1 rounded-lg border border-cyber-border bg-cyber-black/60 p-1">
            <button
              type="button"
              onClick={goBack}
              disabled={historyIndex <= 0 || loading}
              className="rounded-md p-1.5 text-cyber-text-dim transition hover:text-cyber-cyan disabled:opacity-30"
              title={t('browser.back')}
            >
              <ArrowLeft size={15} />
            </button>
            <button
              type="button"
              onClick={goForward}
              disabled={historyIndex >= history.length - 1 || loading}
              className="rounded-md p-1.5 text-cyber-text-dim transition hover:text-cyber-cyan disabled:opacity-30"
              title={t('browser.forward')}
            >
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => void load(currentUrl || input, false)}
              disabled={loading || !(currentUrl || input)}
              className="rounded-md p-1.5 text-cyber-text-dim transition hover:text-cyber-cyan disabled:opacity-30"
              title={t('browser.reload')}
            >
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyber-text-dim" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('browser.urlPlaceholder')}
              spellCheck={false}
              className="input-cyber h-10 w-full pl-10 font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-xs font-semibold text-cyber-black transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {loading ? <Loader size={14} className="animate-spin" /> : <Globe2 size={14} />} {t('browser.load')}
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={loading}
            title={t('browser.importHtmlHint')}
            className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs font-semibold text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan disabled:opacity-50"
          >
            <FileUp size={14} /> {t('browser.importHtml')}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportHtml(file);
              event.target.value = '';
            }}
          />
        </form>

        {quickLinks.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-cyber-border pt-3">
            <span className="mr-1 text-[10px] font-mono uppercase tracking-wider text-cyber-text-dim">{t('browser.quickLinks')}</span>
            {quickLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-cyber-border px-2 py-1 text-[10px] font-semibold text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-cyber-red">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{t('browser.error')}</p>
            <p className="mt-1 break-all font-mono text-[11px] opacity-80">{error}</p>
          </div>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {loading && !metadata && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-cyber-border bg-cyber-panel/40 p-12 text-sm text-cyber-text-dim">
          <Loader size={16} className="animate-spin text-cyber-cyan" /> {t('browser.loading')}
        </div>
      )}

      {!loading && !metadata && !error && (
        <div className="rounded-xl border border-dashed border-cyber-border bg-cyber-panel/30 p-12 text-center">
          <Globe2 size={34} className="mx-auto mb-3 text-cyber-border" />
          <h3 className="text-sm font-semibold text-cyber-text">{t('browser.emptyState')}</h3>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-cyber-text-dim">{t('browser.emptyHint')}</p>
        </div>
      )}

      {metadata && (
        <>
          {/* ── Page header + stats ──────────────────────────────────── */}
          <div className="rounded-xl border border-cyber-border bg-cyber-panel/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-cyber-text" title={metadata.title}>
                  {metadata.title || metadata.finalUrl}
                </h3>
                <p className="mt-1 truncate font-mono text-[11px] text-cyber-text-dim" title={metadata.finalUrl}>
                  {metadata.finalUrl}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void handleAddEvidence()}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    saved ? 'bg-cyber-green/20 text-cyber-green' : 'bg-cyber-cyan text-cyber-black hover:bg-cyan-300'
                  }`}
                >
                  {saved ? <Check size={14} /> : <Plus size={14} />} {saved ? t('browser.added') : t('browser.addEvidence')}
                </button>
                <button
                  onClick={() => void handleScreenCapture()}
                  className="flex items-center gap-2 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-2 text-xs font-semibold text-cyber-cyan transition hover:bg-cyber-cyan/20"
                >
                  <Camera size={14} /> {t('browser.screenCapture')}
                </button>
                <button
                  onClick={handleDownloadHtml}
                  className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                >
                  <Download size={14} /> HTML
                </button>
                <a
                  href={metadata.finalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-cyber-border px-3 py-2 text-xs text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                >
                  <ExternalLink size={14} /> {t('browser.openExternal')}
                </a>
              </div>
            </div>

            <div className="mt-4 grid gap-2 border-t border-cyber-border pt-3 text-[11px] sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="HTTP" value={String(metadata.status || '—')} />
              <Stat label="Content-Type" value={metadata.contentType || '—'} />
              <Stat label={t('browser.statTextLines')} value={String(textLines.length)} />
              <Stat label={t('browser.statLinks')} value={String(metadata.links.length)} />
              <Stat label={t('browser.statSize')} value={`${Math.round((metadata.bytes ?? metadata.html.length) / 1024).toLocaleString('fr-FR')} Ko`} />
            </div>

            {isProtectedTarget(metadata.finalUrl) && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <ShieldAlert size={13} /> {t('browser.protectedHint')}
              </div>
            )}
            {metadata.truncated && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <AlertTriangle size={13} /> {t('browser.truncatedHint')}
              </div>
            )}

            {screenShot && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-cyber-border bg-cyber-black/60 p-3">
                <img src={screenShot} alt="screen capture" className="h-16 w-28 rounded-md border border-cyber-border object-cover" />
                <div className="flex-1 text-[11px] text-cyber-text-dim">
                  <p className="font-semibold text-cyber-green">{t('browser.shotAttached')}</p>
                  <p className="mt-0.5">{t('browser.shotHint')}</p>
                </div>
                <button onClick={() => setScreenShot('')} className="rounded-md p-1.5 text-cyber-red hover:bg-red-500/10" title={t('browser.shotRemove')}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            {shotError && <p className="mt-2 text-[11px] text-cyber-red">{shotError}</p>}

            <label className="mt-3 block text-[11px] font-semibold text-cyber-text-dim">
              <span className="mb-1 block">{t('browser.captureNote')}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder={t('browser.captureNotePlaceholder')}
                className="input-cyber resize-y text-xs leading-5"
              />
            </label>
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-cyber-border bg-cyber-panel/60 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
                  tab === item.id ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text-dim hover:text-cyber-text'
                }`}
              >
                {item.icon} {item.label}
                {item.count !== undefined && <span className="rounded bg-cyber-black/50 px-1.5 font-mono text-[10px]">{item.count}</span>}
              </button>
            ))}
          </div>

          {/* ── Preview ──────────────────────────────────────────────── */}
          {tab === 'preview' && (
            <div className="overflow-hidden rounded-xl border border-cyber-border bg-white">
              <div className="flex items-center justify-between border-b border-cyber-border bg-cyber-dark px-4 py-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyber-cyan">
                  {t('browser.renderedPreview')} · {t('browser.sanitized')}
                </span>
                <span className="font-mono text-[10px] text-cyber-text-dim">
                  {metadata.html.length.toLocaleString('fr-FR')} {t('investigation.characters')}
                </span>
              </div>
              {isHtml && safeHtml ? (
                <iframe
                  title="Local page preview"
                  sandbox="allow-same-origin"
                  srcDoc={safeHtml}
                  className="h-[620px] w-full bg-white"
                />
              ) : (
                <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words bg-[var(--cyber-black)] p-5 font-mono text-[12px] leading-6 text-slate-100">
                  {rawFormatted || t('investigation.noHtml')}
                </pre>
              )}
            </div>
          )}

          {/* ── Text lines ───────────────────────────────────────────── */}
          {tab === 'text' && (
            <div className="overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/40">
              <div className="flex flex-wrap items-center gap-2 border-b border-cyber-border bg-cyber-dark px-4 py-2">
                <Text size={13} className="text-cyber-cyan" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyber-cyan">
                  {t('browser.textExtracted')} · {filteredLines.length}/{textLines.length}
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
                  onClick={() => void copyToClipboard('text', filteredLines.join('\n'))}
                  className="flex items-center gap-1.5 rounded-md border border-cyber-border px-2.5 py-1.5 text-[11px] text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                >
                  {copied === 'text' ? <Check size={12} /> : <Copy size={12} />} {copied === 'text' ? t('browser.copied') : t('browser.copyText')}
                </button>
              </div>
              {filteredLines.length === 0 ? (
                <div className="p-10 text-center text-sm text-cyber-text-dim">{t('browser.noText')}</div>
              ) : (
                <ol className="max-h-[620px] divide-y divide-cyber-border/30 overflow-auto">
                  {filteredLines.map((line, index) => (
                    <li key={`${index}-${line.slice(0, 24)}`} className="flex gap-3 px-4 py-2 hover:bg-cyber-cyan/5">
                      <span className="w-10 shrink-0 select-none text-right font-mono text-[10px] text-cyber-text-dim">{index + 1}</span>
                      <span className="break-words text-[13px] leading-6 text-cyber-text">{line}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div ref={textEndRef} />
            </div>
          )}

          {/* ── Raw HTML ─────────────────────────────────────────────── */}
          {tab === 'html' && (
            <div className="overflow-hidden rounded-xl border border-cyber-border bg-[var(--cyber-black)]">
              <div className="flex items-center justify-between border-b border-cyber-border bg-cyber-dark px-4 py-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyber-cyan">
                  HTML · {metadata.html.length.toLocaleString('fr-FR')} {t('investigation.characters')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void copyToClipboard('html', metadata.html)}
                    className="flex items-center gap-1.5 rounded-md border border-cyber-border px-2.5 py-1 text-[11px] text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                  >
                    {copied === 'html' ? <Check size={12} /> : <Clipboard size={12} />} {copied === 'html' ? t('browser.copied') : t('browser.copyHtml')}
                  </button>
                  <button
                    onClick={handleDownloadHtml}
                    className="flex items-center gap-1.5 rounded-md border border-cyber-border px-2.5 py-1 text-[11px] text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                  >
                    <Download size={12} /> .html
                  </button>
                </div>
              </div>
              <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-6 text-slate-100">
                {rawFormatted}
              </pre>
            </div>
          )}

          {/* ── Metadata ─────────────────────────────────────────────── */}
          {tab === 'metadata' && (
            <div className="overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/40">
              <div className="flex items-center justify-between border-b border-cyber-border bg-cyber-dark px-4 py-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyber-cyan">
                  {t('browser.metaExtracted')} · {Object.keys(metadata.meta).length}
                </span>
                <button
                  onClick={() => void copyToClipboard('meta', JSON.stringify(metadata.meta, null, 2))}
                  className="flex items-center gap-1.5 rounded-md border border-cyber-border px-2.5 py-1 text-[11px] text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                >
                  {copied === 'meta' ? <Check size={12} /> : <Copy size={12} />} {copied === 'meta' ? t('browser.copied') : t('browser.copyJson')}
                </button>
              </div>
              {Object.keys(metadata.meta).length === 0 ? (
                <div className="p-10 text-center text-sm text-cyber-text-dim">{t('browser.noMeta')}</div>
              ) : (
                <table className="w-full border-collapse text-left">
                  <tbody className="divide-y divide-cyber-border/30">
                    {Object.entries(metadata.meta).map(([key, value]) => (
                      <tr key={key} className="align-top hover:bg-cyber-cyan/5">
                        <td className="w-56 px-4 py-2 font-mono text-[11px] font-semibold text-cyber-cyan">{key}</td>
                        <td className="break-words px-4 py-2 text-[12px] leading-5 text-cyber-text">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Links ────────────────────────────────────────────────── */}
          {tab === 'links' && (
            <div className="overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/40">
              <div className="flex items-center justify-between border-b border-cyber-border bg-cyber-dark px-4 py-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyber-cyan">
                  {t('investigation.linksTab')} · {metadata.links.length}
                </span>
                <button
                  onClick={() => void copyToClipboard('links', metadata.links.join('\n'))}
                  className="flex items-center gap-1.5 rounded-md border border-cyber-border px-2.5 py-1 text-[11px] text-cyber-text-dim transition hover:border-cyber-cyan/50 hover:text-cyber-cyan"
                >
                  {copied === 'links' ? <Check size={12} /> : <Copy size={12} />} {copied === 'links' ? t('browser.copied') : t('browser.copyText')}
                </button>
              </div>
              {metadata.links.length === 0 ? (
                <div className="p-10 text-center text-sm text-cyber-text-dim">{t('investigation.noLinks')}</div>
              ) : (
                <ul className="max-h-[620px] divide-y divide-cyber-border/30 overflow-auto">
                  {metadata.links.map((link) => (
                    <li key={link} className="flex items-center gap-2 px-4 py-2 hover:bg-cyber-cyan/5">
                      <a href={link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyber-cyan hover:underline">
                        {link}
                      </a>
                      <button
                        onClick={() => void copyToClipboard(link, link)}
                        className="shrink-0 rounded-md p-1 text-cyber-text-dim hover:text-cyber-cyan"
                        title={t('browser.copyText')}
                      >
                        {copied === link ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Assets ───────────────────────────────────────────────── */}
          {tab === 'assets' && (
            <div className="rounded-xl border border-cyber-border bg-cyber-panel/40 p-4">
              {(metadata.assets?.length ?? 0) === 0 ? (
                <div className="p-8 text-center text-sm text-cyber-text-dim">{t('browser.noAssets')}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {metadata.assets?.map((asset) => (
                    <figure key={asset} className="overflow-hidden rounded-lg border border-cyber-border bg-cyber-black/60">
                      <img
                        src={asset}
                        alt=""
                        loading="lazy"
                        className="h-32 w-full bg-[var(--cyber-black)] object-contain"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                      <figcaption className="truncate px-2 py-1.5 font-mono text-[10px] text-cyber-text-dim" title={asset}>
                        {asset.split('/').pop()}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cyber-border bg-cyber-black/40 px-3 py-2">
      <span className="block text-[9px] uppercase tracking-wider text-cyber-text-dim">{label}</span>
      <span className="mt-0.5 block truncate font-mono text-[11px] text-cyber-text" title={value}>{value}</span>
    </div>
  );
}
