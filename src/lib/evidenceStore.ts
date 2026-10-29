import type { EvidenceArtifact } from '../types/investigation';
import { LOCAL_ARTIFACTS_KEY, readLocalList } from './capture';

/**
 * Stockage des preuves.
 *
 * Le module d'enquête écrivait ses preuves dans `localStorage`, comme le reste
 * de l'application. C'était une erreur de fond : un artefact de preuve contient
 * l'image de la page en `data:` URL, et l'origine entière plafonne autour de
 * 5 Mo. Dès la deuxième ou la troisième capture, `setItem` levait
 * `QuotaExceededError` — et comme l'écriture était enveloppée dans un `catch`
 * qui se contentait d'un `console.error`, la preuve s'affichait à l'écran puis
 * disparaissait au rechargement. Rien n'était signalé à l'analyste : le pire
 * des comportements pour une chaîne de conservation.
 *
 * Les preuves vivent donc en IndexedDB, qui n'a pas ce plafond. Le module de
 * points de restauration faisait déjà ce choix pour la même raison.
 */

const DB_NAME = 'ghostint-evidence';
const DB_VERSION = 1;
const ARTIFACTS = 'artifacts';
/** Fichiers d'origine importés depuis le poste, conservés tels quels. */
const BLOBS = 'blobs';
const MIGRATION_FLAG = 'zhetikal-evidence-migrated-to-idb';

let dbPromise: Promise<IDBDatabase> | null = null;
let degraded = false;

/** Vrai quand IndexedDB est indisponible et que l'on est retombé sur `localStorage`. */
export function isEvidenceStorageDegraded(): boolean {
  return degraded;
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ARTIFACTS)) {
        const store = db.createObjectStore(ARTIFACTS, { keyPath: 'id' });
        store.createIndex('case_id', 'case_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ouverture IndexedDB refusée'));
    request.onblocked = () => reject(new Error('IndexedDB bloquée par un autre onglet'));
  });
  return dbPromise;
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Requête IndexedDB échouée'));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction IndexedDB échouée'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction IndexedDB annulée'));
  });
}

/**
 * Repli assumé quand IndexedDB est refusé (navigation privée verrouillée,
 * stockage désactivé). On perd la capacité d'accumuler des images, mais on ne
 * perd pas la preuve déjà présente : mieux vaut un stockage dégradé signalé
 * qu'un module qui ne s'ouvre plus.
 */
function degrade<T>(fallback: T, cause: unknown): T {
  if (!degraded) {
    degraded = true;
    console.warn('Stockage des preuves dégradé (IndexedDB indisponible)', cause);
  }
  return fallback;
}

export async function listArtifacts(): Promise<EvidenceArtifact[]> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(ARTIFACTS, 'readonly');
    const rows = await asPromise(transaction.objectStore(ARTIFACTS).getAll() as IDBRequest<EvidenceArtifact[]>);
    return rows.sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)));
  } catch (cause) {
    return degrade(readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY), cause);
  }
}

export async function listArtifactsOfCase(caseId: string): Promise<EvidenceArtifact[]> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(ARTIFACTS, 'readonly');
    const index = transaction.objectStore(ARTIFACTS).index('case_id');
    const rows = await asPromise(index.getAll(caseId) as IDBRequest<EvidenceArtifact[]>);
    return rows.sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)));
  } catch (cause) {
    return degrade(
      readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY).filter((item) => item.case_id === caseId),
      cause,
    );
  }
}

/** Écrit une preuve, et renvoie `false` si le stockage a refusé. */
export async function saveArtifact(artifact: EvidenceArtifact): Promise<boolean> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(ARTIFACTS, 'readwrite');
    transaction.objectStore(ARTIFACTS).put(artifact);
    await done(transaction);
    return true;
  } catch (cause) {
    degrade(null, cause);
    const legacy = [artifact, ...readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY).filter((item) => item.id !== artifact.id)];
    try {
      localStorage.setItem(LOCAL_ARTIFACTS_KEY, JSON.stringify(legacy));
      return true;
    } catch {
      return false;
    }
  }
}

export async function saveArtifacts(artifacts: EvidenceArtifact[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(ARTIFACTS, 'readwrite');
  const store = transaction.objectStore(ARTIFACTS);
  for (const artifact of artifacts) store.put(artifact);
  await done(transaction);
}

/**
 * Applique une modification partielle. On relit la preuve dans la transaction
 * plutôt que de la faire venir de l'écran : l'état affiché peut être en retard
 * sur le stockage, et écraser avec une copie périmée perdrait une note.
 */
export async function updateArtifact(
  id: string,
  patch: Partial<EvidenceArtifact>,
): Promise<EvidenceArtifact | null> {
  const db = await openDatabase();
  const transaction = db.transaction(ARTIFACTS, 'readwrite');
  const store = transaction.objectStore(ARTIFACTS);
  const current = await asPromise(store.get(id) as IDBRequest<EvidenceArtifact | undefined>);
  if (!current) {
    transaction.abort();
    return null;
  }
  const next = { ...current, ...patch, id: current.id };
  store.put(next);
  await done(transaction);
  return next;
}

export async function removeArtifact(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([ARTIFACTS, BLOBS], 'readwrite');
  transaction.objectStore(ARTIFACTS).delete(id);
  transaction.objectStore(BLOBS).delete(id);
  await done(transaction);
}

export async function removeArtifactsOfCase(caseId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([ARTIFACTS, BLOBS], 'readwrite');
  const artifacts = transaction.objectStore(ARTIFACTS);
  const blobs = transaction.objectStore(BLOBS);
  const keys = await asPromise(artifacts.index('case_id').getAllKeys(caseId) as IDBRequest<IDBValidKey[]>);
  for (const key of keys) {
    artifacts.delete(key);
    blobs.delete(key);
  }
  await done(transaction);
}

/* ------------------------------------------------------------------ *
 * Fichiers d'origine
 *
 * Une capture d'écran réduite pour l'affichage est une pièce utilisable, pas
 * une pièce originale. Le fichier importé est donc conservé **tel quel**,
 * octet pour octet, à côté de sa prévisualisation : c'est lui que l'on
 * présente si l'authenticité est contestée, et c'est sur lui que porte
 * l'empreinte SHA-512 enregistrée.
 * ------------------------------------------------------------------ */

export async function saveOriginal(id: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(BLOBS, 'readwrite');
  transaction.objectStore(BLOBS).put({ id, blob });
  await done(transaction);
}

export async function readOriginal(id: string): Promise<Blob | null> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(BLOBS, 'readonly');
    const row = await asPromise(transaction.objectStore(BLOBS).get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>);
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Migration depuis `localStorage`
 * ------------------------------------------------------------------ */

/**
 * Reprend une fois les preuves déjà enregistrées dans `localStorage`.
 *
 * La copie n'est supprimée qu'après vérification du nombre d'éléments relus :
 * la suppression libère les ~5 Mo qui empêchaient justement les écritures
 * suivantes de passer. En cas d'écart, on ne touche à rien.
 */
export async function migrateLegacyArtifacts(): Promise<number> {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return 0;
    const legacy = readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY);
    if (legacy.length === 0) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return 0;
    }
    await saveArtifacts(legacy);
    const stored = await listArtifacts();
    const storedIds = new Set(stored.map((item) => item.id));
    if (legacy.every((item) => storedIds.has(item.id))) {
      localStorage.removeItem(LOCAL_ARTIFACTS_KEY);
      localStorage.setItem(MIGRATION_FLAG, '1');
    }
    return legacy.length;
  } catch (cause) {
    console.warn('Migration des preuves impossible', cause);
    return 0;
  }
}
