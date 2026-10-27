import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera, History, Loader, RotateCcw, Trash2, X } from 'lucide-react';
import type { CaseData } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import {
  MAX_SNAPSHOTS_PER_CASE,
  addSnapshot,
  deleteSnapshot,
  diffCase,
  isEmptyDiff,
  listSnapshots,
  snapshotsAvailable,
  type CaseDiff,
  type CaseSnapshot,
} from '../lib/snapshots';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  caseData: CaseData | null;
  /** Applique un point au dossier vivant. L'appelant crée le point de sécurité. */
  onRestore: (snapshot: CaseSnapshot) => Promise<void>;
}

function formatStamp(iso: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function SnapshotsPanel({ isOpen, onClose, caseData, onRestore }: Props) {
  const { t, lang } = useLanguage();
  const [snapshots, setSnapshots] = useState<CaseSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Restauration en attente de confirmation : identifiant du point visé. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!caseData) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    const ok = await snapshotsAvailable();
    setAvailable(ok);
    setSnapshots(ok ? await listSnapshots(caseData.id) : []);
    setLoading(false);
  }, [caseData]);

  useEffect(() => {
    if (isOpen) {
      setConfirmId(null);
      setError(null);
      void refresh();
    }
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!caseData) return;
    setBusy(true);
    const created = await addSnapshot(caseData, t('snapshots.manualLabel'), false);
    setBusy(false);
    if (!created) {
      setAvailable(false);
      setError(t('snapshots.failed'));
      return;
    }
    await refresh();
  };

  const handleRestore = async (snapshot: CaseSnapshot) => {
    setBusy(true);
    try {
      await onRestore(snapshot);
      setConfirmId(null);
    } catch {
      setError(t('snapshots.restoreFailed'));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    await deleteSnapshot(id);
    setBusy(false);
    await refresh();
  };

  /**
   * Différence que produirait la restauration : on compare l'état **courant**
   * au point visé, dans ce sens-là. L'inverse (« ce qui a changé depuis le
   * point ») afficherait « −1 entité » pour une entité supprimée, alors que
   * restaurer la fait revenir : le signe doit décrire l'action, pas l'historique.
   */
  const diffFor = (snapshot: CaseSnapshot): CaseDiff | null =>
    caseData ? diffCase(caseData, snapshot.data) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        data-testid="snapshots-panel"
        className="relative flex max-h-[82vh] w-[560px] flex-col rounded-2xl border border-cyber-border bg-cyber-dark shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cyber-border px-5 py-4">
          <div className="flex items-center gap-2">
            <History size={15} className="text-cyber-cyan" />
            <div>
              <h2 className="text-sm font-bold text-cyber-text">{t('snapshots.title')}</h2>
              <p className="text-[10px] text-cyber-text-dim">
                {caseData ? caseData.name : t('snapshots.noCase')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('snapshots.close')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-cyber-border px-5 py-3">
          <p className="max-w-[300px] text-[10px] leading-relaxed text-cyber-text-dim">
            {t('snapshots.hint').replace('{n}', String(MAX_SNAPSHOTS_PER_CASE))}
          </p>
          <button
            data-testid="snapshot-create"
            onClick={() => void handleCreate()}
            disabled={!caseData || busy || !available}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader size={12} className="animate-spin" /> : <Camera size={12} />}
            {t('snapshots.create')}
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {!available && (
            <div className="flex items-start gap-2 rounded-lg border border-cyber-orange/40 bg-cyber-orange/10 px-3 py-2 text-[11px] text-cyber-orange">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{t('snapshots.failed')}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-cyber-red/40 bg-cyber-red/10 px-3 py-2 text-[11px] text-cyber-red">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <p className="py-6 text-center text-xs text-cyber-text-dim">
              <Loader size={14} className="mr-2 inline animate-spin" />
              {t('snapshots.loading')}
            </p>
          )}

          {!loading && snapshots.length === 0 && available && (
            <p className="px-2 py-8 text-center text-xs leading-relaxed text-cyber-text-dim">
              {t('snapshots.empty')}
            </p>
          )}

          {!loading &&
            snapshots.map((snapshot) => {
              const diff = diffFor(snapshot);
              const same = diff ? isEmptyDiff(diff) : true;
              return (
                <div
                  key={snapshot.id}
                  data-testid="snapshot-row"
                  className="rounded-xl border border-cyber-border bg-cyber-panel/60 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-cyber-text">
                        {formatStamp(snapshot.at, lang)}
                        <span className="ml-2 text-[9px] uppercase tracking-wide text-cyber-text-dim">
                          {snapshot.auto ? t('snapshots.autoLabel') : snapshot.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-cyber-text-dim">
                        {t('snapshots.counts')
                          .replace('{n}', String(snapshot.data.nodes?.length ?? 0))
                          .replace('{m}', String(snapshot.data.edges?.length ?? 0))}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {confirmId === snapshot.id ? (
                        <>
                          <button
                            data-testid="snapshot-confirm"
                            onClick={() => void handleRestore(snapshot)}
                            disabled={busy}
                            className="rounded-lg border border-cyber-orange/50 bg-cyber-orange/15 px-2 py-1 text-[10px] font-semibold text-cyber-orange transition-colors hover:bg-cyber-orange/25 disabled:opacity-40"
                          >
                            {t('snapshots.confirm')}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="rounded-lg border border-cyber-border px-2 py-1 text-[10px] text-cyber-text-dim transition-colors hover:bg-cyber-panel"
                          >
                            {t('snapshots.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            data-testid="snapshot-restore"
                            onClick={() => setConfirmId(snapshot.id)}
                            title={t('snapshots.restore')}
                            className="flex items-center gap-1 rounded-lg border border-cyber-cyan/40 px-2 py-1 text-[10px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/10"
                          >
                            <RotateCcw size={10} />
                            {t('snapshots.restore')}
                          </button>
                          <button
                            data-testid="snapshot-delete"
                            onClick={() => void handleDelete(snapshot.id)}
                            title={t('snapshots.delete')}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyber-border text-cyber-text-dim transition-colors hover:border-cyber-red/40 hover:text-cyber-red"
                          >
                            <Trash2 size={10} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ce que le point changerait s'il était appliqué maintenant.
                      C'est la différence avec un simple historique : on voit
                      avant de cliquer, au lieu de restaurer à l'aveugle. */}
                  {same ? (
                    <p className="mt-1.5 text-[10px] italic text-cyber-text-dim/70">
                      {t('snapshots.identical')}
                    </p>
                  ) : (
                    <p data-testid="snapshot-diff" className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-[10px]">
                      {diff!.addedNodes.length > 0 && (
                        <span className="text-cyber-green">+{diff!.addedNodes.length} {t('snapshots.unitEntities')}</span>
                      )}
                      {diff!.removedNodes.length > 0 && (
                        <span className="text-cyber-red">−{diff!.removedNodes.length} {t('snapshots.unitEntities')}</span>
                      )}
                      {diff!.changedNodes.length > 0 && (
                        <span className="text-cyber-orange">{diff!.changedNodes.length} {t('snapshots.unitChanged')}</span>
                      )}
                      {diff!.addedEdges > 0 && (
                        <span className="text-cyber-green">+{diff!.addedEdges} {t('snapshots.unitLinks')}</span>
                      )}
                      {diff!.removedEdges > 0 && (
                        <span className="text-cyber-red">−{diff!.removedEdges} {t('snapshots.unitLinks')}</span>
                      )}
                      {diff!.changedEdges > 0 && (
                        <span className="text-cyber-orange">{diff!.changedEdges} {t('snapshots.unitLinksChanged')}</span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>,
    document.body
  );
}
