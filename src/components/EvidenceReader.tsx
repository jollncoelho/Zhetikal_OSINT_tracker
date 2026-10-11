import { useMemo, useState, type ReactNode } from 'react';
import { Clipboard, Eye, EyeOff, FileSearch, Highlighter, Link2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { useToast } from './Toast';
import { artifactImages } from '../lib/capture';
import {
  IOC_COLORS,
  IOC_LABEL_KEY,
  RELIABILITY_LABEL_KEY,
  RELIABILITY_STYLE,
  assessReliability,
  findIocs,
  summarizeIocs,
  type IocKind,
} from '../lib/evidenceInsight';
import type { EvidenceArtifact } from '../types/investigation';

/**
 * Mode lecture : le texte extrait de chaque preuve, avec surlignage automatique
 * des indicateurs (IP, domaines, e-mails, empreintes, crypto, IBAN, téléphones)
 * et des entités du dossier graphique actif.
 */
export default function EvidenceReader({
  artifacts,
  entityTerms,
}: {
  artifacts: EvidenceArtifact[];
  entityTerms: string[];
}) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const toast = useToast();
  const [onlyIocs, setOnlyIocs] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [activeKinds, setActiveKinds] = useState<IocKind[]>([]);

  const documents = useMemo(
    () =>
      artifacts
        .map((artifact) => {
          const lines = artifact.extracted_text ?? [];
          const iocs = lines.flatMap((line) => findIocs(line, entityTerms));
          return { artifact, lines, iocs, summary: summarizeIocs(iocs), reliability: assessReliability(artifact) };
        })
        .filter((doc) => doc.lines.length > 0),
    [artifacts, entityTerms],
  );

  const globalSummary = useMemo(() => {
    const counts = new Map<IocKind, number>();
    for (const doc of documents) {
      for (const { kind, count } of doc.summary) counts.set(kind, (counts.get(kind) ?? 0) + count);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [documents]);

  const totalIocs = globalSummary.reduce((sum, [, count]) => sum + count, 0);

  const toggleKind = (kind: IocKind) => {
    setActiveKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  };

  const copyAll = (artifact: EvidenceArtifact, values: string[]) => {
    void navigator.clipboard
      .writeText(values.join('\n'))
      .then(() => toast.success(t('toast.copied'), `${values.length} · ${artifact.title || artifact.final_url}`))
      .catch(() => toast.error(t('toast.exportFailed')));
  };

  if (documents.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-cyber-border p-16 text-center">
        <FileSearch size={30} className="mx-auto mb-4 text-cyber-border" />
        <p className="text-sm text-cyber-text-dim">{t('reader.noText')}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-cyber-border bg-cyber-panel/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-cyber-text">
              <Highlighter size={14} className="text-cyber-cyan" />
              {t('reader.legend')}
            </h3>
            <p className="mt-1 text-[11px] text-cyber-text-dim">{t('reader.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-cyber-text-dim">
              {totalIocs} {t('reader.occurrences')} · {documents.length} {t('reader.artifacts')}
            </span>
            <button
              type="button"
              onClick={() => setOnlyIocs((value) => !value)}
              aria-pressed={onlyIocs}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                onlyIocs
                  ? 'border-cyber-cyan/50 bg-cyber-cyan/15 text-cyber-cyan'
                  : 'border-cyber-border text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              {onlyIocs ? <Eye size={12} /> : <EyeOff size={12} />}
              {t('reader.onlyIocs')}
            </button>
          </div>
        </div>

        {globalSummary.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {globalSummary.map(([kind, count]) => {
              const active = activeKinds.length === 0 || activeKinds.includes(kind);
              const tone = entityTone(IOC_COLORS[kind]);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={activeKinds.includes(kind)}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all"
                  style={{
                    borderColor: active ? `${tone}70` : 'var(--cyber-border)',
                    background: active ? `${tone}18` : 'transparent',
                    color: active ? tone : 'var(--cyber-text-dim)',
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                  {t(IOC_LABEL_KEY[kind])}
                  <span className="font-mono">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {entityTerms.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-cyber-text-dim">
            <Link2 size={11} className="text-cyber-cyan" />
            {t('reader.entities')} : {entityTerms.length}
          </p>
        )}
      </div>

      {documents.map(({ artifact, lines, iocs, summary, reliability }) => {
        const isHidden = hidden[artifact.id];
        const style = RELIABILITY_STYLE[reliability.level];
        const images = artifactImages(artifact);
        const visibleLines = onlyIocs
          ? lines.filter((line) => findIocs(line, entityTerms).length > 0)
          : lines;

        return (
          <article
            key={artifact.id}
            className="overflow-hidden rounded-xl border border-cyber-border bg-cyber-panel/40"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyber-border bg-cyber-dark/40 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {images[0] ? (
                  <img
                    src={images[0]}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-md border border-cyber-border object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyber-border text-cyber-text-dim">
                    <FileSearch size={14} />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-cyber-text">
                    {artifact.title || artifact.final_url || artifact.target_url}
                  </h4>
                  <p className="truncate font-mono text-[10px] text-cyber-text-dim">
                    {artifact.final_url || artifact.target_url}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.border} ${style.bg} ${style.text}`}>
                  {t(RELIABILITY_LABEL_KEY[reliability.level])} · {reliability.score}%
                </span>
                <span className="rounded-full border border-cyber-border px-2 py-0.5 font-mono text-[10px] text-cyber-text-dim">
                  {iocs.length} IOC
                </span>
                {iocs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => copyAll(artifact, [...new Set(iocs.map((item) => item.value))])}
                    title={t('reader.copy')}
                    aria-label={t('reader.copy')}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-cyan/10 hover:text-cyber-cyan"
                  >
                    <Clipboard size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHidden((current) => ({ ...current, [artifact.id]: !current[artifact.id] }))}
                  aria-expanded={!isHidden}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
                >
                  {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </header>

            {!isHidden && (
              <div className="custom-scrollbar max-h-[420px] overflow-y-auto px-4 py-3">
                {summary.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {summary.map(({ kind, count }) => (
                      <span
                        key={kind}
                        className="rounded border px-1.5 py-0.5 font-mono text-[9px]"
                        style={{
                          borderColor: `${entityTone(IOC_COLORS[kind])}55`,
                          color: entityTone(IOC_COLORS[kind]),
                        }}
                      >
                        {t(IOC_LABEL_KEY[kind])} {count}
                      </span>
                    ))}
                  </div>
                )}
                {visibleLines.length === 0 ? (
                  <p className="py-6 text-center text-xs text-cyber-text-dim">{t('reader.noText')}</p>
                ) : (
                  <ol className="space-y-0.5">
                    {visibleLines.map((line, index) => (
                      <li key={`${index}-${line.slice(0, 12)}`} className="flex gap-3 text-[12px] leading-6">
                        <span className="w-9 shrink-0 select-none text-right font-mono text-[10px] text-cyber-text-dim/50">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 break-words font-mono text-cyber-text/90">
                          <HighlightedLine line={line} terms={entityTerms} activeKinds={activeKinds} />
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Découpe une ligne en segments et surligne les indicateurs détectés. */
function HighlightedLine({
  line,
  terms,
  activeKinds,
}: {
  line: string;
  terms: string[];
  activeKinds: IocKind[];
}) {
  const { entityTone } = useTheme();
  const matches = useMemo(
    () => findIocs(line, terms).filter((m) => activeKinds.length === 0 || activeKinds.includes(m.kind)),
    [line, terms, activeKinds],
  );

  if (matches.length === 0) return <>{line}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(<span key={`plain-${index}`}>{line.slice(cursor, match.start)}</span>);
    }
    const color = entityTone(IOC_COLORS[match.kind]);
    parts.push(
      <mark
        key={`ioc-${index}`}
        title={match.kind}
        className="rounded px-0.5"
        style={{
          background: `${color}26`,
          color,
          boxShadow: `inset 0 -1px 0 ${color}80`,
        }}
      >
        {line.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });
  if (cursor < line.length) parts.push(<span key="tail">{line.slice(cursor)}</span>);

  return <>{parts}</>;
}
