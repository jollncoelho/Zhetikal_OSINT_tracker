import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_THEME,
  entityTone as entityToneFor,
  getTheme,
  isThemeId,
  THEMES,
  THEME_STORAGE_KEY,
  themeVariables,
  type ThemeDefinition,
  type ThemeId,
  type ThemeScheme,
} from './themes';

/**
 * Applique le thème en **styles inline sur `<html>`**.
 *
 * Pourquoi pas une feuille de style ? Parce qu'une autre règle `:root` peut
 * arriver après la nôtre (feuille périmée restée dans le cache du navigateur,
 * ordre d'injection d'HMR…) et n'écraser qu'une partie des variables : celles
 * en hexadécimal étaient reprises par l'ancienne palette sombre, tandis que les
 * variantes `-rgb` (que l'ancienne palette ne définissait pas) restaient sur le
 * thème courant. Résultat : un thème hybride, moitié sombre / moitié clair.
 *
 * Un style inline sur `<html>` a la priorité sur toute règle non `!important` :
 * le thème ne peut donc plus être corrompu de l'extérieur.
 */
function applyThemeTokens(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  const theme = getTheme(id);
  const root = document.documentElement;

  for (const [name, value] of themeVariables(theme)) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.scheme;
  root.style.backgroundColor = theme.tokens.black;
  root.dataset.theme = id;
}

function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    /* localStorage indisponible — on retombe sur le thème par défaut */
  }
  return DEFAULT_THEME;
}

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDefinition;
  themes: ThemeDefinition[];
  /** `dark` ou `light` — utile pour adapter les couleurs de légende. */
  scheme: ThemeScheme;
  /** Adapte une couleur d'entité au thème courant (assombrie si le fond est clair). */
  entityTone: (hex: string) => string;
  setTheme: (id: ThemeId) => void;
  /** Alterne entre le thème courant et le thème sombre suivant. */
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Le thème est appliqué dès l'initialisation du state, donc avant le premier
  // rendu : aucun flash de couleur.
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const initial = readStoredTheme();
    applyThemeTokens(initial);
    return initial;
  });

  useEffect(() => {
    applyThemeTokens(themeId);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      /* persistance best-effort */
    }
  }, [themeId]);

  const cycleTheme = useCallback(() => {
    setThemeId((current) => {
      const index = THEMES.findIndex((theme) => theme.id === current);
      return THEMES[(index + 1) % THEMES.length].id;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const current = getTheme(themeId);
    return {
      themeId,
      theme: current,
      themes: THEMES,
      scheme: current.scheme,
      entityTone: (hex: string) => entityToneFor(hex, current.scheme),
      setTheme: setThemeId,
      cycleTheme,
    };
  }, [themeId, cycleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
