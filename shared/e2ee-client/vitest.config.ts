import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Çekirdek kaynağından (kopyasız). Node ortamı: WebCrypto Node'un kendisi, depo bellekte (MemoryVault).
export default defineConfig({
  resolve: {
    alias: {
      '@kankaverse/e2ee-core': fileURLToPath(new URL('../e2ee-core/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30000 },
})
