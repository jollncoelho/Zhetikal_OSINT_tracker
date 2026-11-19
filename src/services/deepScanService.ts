/* ------------------------------------------------------------------ *
 * Pont vers la fonction Vercel `/api/deepscan`.
 *
 * Ce service n'est appelé QUE si l'analyste active explicitement le mode
 * serveur. Sans cette action, aucune requête ne quitte le navigateur.
 * ------------------------------------------------------------------ */

import type { AutoFinding, AutoSourceState } from './autoInvestigationService';

interface DeepScanResponse {
  ok?: boolean;
  scanned?: number;
  found?: { id: string; label: string; url: string; title: string }[];
  durationMs?: number;
}

export interface DeepScanOutcome {
  state: AutoSourceState;
  findings: AutoFinding[];
}

/** La fonction peut mettre ~90 s : on borne quand même, sans aborter l'UI. */
const DEEP_TIMEOUT_MS = 200_000;

export async function runDeepScan(
  username: string,
  signal?: AbortSignal
): Promise<DeepScanOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEP_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`/api/deepscan?u=${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    // En développement statique (python -m http.server), la route n'existe
    // pas : ce n'est pas une erreur de l'enquête, le mode local continue.
    if (response.status === 404) {
      return {
        state: { id: 'deepscan', status: 'error', detail: 'serveur absent' },
        findings: [],
      };
    }
    if (!response.ok) {
      return {
        state: { id: 'deepscan', status: 'error', detail: `HTTP ${response.status}` },
        findings: [],
      };
    }

    const data = (await response.json()) as DeepScanResponse;
    const sites = data.scanned ?? 0;
    const hits = Array.isArray(data.found) ? data.found : [];
    return {
      state: {
        id: 'deepscan',
        status: hits.length ? 'found' : 'absent',
        detail: hits.length ? `${hits.length} / ${sites} sites` : `0 / ${sites} sites`,
      },
      findings: hits.map((hit) => ({
        key: `deepscan-${hit.id}`,
        type: 'username' as const,
        label: `${hit.label} : ${String(hit.title || '').slice(0, 55)}`,
        source: 'deepscan' as const,
        url: hit.url,
        fields: {
          plateforme: hit.label,
          handle: username,
          titre: hit.title,
          verification: 'serveur',
          _consulteLe: new Date().toISOString(),
        },
        notes: `Profil vérifié côté serveur sur ${sites} sites publics. À confirmer de visu.`,
        confidence: 0.5,
      })),
    };
  } catch {
    return {
      state: { id: 'deepscan', status: 'error', detail: 'serveur injoignable' },
      findings: [],
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
