<script setup lang="ts">
// Değer önermesi — "ne işe yarar" üç kart.
const items = [
  {
    title: 'Sesli & yazılı sohbet',
    body: 'Düşük gecikmeli ses kanalları, anlık mesajlaşma ve topluluk sunucuları. Konuş, yaz, paylaş.',
  },
  {
    title: 'Topluluğunu kur',
    body: 'Sunucular, kanallar ve roller — kendi düzenini kur, ekibini topla, kurallarını sen belirle.',
  },
  {
    title: 'Yerli ve sana yakın',
    body: 'Baştan sona Türkçe arayüz, Türkçe destek ve yerel ödeme. Yurt dışına bağımlı değil.',
  },
]
</script>

<template>
  <section class="value">
    <div class="kv-container">
      <h2 class="section-title">Topluluğun için tek yer</h2>
      <div class="grid">
        <article v-for="item in items" :key="item.title" class="card">
          <span class="dot" aria-hidden="true" />
          <h3 class="card-title">{{ item.title }}</h3>
          <p class="card-body">{{ item.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.value {
  padding: 88px 0;
  background: var(--kv-bg-content);
}
.section-title {
  font-size: clamp(26px, 3.5vw, 34px);
  font-weight: 700;
  color: var(--kv-text-primary);
  letter-spacing: -0.01em;
  margin-bottom: 40px;
  text-align: center;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.card {
  background: var(--kv-bg-elevated);
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-lg);
  padding: 28px;
}
.dot {
  display: block;
  width: 36px;
  height: 36px;
  border-radius: var(--kv-radius-md);
  background: var(--kv-accent-subtle);
  margin-bottom: 18px;
  position: relative;
}
.dot::after {
  content: '';
  position: absolute;
  inset: 11px;
  background: var(--kv-accent-500);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
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
  .value { padding: 56px 0; }
  .grid { grid-template-columns: 1fr; }
}
</style>
