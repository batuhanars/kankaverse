<script setup lang="ts">
// Kapanış CTA — davet iste / giriş yap.
</script>

<template>
  <section class="cta">
    <div class="kv-container cta-inner">
      <h2 class="title">Kankaverse'e katıl</h2>
      <p class="sub">
        Şu an davetli üyelikteyiz. Erken erişim için davet iste; davetin varsa giriş yap.
      </p>
      <div class="cta-row">
        <a :href="INVITE_MAILTO" class="kv-btn kv-btn--primary">Davet iste</a>
        <a :href="LOGIN_URL" class="kv-btn kv-btn--ghost">Zaten hesabım var</a>
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

@media (max-width: 860px) {
  .cta { padding: 64px 0; }
}
</style>
