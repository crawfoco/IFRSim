/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets VITE_BASE.
  // Local dev, preview and e2e stay at the root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/sim/**'],
      reporter: ['text', 'html'],
    },
  },
});
