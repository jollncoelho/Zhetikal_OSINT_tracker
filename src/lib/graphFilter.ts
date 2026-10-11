import type { EntityData } from '../types';

/** Minuscules + suppression des accents, pour une recherche tolérante. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Texte indexé pour un nœud : libellé, type, notes et champs personnalisés. */
export function nodeHaystack(data: EntityData): string {
  const fields = data.fields
    ? Object.values(data.fields)
        .map((value) => String(value ?? ''))
        .join(' ')
    : '';
  return normalize(`${data.label} ${data.entityType} ${data.notes ?? ''} ${fields}`);
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
