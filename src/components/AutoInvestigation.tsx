import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, Check, CheckCircle2, ExternalLink, Loader, Search, Sparkles, X, XCircle,
} from 'lucide-react';

import { useStore } from '../store/useStore';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { useToast } from './Toast';
import {
  AUTO_SOURCES,
  normalizeUsername,
  runAutoInvestigation,
  type AutoInvestigationResult,
  type AutoSourceState,
} from '../services/autoInvestigationService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'running' | 'done';

/** Pastille d'état d'une source, avec une couleur lisible dans les 4 thèmes. */
function SourceBadge({ state }: { state: AutoSourceState | undefined }) {
  const { t } = useLanguage();
  const status = state?.status ?? 'idle';
  const label = AUTO_SOURCES.find((item) => item.id === state?.id)?.label ?? '';
  const tone =
    status === 'found' ? 'var(--cyber-green)' :
    status === 'error' ? 'var(--cyber-red)' :
    status === 'absent' ? 'var(--cyber-orange)' :
    'var(--cyber-text-dim)';
  const Icon =
    status === 'found' ? CheckCircle2 :
    status === 'error' ? XCircle :
    status === 'running' ? Loader :
    status === 'absent' ? AlertTriangle : Search;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
      style={{
        borderColor: status === 'idle' ? 'var(--cyber-border)' : `${tone}55`,
        background: status === 'idle' ? 'transparent' : `${tone}0d`,
      }}
    >
      <Icon size={13} style={{ color: tone }} className={status === 'running' ? 'animate-spin' : ''} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-cyber-text">{label}</span>
      <span className="truncate font-mono text-[10px]" style={{ color: tone }}>
        {state?.detail || t(`auto.status.${status}`)}
      </span>
    </div>
  );
}

