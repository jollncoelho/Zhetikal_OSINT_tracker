/**
 * Système de thèmes — source unique de vérité.
 *
 * Toutes les couleurs de l'interface sont décrites ici sous forme hexadécimale.
 * `themeVariables()` en déduit automatiquement, pour chaque thème :
 *   - la variable hexadécimale  `--cyber-<token>`      (utilisable en CSS / styles inline)
 *   - la variable triplet RGB   `--cyber-<token>-rgb`  (consommée par Tailwind pour
 *                                                        supporter les modificateurs
 *                                                        d'opacité, ex. `bg-cyber-cyan/15`)
 *
 * Ces variables sont appliquées en **style inline sur `<html>`** (voir
 * `applyThemeTokens` dans `ThemeContext.tsx`), et non via une feuille de style :
 * une règle `:root` concurrente arrivée plus tard (feuille périmée restée en
 * cache, ordre d'injection d'HMR…) écrasait les variables hexadécimales tout en
 * laissant les variantes `-rgb`, ce qui produisait un thème hybride moitié
 * sombre / moitié clair. Un style inline sur `<html>` gagne sur toute règle
 * non `!important`, donc le thème ne peut plus être corrompu de l'extérieur.
 *
 * Ajouter un thème = ajouter une entrée dans `THEMES`. Rien d'autre à modifier.
 */

export type ThemeId = 'cyan' | 'amber' | 'magenta' | 'light';
export type ThemeScheme = 'dark' | 'light';

export interface ThemeTokens {
  /** Fond de page. */
  black: string;
  /** Surface principale (barres, panneaux). */
  dark: string;
  /** Surface surélevée (cartes, boutons). */
  panel: string;
  /** Bordures principales. */
  border: string;
  /** Bordures discrètes. */
  borderSubtle: string;
  /** Accent principal — réservé à l'interactif. */
  cyan: string;
  /** Accent principal atténué. */
  cyanDim: string;
  /** Accent secondaire. */
  blue: string;
  /** Accent secondaire foncé. */
  blueDark: string;
  /** Sémantique : succès / confirmé. */
  green: string;
  /** Sémantique : alerte / critique. */
  red: string;
  /** Sémantique : attention. */
  orange: string;
  /** Texte principal. */
  text: string;
  /** Texte secondaire. */
  textDim: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  /** Clé i18n du nom affiché. */
  labelKey: string;
  /** Clé i18n de la description courte. */
  hintKey: string;
  /** Utilisé pour `color-scheme` (contrôles natifs, scrollbars). */
  scheme: ThemeScheme;
  tokens: ThemeTokens;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'cyan',
    labelKey: 'theme.cyan.label',
    hintKey: 'theme.cyan.hint',
    scheme: 'dark',
    tokens: {
      black: '#0a0e17',
      dark: '#0d1321',
      panel: '#111827',
      border: '#1e3a5f',
      borderSubtle: '#22304a',
      cyan: '#00f0ff',
      cyanDim: '#00c8d4',
      blue: '#0ea5e9',
      blueDark: '#0369a1',
      green: '#10b981',
      red: '#ef4444',
      orange: '#f59e0b',
      text: '#e2e8f0',
      textDim: '#94a3b8',
    },
  },
  {
    id: 'amber',
    labelKey: 'theme.amber.label',
    hintKey: 'theme.amber.hint',
    scheme: 'dark',
    tokens: {
      black: '#0b0a08',
      dark: '#12100a',
      panel: '#1a160d',
      border: '#3d3220',
      borderSubtle: '#2b2418',
      cyan: '#ffb020',
      cyanDim: '#d9920f',
      blue: '#e0a020',
      blueDark: '#8a6410',
      green: '#9bbf3f',
      red: '#e0553f',
      orange: '#ffc95c',
      text: '#e8e0cf',
      textDim: '#9c9077',
    },
  },
  {
    id: 'magenta',
    labelKey: 'theme.magenta.label',
    hintKey: 'theme.magenta.hint',
    scheme: 'dark',
    tokens: {
      black: '#0c0a14',
      dark: '#13101c',
      panel: '#1b1628',
      border: '#3f2d63',
      borderSubtle: '#2c2444',
      cyan: '#d946ef',
      cyanDim: '#b02fd0',
      blue: '#7c5cff',
      blueDark: '#4b32b0',
      green: '#34d399',
      red: '#f43f5e',
      orange: '#f59e0b',
      text: '#ece7f5',
      textDim: '#9d95b5',
    },
  },
  {
    id: 'light',
    labelKey: 'theme.light.label',
    hintKey: 'theme.light.hint',
    scheme: 'light',
    tokens: {
      black: '#f2f0ea',
      dark: '#fbfaf7',
      panel: '#ffffff',
      border: '#d8d3c8',
      borderSubtle: '#e6e2d9',
      cyan: '#185fa5',
      cyanDim: '#2a76bd',
      blue: '#378add',
      blueDark: '#0c447c',
      green: '#3b6d11',
      red: '#a32d2d',
      orange: '#ba7517',
      text: '#1f1d1a',
      textDim: '#6b675f',
    },
  },
];

