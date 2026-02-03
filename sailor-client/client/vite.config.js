import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use environment variable or default to Docker nginx port
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:30080';
const USE_DOCKER = !process.env.VITE_BACKEND_URL;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        // If using Docker (nginx), prepend /facilitator
        // If using facilitator directly, no rewrite needed
        rewrite: USE_DOCKER
          ? (path) => `/facilitator${path}`
          : undefined,
      },
    },
  },
});
