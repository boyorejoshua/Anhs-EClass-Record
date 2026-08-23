import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        /**
         * The staging build is ONE self-contained HTML file, so it must
         * be one chunk; the production build must not be.
         *
         * SheetJS is 363 kB — 123 kB gzipped — and is needed by exactly
         * one screen, used once a term. Shipping it in the entry chunk
         * makes every teacher on a school connection download a
         * spreadsheet parser to open their gradebook. The Import Center
         * loads it on demand instead, and this flag lets the staging
         * build flatten that back into a single file for review.
         */
        inlineDynamicImports: process.env.VITE_SINGLE_FILE === 'true',
      },
    },
  },
  test: { globals: true, environment: 'node' },
});
