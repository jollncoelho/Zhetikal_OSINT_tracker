/* Points de restauration d'un dossier — stockés en IndexedDB, pas dans
 * `localStorage`.
 *
 * Pourquoi IndexedDB : un dossier embarque des captures d'écran en `data:` URL.
 * `localStorage` plafonne autour de 5 Mo pour **toute** l'origine, et le dossier
 * vivant l'occupe déjà. Y ajouter des copies de sauvegarde reviendrait à faire
 * échouer l'enregistrement du travail en cours pour protéger une copie de ce
 * même travail. IndexedDB accepte des centaines de Mo et n'a pas ce défaut.
 *
 * Ce que contient un point : une copie **complète** du dossier, photos
 * comprises. Une restauration partielle qui perdrait silencieusement les
 * captures serait pire que pas de restauration du tout.
 */
import type { CaseData, EntityNode } from '../types';
import { admiraltyCode, readAdmiralty } from '../types';

export interface CaseSnapshot {
  id: string;
  caseId: string;
  at: string;
  /** Texte libre affiché dans la liste (« avant nettoyage », …). */
  label: string;
  /** Un point automatique est créé par le tracker lui-même. */
  auto: boolean;
  data: CaseData;
}

const DB_NAME = 'ghostint-snapshots';
const STORE = 'snapshots';
const DB_VERSION = 1;
/** Au-delà, les plus anciens sont supprimés. Douze points couvrent une journée
 *  de travail dense sans laisser le disque se remplir indéfiniment. */
export const MAX_SNAPSHOTS_PER_CASE = 12;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('caseId', 'caseId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      // Mode privé strict, quota refusé : on renvoie null plutôt que de casser
      // l'appelant. L'interface dira que les points ne sont pas disponibles.
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Indique si le stockage des points est utilisable dans ce navigateur. */
export async function snapshotsAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}

export async function listSnapshots(caseId: string): Promise<CaseSnapshot[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('caseId');
    const request = index.getAll(caseId);
    const rows = await new Promise<CaseSnapshot[]>((resolve) => {
      request.onsuccess = () => resolve((request.result ?? []) as CaseSnapshot[]);
      request.onerror = () => resolve([]);
    });
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

export async function addSnapshot(
  caseData: CaseData,
  label: string,
  auto = false
): Promise<CaseSnapshot | null> {
  const db = await openDb();
  if (!db) return null;

  const snapshot: CaseSnapshot = {
    id: crypto.randomUUID(),
    caseId: caseData.id,
    at: new Date().toISOString(),
    label,
    auto,
    // Copie profonde : sans elle, le point suivrait les modifications
    // ultérieures du dossier et ne vaudrait plus rien.
    data: JSON.parse(JSON.stringify(caseData)) as CaseData,
  };

  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snapshot);
    await txDone(tx);
  } catch {
    return null;
  }

  await pruneSnapshots(caseData.id);
  return snapshot;
}

