import { fileURLToPath, URL } from 'node:url';

// Mobil E2EE adaptör testleri (cihazsız, Node). Mobilin kendi test altyapısı yok; vitest, depodaki onaylı
// kopyadan (shared/e2ee-client devDependency) çalıştırılır, mobile/package.json'a yeni bağımlılık EKLENMEZ
// (bu yüzden `vitest/config` import edilmez, düz nesne). Yalnız platformdan bağımsız mantık sınanır
// (şifreleme, silme, polyfill); native modüller (expo-*) import edilmez.
export default {
  resolve: {
    alias: {
      '@kankaverse/e2ee-core': fileURLToPath(new URL('../../shared/e2ee-core/src/index.ts', import.meta.url)),
      '@kankaverse/e2ee-client': fileURLToPath(new URL('../../shared/e2ee-client/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], root: fileURLToPath(new URL('..', import.meta.url)) },
};
