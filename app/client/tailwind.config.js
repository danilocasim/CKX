/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#c91c36',
          dark: '#a01729',
          light: '#e8334f',
        },
        accent: {
          gold: '#f5a623',
          green: '#10b981',
          blue: '#3b82f6',
        },
        bg: {
          dark: '#0f0f12',
          card: '#1a1a20',
          'card-hover': '#222228',
          surface: '#262630',
        },
        category: {
          ckad: '#8b5cf6',
          cka: '#3b82f6',
          cks: '#ef4444',
          helm: '#06b6d4',
          docker: '#0ea5e9',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
