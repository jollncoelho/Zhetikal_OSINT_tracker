import type { EntityData } from '../types';
import { admiraltyCode, readAdmiralty } from '../types';

/** Minuscules + suppression des accents, pour une recherche tolérante. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Texte indexé pour un nœud : libellé, type, notes et champs personnalisés.
 * La cote amirauté y entre aussi, pour que taper « B2 » ou « c3 » isole
 * directement les entités faiblement sourcées — c'est un usage courant en
 * relecture de dossier.
 */
export function nodeHaystack(data: EntityData): string {
  const fields = data.fields
    ? Object.values(data.fields)
        .map((value) => String(value ?? ''))
        .join(' ')
    : '';
  const grade = readAdmiralty(data.admiralty);
  const admiralty = grade ? `${admiraltyCode(grade)} admiralty ${grade.source}${grade.credibility}` : '';
  return normalize(`${data.label} ${data.entityType} ${data.notes ?? ''} ${fields} ${admiralty}`);
}

/**
 * Tous les termes de la requête doivent apparaître dans le nœud.
 * Une requête vide (ou composée d'espaces) correspond à tout.
 */
export function matchesQuery(data: EntityData, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = nodeHaystack(data);
  return terms.every((term) => haystack.includes(term));
}