export default function AutoInvestigation({ isOpen, onClose }: Props) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const { success } = useToast();
  const createAutoCase = useStore((s) => s.createAutoCase);

  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [states, setStates] = useState<AutoSourceState[]>([]);
  const [result, setResult] = useState<AutoInvestigationResult | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [errorText, setErrorText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Une fermeture en pleine recherche doit annuler les requêtes en vol :
  // sinon des réponses arrivent après la fermeture et écrivent dans un état
  // que plus personne ne lit.
  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const normalized = useMemo(() => normalizeUsername(value), [value]);

  const launch = useCallback(async () => {
    const username = normalizeUsername(value);
    if (!username) {
      setErrorText(t('auto.invalid'));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setErrorText('');
    setResult(null);
    setExcluded(new Set());
    setStates([]);
    setPhase('running');

    try {
      const found = await runAutoInvestigation(
        username,
        (next) => setStates([...next]),
        controller.signal
      );
      if (controller.signal.aborted) return;
      setResult(found);
      setPhase('done');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setErrorText(cause instanceof Error ? cause.message : t('auto.genericError'));
      setPhase('idle');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [value, t]);

  const createGraph = useCallback(() => {
    if (!result) return;
    const findings = result.findings.filter((item) => !excluded.has(item.key));
    const withAccounts = findings.filter((item) => item.source !== 'input');

    // Même sans compte prouvé, le dossier est créé : la piste existe, et la
    // checklist manuelle est le résultat. Refuser de créer laissait l'analyste
    // devant un bouton actif qui ne menait qu'à une erreur.
    const checklistNotes = [
      t('auto.notesHeader').replace('{u}', result.username),
      ...result.manualChecks.map((check) => `- ${check.label}: ${check.url}`),
    ].join('\n');

    createAutoCase({
      name: t('auto.caseName').replace('{u}', result.username),
      description: t('auto.caseDescription').replace('{u}', result.username),
      findings,
      notes: checklistNotes,
    });
    success(
      t('auto.createdTitle'),
      withAccounts.length > 0
        ? t('auto.createdBody').replace('{n}', String(withAccounts.length))
        : t('auto.createdEmptyBody')
    );
    onClose();
  }, [result, excluded, createAutoCase, onClose, success, t]);

  const toggle = useCallback((key: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.72)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && phase !== 'running') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('auto.title')}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-cyber-dark shadow-2xl"
        style={{ borderColor: 'rgb(var(--cyber-cyan-rgb) / 0.3)' }}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-cyber-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-cyber-cyan" />
              <h2 className="text-sm font-bold text-cyber-text">{t('auto.title')}</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-cyber-text-dim">{t('auto.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'running'}
            aria-label={t('auto.close')}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Saisie */}
        <div className="border-b border-cyber-border px-5 py-4">
          <label htmlFor="auto-username" className="mb-1.5 block text-[11px] font-semibold text-cyber-text-dim">
            {t('auto.inputLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="auto-username"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setErrorText('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && phase !== 'running') {
                  event.preventDefault();
                  void launch();
                }
              }}
              disabled={phase === 'running'}
              placeholder={t('auto.placeholder')}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-cyber-border bg-cyber-panel px-3 py-2 font-mono text-xs text-cyber-text outline-none transition-colors focus:border-cyber-cyan/60 disabled:opacity-60"
            />
            <button
              onClick={() => void launch()}
              disabled={phase === 'running' || !normalized}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-cyber-cyan/50 bg-cyber-cyan/15 px-3 py-2 text-[11px] font-bold text-cyber-cyan transition-colors hover:bg-cyber-cyan/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === 'running' ? <Loader size={13} className="animate-spin" /> : <Search size={13} />}
              {phase === 'running' ? t('auto.running') : t('auto.launch')}
            </button>
          </div>
          {errorText && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--cyber-red)' }}>
              <AlertTriangle size={12} /> {errorText}
            </p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-cyber-text-dim/80">{t('auto.scopeNote')}</p>
        </div>

        {/* Corps */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === 'idle' && (
            <div className="rounded-xl border border-dashed border-cyber-border px-4 py-10 text-center">
              <Sparkles size={22} className="mx-auto mb-3 text-cyber-text-dim/50" />
              <p className="text-[11px] text-cyber-text-dim">{t('auto.idleHint')}</p>
            </div>
          )}

          {phase !== 'idle' && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cyber-text-dim">
                  {t('auto.sourcesTitle')}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {AUTO_SOURCES.map((source) => (
                    <SourceBadge key={source.id} state={states.find((s) => s.id === source.id)} />
                  ))}
                </div>
              </div>

              {phase === 'done' && result && (
                <>
                  <div>
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cyber-text-dim">
                      {t('auto.findingsTitle')}
                    </h3>
                    <div className="space-y-2">
                      {result.findings.map((finding) => {
                        const isRoot = finding.source === 'input';
                        const excludedNow = excluded.has(finding.key);
                        const tone = entityTone(
                          isRoot ? '#10b981' :
                          finding.source === 'telegram' ? '#229ed9' :
                          finding.source === 'github' ? '#8b5cf6' : '#38bdf8'
                        );
                        return (
                          <div
                            key={finding.key}
                            className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-opacity"
                            style={{
                              borderColor: `${tone}44`,
                              background: `${tone}0d`,
                              opacity: excludedNow ? 0.45 : 1,
                            }}
                          >
                            <button
                              onClick={() => !isRoot && toggle(finding.key)}
                              disabled={isRoot}
                              aria-label={t('auto.toggleFind')}
                              className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-default"
                              style={{
                                borderColor: tone,
                                background: excludedNow ? 'transparent' : tone,
                              }}
                            >
                              {!excludedNow && <Check size={11} className="text-cyber-black" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-xs font-bold" style={{ color: tone }}>
                                  {finding.label}
                                </span>
                                <span className="rounded-full border px-1.5 py-0.5 font-mono text-[9px]" style={{ borderColor: `${tone}66`, color: tone }}>
                                  {finding.source}
                                </span>
                              </div>
                              {finding.notes && (
                                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-cyber-text/70">
                                  {finding.notes}
                                </p>
                              )}
                            </div>
                            {finding.url && (
                              <a
                                href={finding.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t('auto.openProfile')}
                                className="mt-0.5 flex-shrink-0 text-cyber-text-dim transition-colors hover:text-cyber-cyan"
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyber-text-dim">
                      {t('auto.checklistTitle')}
                    </h3>
                    <p className="mb-2 text-[10px] leading-relaxed text-cyber-text-dim/80">
                      {t('auto.checklistHint')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.manualChecks.map((check) => (
                        <a
                          key={check.label}
                          href={check.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-cyber-border px-2 py-1 text-[10px] text-cyber-text-dim transition-colors hover:border-cyber-cyan/40 hover:text-cyber-cyan"
                        >
                          {check.label} <ExternalLink size={9} />
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Pied */}
        {phase === 'done' && result && (
          <div className="flex items-center justify-between gap-3 border-t border-cyber-border px-5 py-3">
            <p className="text-[10px] leading-relaxed text-cyber-text-dim">{t('auto.graphNote')}</p>
            <button
              onClick={createGraph}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-cyber-green/50 bg-cyber-green/15 px-3 py-2 text-[11px] font-bold transition-colors hover:bg-cyber-green/25"
              style={{ color: 'var(--cyber-green)' }}
            >
              <Sparkles size={13} />
              {t('auto.createGraph')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
