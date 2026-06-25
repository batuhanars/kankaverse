<script setup lang="ts">
// Güvenlik — Kankaverse'in temel farklılaştırıcısı. Mimariye gömülü güven & güvenlik.
const items = [
  {
    title: 'Çocuk güvenliği',
    body: 'Platformun temelinde. Yaşa uygun deneyim, sıkı içerik kontrolü ve istismara karşı tasarımla koruma. Sonradan eklenen bir özellik değil.',
  },
  {
    title: 'KVKK uyumu',
    body: 'Verilerin KVKK’ya uygun, şeffaf biçimde işlenir. Hangi verinin nerede olduğu senin kontrolünde.',
  },
  {
    title: 'Türkçe moderasyon',
    body: 'İçeriği gerçekten anlayan Türkçe moderasyon araçları ve ekibi. Yerel bağlama duyarlı, hızlı müdahale.',
  },
]
</script>

<template>
  <section class="safety">
    <div class="kv-container">
      <div class="head">
        <span class="eyebrow">Güven &amp; güvenlik</span>
        <h2 class="section-title">Güvenlik sonradan eklenmedi.<br />Mimariye gömülü.</h2>
        <p class="sub">
          Kankaverse, Türkiye için sıfırdan tasarlandı. Güvenlik, gizlilik ve çocuk koruması
          ürünün temelinde; bir eklenti değil.
        </p>
      </div>
      <div class="grid">
        <article v-for="item in items" :key="item.title" class="card">
          <h3 class="card-title">{{ item.title }}</h3>
          <p class="card-body">{{ item.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.safety {
  padding: 88px 0;
  background:
    radial-gradient(700px 400px at 50% 0%, var(--kv-accent-subtle), transparent 60%),
    var(--kv-bg-rail);
  border-top: 1px solid var(--kv-border-subtle);
  border-bottom: 1px solid var(--kv-border-subtle);
}
.head {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 44px;
}
.eyebrow {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--kv-accent-400);
  margin-bottom: 16px;
}
.section-title {
  font-size: clamp(26px, 3.5vw, 36px);
  font-weight: 700;
  color: var(--kv-text-primary);
  letter-spacing: -0.01em;
}
.sub {
  margin-top: 18px;
  font-size: 16px;
  color: var(--kv-text-secondary);
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.card {
  background: var(--kv-bg-content);
  border: 1px solid var(--kv-border-strong);
  border-radius: var(--kv-radius-lg);
  padding: 28px;
}
.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--kv-text-primary);
  margin-bottom: 10px;
}
.card-body {
  font-size: 15px;
  color: var(--kv-text-secondary);
}

@media (max-width: 860px) {
  .safety { padding: 56px 0; }
  .grid { grid-template-columns: 1fr; }
}
</style>
