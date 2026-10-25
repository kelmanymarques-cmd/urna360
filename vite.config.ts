import { defineConfig } from 'vitest/config';

// Em desenvolvimento, /api é encaminhado ao proxy Node (server/proxy.mjs, porta 8787).
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