/** Nom de variable CSS associé à chaque token. */
const VAR_NAMES: Record<keyof ThemeTokens, string> = {
  black: 'black',
  dark: 'dark',
  panel: 'panel',
  border: 'border',
  borderSubtle: 'border-subtle',
  cyan: 'cyan',
  cyanDim: 'cyan-dim',
  blue: 'blue',
  blueDark: 'blue-dark',
  green: 'green',
  red: 'red',
  orange: 'orange',
  text: 'text',
  textDim: 'text-dim',
};

const TOKEN_KEYS = Object.keys(VAR_NAMES) as (keyof ThemeTokens)[];

/** `#00f0ff` → `0 240 255` (nécessaire aux modificateurs d'opacité Tailwind). */
export function hexToRgbTriplet(hex: string): string {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value) || full.length !== 6) return '0 0 0';
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/**
 * Toutes les paires (variable, valeur) d'un thème — version hexadécimale ET
 * version triplet RGB, dans l'ordre attendu par `token()` et par Tailwind.
 */
export function themeVariables(theme: ThemeDefinition): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const key of TOKEN_KEYS) {
    const name = VAR_NAMES[key];
    const value = theme.tokens[key];
    pairs.push([`--cyber-${name}`, value]);
    pairs.push([`--cyber-${name}-rgb`, hexToRgbTriplet(value)]);
  }
  return pairs;
}

/**
 * Données d'amorçage injectées dans `index.html` par `themeBootstrapPlugin`
 * (voir `vite.config.ts`). Elles permettent au script d'amorçage de poser les
 * variables **en style inline sur `<html>` avant le premier rendu**, sans
 * dépendre d'une feuille de style.
 */
export function themeBootstrapData(): string {
  return JSON.stringify(
    THEMES.map((theme) => ({
      id: theme.id,
      scheme: theme.scheme,
      bg: theme.tokens.black,
      tokens: themeVariables(theme),
    })),
  );
}

export const DEFAULT_THEME: ThemeId = 'cyan';
export const THEME_STORAGE_KEY = 'zhetikal-theme';
/** Emplacement réservé dans `index.html`, remplacé en dev comme au build. */
export const THEME_BOOTSTRAP_PLACEHOLDER = '__ZHETIKAL_THEME_BOOTSTRAP__';

/* ------------------------------------------------------------------ *
 * Utilitaires pour les styles inline
 *
 * Les composants qui utilisent `style={{ ... }}` ne peuvent pas passer par
 * les classes Tailwind. Ces helpers leur donnent accès aux mêmes tokens,
 * y compris avec de l'opacité.
 * ------------------------------------------------------------------ */

type Alpha = number;

/** `token('panel', 0.5)` → `rgb(var(--cyber-panel-rgb) / 0.5)` */
export function token(name: string, alpha: Alpha = 1): string {
  return `rgb(var(--cyber-${name}-rgb) / ${alpha})`;
}

/** `#0ea5e9` + 0.35 → assombrit la couleur (pour rester lisible sur fond clair). */
export function darken(hex: string, amount: number): string {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value) || full.length !== 6) return hex;
  const scale = Math.max(0, Math.min(1, 1 - amount));
  const r = Math.round(((value >> 16) & 255) * scale);
  const g = Math.round(((value >> 8) & 255) * scale);
  const b = Math.round((value & 255) * scale);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

/** Luminance relative WCAG (0 = noir, 1 = blanc). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Luminance maximale tolérée sur une surface claire : elle garantit un
 * contraste ≥ 4,5:1 sur du blanc (`1,05 / (L + 0,05) ≥ 4,5`).
 */
const LIGHT_TARGET_LUMINANCE = 0.18;

/**
 * Les couleurs d'entités sont une légende : elles gardent leur teinte quel que
 * soit le thème. En thème clair on les assombrit simplement pour qu'elles
 * restent lisibles sur les surfaces blanches.
 *
 * Le facteur fixe de 38 % suffit pour les teintes saturées, mais **pas** pour
 * les couleurs de légende très claires : le gris de X (`#e7e9ea`) ou le cyan de
 * TikTok (`#00f2ea`) restaient à ~3,2:1 sur blanc, sous le seuil de lisibilité
 * du texte. On continue donc d'assombrir par paliers jusqu'à atteindre la
 * luminance cible — les teintes déjà sombres ne bougent pas.
 */
export function entityTone(hex: string, scheme: ThemeScheme): string {
  if (scheme !== 'light') return hex;
  let rgb = hexToRgb(darken(hex, 0.38));
  if (!rgb) return darken(hex, 0.38);
  let guard = 0;
  while (relativeLuminance(rgb) > LIGHT_TARGET_LUMINANCE && guard < 32) {
    rgb = [rgb[0] * 0.93, rgb[1] * 0.93, rgb[2] * 0.93];
    guard += 1;
  }
  return rgbToHex(rgb);
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
