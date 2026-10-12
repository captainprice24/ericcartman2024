import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works when served from any path
  // (e.g. a hosted artifact URL), not just the domain root.
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // pdfjs-dist ships a worker as a separate asset; Vite handles it via ?url imports in code.
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdf-lib'],
  },
});
