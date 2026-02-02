/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#c91c36',
          600: '#a01729',
          700: '#8b1323',
          800: '#6f101c',
          900: '#5a0d17',
          950: '#450a12',
        },
        sailor: {
          dark: '#1a1a2e',
          darker: '#0f0f1a',
          card: '#242442',
          accent: '#c91c36',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
