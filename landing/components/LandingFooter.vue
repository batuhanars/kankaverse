<script setup lang="ts">
// Footer — marka, telif, yasal/iletişim linkleri.
</script>

<template>
  <footer class="footer">
    <div class="kv-container footer-inner">
      <a href="/" class="brand" aria-label="Kankaverse ana sayfa">
        <img src="/kankaverse-logo.png" alt="Kankaverse" class="logo" width="178" height="48" />
      </a>
      <nav class="links">
        <a :href="PRIVACY_URL">Gizlilik</a>
        <a :href="LOGIN_URL">Giriş yap</a>
        <a :href="CONTACT_MAILTO">İletişim</a>
      </nav>
    </div>
    <div class="kv-container copyright">© 2026 Kankaverse. Türkiye'de tasarlandı.</div>
  </footer>
</template>

<style scoped>
.footer {
  padding: 40px 0 32px;
  background: var(--kv-bg-rail);
  border-top: 1px solid var(--kv-border-subtle);
}
.footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.brand {
  display: inline-flex;
  align-items: center;
}
.logo {
  height: 48px;
  width: auto;
}
.links {
  display: flex;
  gap: 24px;
}
.links a {
  font-size: 14px;
  color: var(--kv-text-secondary);
  transition: color 0.15s ease;
}
.links a:hover {
  color: var(--kv-accent-400);
}
.copyright {
  margin-top: 24px;
  font-size: 13px;
  color: var(--kv-text-muted);
}
</style>
