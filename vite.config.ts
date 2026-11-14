/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
