import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    hmr: {
      overlay: false // Désactive l'affichage rouge de blocage pour forcer l'application à tourner
    }
  }
});