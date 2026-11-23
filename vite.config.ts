import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});