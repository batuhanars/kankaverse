<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bölümler i18n anahtarlarından türetilir (template tekrarını azaltır).
const sections = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']
</script>

<template>
  <div class="min-h-screen overflow-y-auto" style="background-color: var(--kv-bg-rail)">
    <div class="max-w-2xl mx-auto px-6 py-10">
      <!-- Başlık -->
      <h1 class="text-[22px] font-semibold mb-3" style="color: var(--kv-text-primary)">
        {{ t('legal.rules.title') }}
      </h1>
      <p class="text-[14px] leading-relaxed mb-8" style="color: var(--kv-text-secondary)">
        {{ t('legal.rules.intro') }}
      </p>

      <!-- Kurallar -->
      <section v-for="s in sections" :key="s" class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary)">
          {{ t(`legal.rules.${s}Title`) }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary)">
          {{ t(`legal.rules.${s}Body`) }}
        </p>
      </section>

      <!-- Kapanış -->
      <p class="text-[14px] leading-relaxed mb-10" style="color: var(--kv-text-secondary)">
        {{ t('legal.rules.closing') }}
      </p>

      <!-- Geri linki -->
      <div class="mt-8 text-center">
        <RouterLink to="/login" class="text-[13px]" style="color: var(--kv-text-muted)">
          {{ t('legal.rules.backToLogin') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
