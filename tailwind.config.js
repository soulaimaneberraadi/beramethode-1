/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  // Classes construites dynamiquement (ex. `bg-${section.theme}-600` dans
  // Chronometrage) — le JIT ne les voit pas dans le source, on les protège ici.
  safelist: [
    {
      pattern:
        /^(bg|text|border)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray)-(500|600|700)$/,
    },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      // Échelons intermédiaires utilisés dans le code mais absents de la palette
      // Tailwind par défaut. Sans eux, `bg-red-650` ne produit AUCUNE règle CSS
      // (bouton blanc sur blanc → invisible).
      spacing: {
        '4.5': '1.125rem',
        '7.5': '1.875rem',
        '8.5': '2.125rem',
        '10.5': '2.625rem',
      },
      colors: {
        slate: {
          55:  '#fbfcfd', 150: '#eaeef4', 250: '#d7dee9', 350: '#b0bccd',
          450: '#7c8ca2', 550: '#56657a', 650: '#3d4b5f', 750: '#293548',
          850: '#172033',
        },
        indigo: { 150: '#d4ddff', 650: '#493fd8', 750: '#3d34b7', 850: '#342f92' },
        red:    { 55:  '#fff7f7', 550: '#e63535', 650: '#cb2121' },
        rose:   { 850: '#941338' },
        gray:   { 750: '#2b3544' },
        amber:  { 250: '#fcdd6c' },
        emerald:{ 250: '#8bedc4' },
        dk: {
          bg:            '#14211C',
          surface:       '#1D2E28',
          elevated:      '#26392F',
          border:        '#2E463C',
          'border-soft': '#243A31',
          text:          '#EAF1ED',
          'text-soft':   '#C2D2CA',
          muted:         '#9DB5AB',
          accent:        '#2F9E64',
          'accent-hover':'#37B473',
          'accent-text': '#6EE7B7',
        },
      },
    },
  },
  plugins: [],
};
