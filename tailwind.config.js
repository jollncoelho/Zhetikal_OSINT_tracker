/** @type {import('tailwindcss').Config} */

// Toutes les couleurs `cyber-*` sont résolues à l'exécution depuis les variables CSS
// injectées par `src/theme/themes.ts`. Le triplet RGB permet de conserver les
// modificateurs d'opacité (ex. `bg-cyber-cyan/15`).
const token = (name) => `rgb(var(--cyber-${name}-rgb) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          black: token('black'),
          dark: token('dark'),
          panel: token('panel'),
          border: token('border'),
          'border-subtle': token('border-subtle'),
          cyan: token('cyan'),
          'cyan-dim': token('cyan-dim'),
          blue: token('blue'),
          'blue-dark': token('blue-dark'),
          green: token('green'),
          red: token('red'),
          orange: token('orange'),
          text: token('text'),
          'text-dim': token('text-dim'),
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
