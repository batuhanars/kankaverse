<script setup lang="ts">
// Hero — marka + değer önermesi + birincil CTA. Altıgen motif (tasarım imzası).
</script>

<template>
  <header class="hero">
    <!-- Üst bar -->
    <nav class="nav kv-container">
      <a href="/" class="brand" aria-label="Kankaverse ana sayfa">
        <img src="/kankaverse-logo.png" alt="Kankaverse" class="logo" width="171" height="46" />
      </a>
      <a :href="LOGIN_URL" class="kv-btn kv-btn--ghost nav-login">Giriş yap</a>
    </nav>

    <!-- Kahraman -->
    <div class="hero-inner kv-container">
      <div class="hero-copy">
        <span class="eyebrow">Türkiye'nin sohbet evreni</span>
        <h1 class="title">Arkadaşlarınla buluştuğun<br />kendi sohbet evrenin.</h1>
        <p class="lede">
          Kankaverse — toplulukların, oyuncuların ve arkadaş gruplarının sesli ve yazılı buluştuğu
          güvenli sohbet platformu. Türkçe, yerli ve sana göre.
        </p>
        <div class="cta-row">
          <a :href="REGISTER_URL" class="kv-btn kv-btn--primary">Hemen katıl</a>
          <a :href="LOGIN_URL" class="kv-btn kv-btn--ghost">Giriş yap</a>
        </div>
      </div>

      <!-- App görünümü maketi (CSS/HTML) -->
      <LandingAppMock class="hero-mock" />
    </div>
  </header>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(900px 500px at 75% -10%, var(--kv-accent-subtle), transparent 60%),
    var(--kv-bg-rail);
  border-bottom: 1px solid var(--kv-border-subtle);
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 20px;
  padding-bottom: 20px;
}
.brand {
  display: inline-flex;
  align-items: center;
}
.logo {
  height: 46px;
  width: auto;
}

.hero-inner {
  display: grid;
  grid-template-columns: 1fr 1.05fr;
  gap: 56px;
  align-items: center;
  padding-top: 64px;
  padding-bottom: 96px;
}
.eyebrow {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--kv-accent-400);
  margin-bottom: 18px;
}
.title {
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.1;
  font-weight: 700;
  color: var(--kv-text-primary);
  letter-spacing: -0.02em;
}
.lede {
  margin-top: 20px;
  font-size: 17px;
  color: var(--kv-text-secondary);
  max-width: 520px;
}
.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}
@media (max-width: 860px) {
  .hero-inner {
    grid-template-columns: 1fr;
    gap: 40px;
    padding-top: 40px;
    padding-bottom: 64px;
  }
  .hero-mock { display: none; }
  .nav-login { display: none; }
}
</style>
