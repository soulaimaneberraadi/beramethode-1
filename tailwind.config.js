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
      colors: {
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
