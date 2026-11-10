import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [tailwindcss(), vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // E1 §6.1: tek çekirdek, iki istemci. Paket kopyalanmaz, kaynağından derlenir.
      '@kankaverse/e2ee-core': fileURLToPath(
        new URL('../shared/e2ee-core/src/index.ts', import.meta.url),
      ),
      '@kankaverse/e2ee-client': fileURLToPath(
        new URL('../shared/e2ee-client/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    // Çekirdek web/ dışında (../shared); dev sunucusu oradan dosya servis edebilsin.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        // 127.0.0.1 (localhost değil): localhost Windows'ta önce ::1'e çözülür,
        // backend IPv4'te dinlediğinden proxy aralıklı ECONNREFUSED düşürür.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
    },
  },
})
