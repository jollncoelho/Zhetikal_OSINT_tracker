import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { localCapturePlugin } from './vite-plugin-local-capture';
import { themeBootstrapData, THEME_BOOTSTRAP_PLACEHOLDER } from './src/theme/themes';

/**
 * Injecte les palettes de thèmes dans `index.html`.
 *
 * Le script d'amorçage peut ainsi poser les variables `--cyber-*` en style
 * inline sur `<html>` **avant le premier rendu**, sans dépendre d'une feuille
 * de style. Une feuille périmée restée dans le cache du navigateur pouvait
 * sinon écraser une partie des variables et produire un thème hybride.
 *
 * Source unique de vérité : `src/theme/themes.ts` — rien à maintenir en double.
 */
function themeBootstrapPlugin(): Plugin {
  return {
    name: 'zhetikal-theme-bootstrap',
    transformIndexHtml(html: string) {
      if (!html.includes(THEME_BOOTSTRAP_PLACEHOLDER)) return html;
      return html.replace(THEME_BOOTSTRAP_PLACEHOLDER, themeBootstrapData());
    },
  };
}

export default defineConfig({
  plugins: [localCapturePlugin(), themeBootstrapPlugin(), react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
