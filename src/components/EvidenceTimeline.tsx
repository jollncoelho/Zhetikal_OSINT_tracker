import { CalendarDays, Clock, FileCode2, Fingerprint, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { artifactImages } from '../lib/capture';
import {
  RELIABILITY_LABEL_KEY,
  RELIABILITY_STYLE,
  assessReliability,
  groupByDay,
} from '../lib/evidenceInsight';
import type { EvidenceArtifact, EvidenceArtifactType } from '../types/investigation';

const TYPE_ICON: Record<EvidenceArtifactType, typeof FileCode2> = {
  screenshot: ImageIcon,
  downloaded_page: FileCode2,
  extracted_link: LinkIcon,
  text_note: Fingerprint,
};

const TYPE_LABEL_KEY: Record<EvidenceArtifactType, string> = {
  screenshot: 'investigation.typeScreenshot',
  downloaded_page: 'investigation.typeDownloadedPage',
  extracted_link: 'investigation.typeExtractedLink',
  text_note: 'investigation.typeTextNote',
};

/** Chronologie verticale des preuves, regroupées par jour. */
export default function EvidenceTimeline({ artifacts }: { artifacts: EvidenceArtifact[] }) {
  const { t, lang } = useLanguage();
  const days = groupByDay(artifacts);

  if (days.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-cyber-border p-16 text-center">
        <CalendarDays size={30} className="mx-auto mb-4 text-cyber-border" />
        <p className="text-sm text-cyber-text-dim">{t('timeline.empty')}</p>
      </div>
    );
  }

  const formatDay = (day: string) => {
    const date = new Date(`${day}T12:00:00`);
    if (Number.isNaN(date.getTime())) return day;
    return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : lang, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : lang, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(date);
  };

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyber-border bg-cyber-panel/50 px-4 py-3">
        <CalendarDays size={14} className="text-cyber-cyan" />
        <span className="text-sm font-semibold text-cyber-text">{t('timeline.title')}</span>
        <span className="text-[11px] text-cyber-text-dim">{t('timeline.subtitle')}</span>
        <span className="ml-auto font-mono text-[11px] text-cyber-text-dim">
          {artifacts.length} {t('investigation.artifacts')} · {days.length} {t('timeline.day')}
        </span>
      </div>

      {days.map((group) => (
        <section key={group.day} className="relative pl-8">
          {/* Axe vertical */}
          <span className="absolute left-[9px] top-2 bottom-0 w-px bg-cyber-border" aria-hidden />
          <span
            className="absolute left-0 top-1 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-cyber-cyan/50 bg-cyber-dark"
            aria-hidden
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyber-cyan" />
          </span>

          <header className="mb-3 flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-semibold first-letter:uppercase text-cyber-text">{formatDay(group.day)}</h3>
            <span className="font-mono text-[10px] text-cyber-text-dim">
              {group.items.length} {t('timeline.artifactsOnDay')}
            </span>
          </header>

          <ol className="space-y-2">
            {group.items.map((artifact) => {
              const reliability = assessReliability(artifact);
              const style = RELIABILITY_STYLE[reliability.level];
              const Icon = TYPE_ICON[artifact.artifact_type] ?? FileCode2;
              const image = artifactImages(artifact)[0];
              const iocCount = (artifact.extracted_text ?? []).length;

              return (
                <li
                  key={artifact.id}
                  className="group flex gap-3 rounded-xl border border-cyber-border bg-cyber-panel/40 p-3 transition-colors hover:border-cyber-cyan/40 hover:bg-cyber-panel/70"
                >
                  <span className="flex w-[62px] shrink-0 items-center gap-1 pt-0.5 font-mono text-[10px] text-cyber-text-dim">
                    <Clock size={10} />
                    {formatTime(artifact.captured_at)}
                  </span>

                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className="h-11 w-16 shrink-0 rounded-md border border-cyber-border object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-cyber-border text-cyber-text-dim">
                      <Icon size={14} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-cyber-text">
                      {artifact.title || artifact.final_url || artifact.target_url}
                    </p>
                    <p className="truncate font-mono text-[10px] text-cyber-text-dim">
                      {artifact.final_url || artifact.target_url}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded border border-cyber-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cyber-text-dim">
                        {t(TYPE_LABEL_KEY[artifact.artifact_type])}
                      </span>
                      <span className="font-mono text-[9px] text-cyber-text-dim">
                        HTTP {artifact.http_status || '—'}
                      </span>
                      {iocCount > 0 && (
                        <span className="font-mono text-[9px] text-cyber-text-dim">
                          {iocCount} {t('browser.statTextLines')}
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`flex h-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.border} ${style.bg} ${style.text}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {t(RELIABILITY_LABEL_KEY[reliability.level])}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