export async function deleteSnapshot(id: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

/** Ne garde que les `MAX_SNAPSHOTS_PER_CASE` plus récents d'un dossier. */
export async function pruneSnapshots(caseId: string): Promise<void> {
  const rows = await listSnapshots(caseId);
  if (rows.length <= MAX_SNAPSHOTS_PER_CASE) return;
  const db = await openDb();
  if (!db) return;
  const excess = rows.slice(MAX_SNAPSHOTS_PER_CASE);
  try {
    const tx = db.transaction(STORE, 'readwrite');
    for (const row of excess) tx.objectStore(STORE).delete(row.id);
    await txDone(tx);
  } catch {
    /* Le ménage est accessoire : ne pas faire échouer la création du point. */
  }
}

/* ------------------------------------------------------------------ *
 * Différences entre deux états d'un dossier
 * ------------------------------------------------------------------ */

export interface NodeChange {
  id: string;
  label: string;
  /** Champs modifiés, en clair (« libellé », « cote », « champs », …). */
  changes: string[];
}

export interface CaseDiff {
  addedNodes: { id: string; label: string }[];
  removedNodes: { id: string; label: string }[];
  changedNodes: NodeChange[];
  addedEdges: number;
  removedEdges: number;
  changedEdges: number;
  addedLocations: number;
  removedLocations: number;
}

export function isEmptyDiff(diff: CaseDiff): boolean {
  return (
    diff.addedNodes.length === 0 &&
    diff.removedNodes.length === 0 &&
    diff.changedNodes.length === 0 &&
    diff.addedEdges === 0 &&
    diff.removedEdges === 0 &&
    diff.changedEdges === 0 &&
    diff.addedLocations === 0 &&
    diff.removedLocations === 0
  );
}

function nodeSignature(node: EntityNode): string {
  const data = node.data ?? ({} as EntityNode['data']);
  const grade = readAdmiralty(data.admiralty);
  return JSON.stringify({
    label: data.label ?? '',
    type: data.entityType ?? '',
    notes: data.notes ?? '',
    fields: data.fields ?? {},
    grade: grade ? admiraltyCode(grade) : '',
    photo: data.photoUrl ? 'photo' : '',
  });
}

/**
 * Compare `from` (l'état d'un point) à `to` (l'état courant).
 * Les entités sont appariées par identifiant : un renommage reste une
 * modification, il ne devient pas une suppression plus un ajout.
 */
export function diffCase(from: CaseData, to: CaseData): CaseDiff {
  const fromNodes = new Map<string, EntityNode>();
  for (const node of from.nodes ?? []) fromNodes.set(node.id, node);
  const toNodes = new Map<string, EntityNode>();
  for (const node of to.nodes ?? []) toNodes.set(node.id, node);

  const addedNodes: { id: string; label: string }[] = [];
  const removedNodes: { id: string; label: string }[] = [];
  const changedNodes: NodeChange[] = [];

  for (const [id, node] of toNodes) {
    if (!fromNodes.has(id)) {
      addedNodes.push({ id, label: String(node.data?.label ?? id) });
    }
  }

  for (const [id, node] of fromNodes) {
    const current = toNodes.get(id);
    if (!current) {
      removedNodes.push({ id, label: String(node.data?.label ?? id) });
      continue;
    }
    if (nodeSignature(node) === nodeSignature(current)) continue;

    const changes: string[] = [];
    const before = node.data ?? ({} as EntityNode['data']);
    const after = current.data ?? ({} as EntityNode['data']);
    if ((before.label ?? '') !== (after.label ?? '')) changes.push('libellé');
    if ((before.entityType ?? '') !== (after.entityType ?? '')) changes.push('type');
    if ((before.notes ?? '') !== (after.notes ?? '')) changes.push('notes');
    if (JSON.stringify(before.fields ?? {}) !== JSON.stringify(after.fields ?? {})) changes.push('champs');
    const gradeBefore = readAdmiralty(before.admiralty);
    const gradeAfter = readAdmiralty(after.admiralty);
    if ((gradeBefore ? admiraltyCode(gradeBefore) : '') !== (gradeAfter ? admiraltyCode(gradeAfter) : '')) {
      changes.push('cote');
    }
    if (changes.length === 0) changes.push('photo');
    changedNodes.push({ id, label: String(after.label ?? id), changes });
  }

  const fromEdges = new Map<string, string>();
  for (const edge of from.edges ?? []) {
    fromEdges.set(edge.id, `${edge.source}->${edge.target}|${JSON.stringify(edge.data ?? {})}`);
  }
  const toEdges = new Map<string, string>();
  for (const edge of to.edges ?? []) {
    toEdges.set(edge.id, `${edge.source}->${edge.target}|${JSON.stringify(edge.data ?? {})}`);
  }

  let addedEdges = 0;
  let changedEdges = 0;
  for (const [id, signature] of toEdges) {
    if (!fromEdges.has(id)) addedEdges++;
    else if (fromEdges.get(id) !== signature) changedEdges++;
  }
  let removedEdges = 0;
  for (const id of fromEdges.keys()) {
    if (!toEdges.has(id)) removedEdges++;
  }

  const fromLocations = new Set((from.locations ?? []).map((pin) => pin.id));
  const toLocations = new Set((to.locations ?? []).map((pin) => pin.id));
  let addedLocations = 0;
  for (const id of toLocations) if (!fromLocations.has(id)) addedLocations++;
  let removedLocations = 0;
  for (const id of fromLocations) if (!toLocations.has(id)) removedLocations++;

  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges,
    removedEdges,
    changedEdges,
    addedLocations,
    removedLocations,
  };
}
