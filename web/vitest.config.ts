import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Birim testleri (E1 yerel depo + akış). Ortam Node: IndexedDB `fake-indexeddb` ile, WebCrypto Node'un kendisi.
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
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30000 },
})
