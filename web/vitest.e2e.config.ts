import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Gerçek API'ye karşı uçtan uca deneme (varsayılan `npm test` buna girmez). Bkz. e2e/e2ee.e2e.test.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@kankaverse/e2ee-core': fileURLToPath(
        new URL('../shared/e2ee-core/src/index.ts', import.meta.url),
      ),
      '@kankaverse/e2ee-client': fileURLToPath(
        new URL('../shared/e2ee-client/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node', include: ['e2e/**/*.e2e.test.ts'], testTimeout: 120000 },
})
