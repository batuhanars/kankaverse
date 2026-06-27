<script setup lang="ts">
// Kapanış CTA — hemen kaydol / giriş yap. (Davet modu geri gelince INVITE_MAILTO'ya çevir.)
</script>

<template>
  <section class="cta">
    <div class="kv-container cta-inner">
      <h2 class="title">Kankaverse'e katıl</h2>
      <p class="sub">
        Birkaç dakikada hesabını oluştur, kendi sohbet evrenini kurmaya başla.
      </p>
      <div class="cta-row">
        <a :href="REGISTER_URL" class="kv-btn kv-btn--primary">Hemen katıl</a>
        <a :href="LOGIN_URL" class="kv-btn kv-btn--ghost">Zaten hesabım var</a>
      </div>

      <!-- Masaüstü uygulaması — Windows ve Linux build'leri hazır; macOS yakında. -->
      <div class="download">
        <div class="download-row">
          <a :href="DOWNLOAD_WIN_URL" class="download-link" download>
            <svg class="download-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3 5.7 10.5 4.6v6.9H3V5.7Zm0 12.6 7.5 1.1v-6.8H3v5.7Zm8.6 1.3L21 21v-9.3h-9.4v7.9Zm0-15.9v7.9H21V3l-9.4 1.7Z"
              />
            </svg>
            <span>Windows için indir</span>
          </a>
          <a :href="DOWNLOAD_LINUX_URL" class="download-link" download>
            <svg class="download-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2c-2 0-3.2 1.7-3.2 3.9 0 1.3.3 2 .3 2.9 0 .8-.6 1.5-1.4 2.6-1 1.3-2.3 2.8-2.3 4.8 0 .7.2 1.2.5 1.6-.3.3-.5.7-.5 1.2 0 1.3 1.4 1.8 3 2.1 1.1.2 1.7.8 2.7.8s1.6-.6 2.7-.8c1.6-.3 3-.8 3-2.1 0-.5-.2-.9-.5-1.2.3-.4.5-.9.5-1.6 0-2-1.3-3.5-2.3-4.8-.8-1.1-1.4-1.8-1.4-2.6 0-.9.3-1.6.3-2.9C15.2 3.7 14 2 12 2Z"
              />
            </svg>
            <span>Linux için indir</span>
          </a>
        </div>
        <p class="download-note">Masaüstü uygulaması (Windows 10/11 · Linux AppImage). macOS yakında.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta {
  padding: 96px 0;
  background: var(--kv-bg-content);
}
.cta-inner {
  text-align: center;
}
.title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  color: var(--kv-text-primary);
  letter-spacing: -0.01em;
}
.sub {
  margin: 18px auto 0;
  max-width: 480px;
  font-size: 16px;
  color: var(--kv-text-secondary);
}
.cta-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.download {
  margin-top: 28px;
}
.download-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px 28px;
}
.download-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--kv-text-primary);
  transition: color 0.15s ease;
}
.download-link:hover {
  color: var(--kv-accent-400);
}
.download-icon {
  flex-shrink: 0;
}
.download-note {
  margin-top: 8px;
  font-size: 13px;
  color: var(--kv-text-muted);
}

@media (max-width: 860px) {
  .cta { padding: 64px 0; }
}
</style>
