import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      // The real `server-only` guard throws outside an RSC; stub it so server
      // modules can be unit-tested in jsdom.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Explicit rather than inherited: `src/test/setup.ts` raises Testing
    // Library's async-query budget and must stay strictly below this, so the
    // relationship is only checkable if both numbers are written down.
    testTimeout: 5000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
  },
});
