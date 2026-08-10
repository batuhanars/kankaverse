<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div
    class="min-h-screen overflow-y-auto"
    style="background-color: var(--kv-bg-rail);"
  >
    <div class="max-w-2xl mx-auto px-6 py-10">
      <!-- Başlık -->
      <h1
        class="text-[22px] font-semibold mb-2"
        style="color: var(--kv-text-primary);"
      >
        {{ t('legal.childSafety.title') }}
      </h1>
      <p class="text-[13px] mb-8" style="color: var(--kv-text-muted);">
        {{ t('legal.childSafety.updateNote') }}
      </p>

      <!-- Bölüm 1 — Bu belge neden var -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s1Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s1Body') }}
        </p>
      </section>

      <!-- Bölüm 2 — Kesin yasaklar -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s2Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s2Intro') }}
        </p>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.childSafety.s2Item1') }}</li>
          <li>{{ t('legal.childSafety.s2Item2') }}</li>
          <li>{{ t('legal.childSafety.s2Item3') }}</li>
          <li>{{ t('legal.childSafety.s2Item4') }}</li>
          <li>{{ t('legal.childSafety.s2Item5') }}</li>
          <li>{{ t('legal.childSafety.s2Item6') }}</li>
        </ol>
        <p class="text-[14px] leading-relaxed mt-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s2Note') }}
        </p>
      </section>

      <!-- Bölüm 3 — Korumaların ürüne gömülü hali -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s3Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s3Intro') }}
        </p>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.childSafety.s3Item1') }}</li>
          <li>{{ t('legal.childSafety.s3Item2') }}</li>
          <li>{{ t('legal.childSafety.s3Item3') }}</li>
          <li>{{ t('legal.childSafety.s3Item4') }}</li>
          <li>{{ t('legal.childSafety.s3Item5') }}</li>
          <li>{{ t('legal.childSafety.s3Item6') }}</li>
        </ol>
      </section>

      <!-- Bölüm 4 — Bildirim yolları -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s4Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s4Intro') }}
        </p>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.childSafety.s4Item1') }}</li>
          <li>{{ t('legal.childSafety.s4Item2') }}</li>
          <li>{{ t('legal.childSafety.s4Item3') }}</li>
          <li>{{ t('legal.childSafety.s4Item4') }}</li>
        </ol>
        <p class="text-[14px] leading-relaxed mt-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s4Note') }}
        </p>
      </section>

      <!-- Bölüm 5 — Bildirim geldiğinde ne yapıyoruz -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s5Title') }}
        </h2>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.childSafety.s5Item1') }}</li>
          <li>{{ t('legal.childSafety.s5Item2') }}</li>
          <li>{{ t('legal.childSafety.s5Item3') }}</li>
          <li>{{ t('legal.childSafety.s5Item4') }}</li>
        </ol>
      </section>

      <!-- Bölüm 6 — Hukuki iş birliği -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s6Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s6Body') }}
        </p>
      </section>

      <!-- Bölüm 7 — Sorumluluk sahibimiz -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s7Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s7Intro') }}
        </p>
        <p class="text-[14px] leading-relaxed font-semibold mb-2" style="color: var(--kv-text-primary);">
          <a :href="`mailto:${t('legal.childSafety.s7Email')}`" style="color: var(--kv-accent-500);">{{ t('legal.childSafety.s7Email') }}</a>
        </p>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s7Note') }}
        </p>
      </section>

      <!-- Bölüm 8 — Bu belgenin güncellenmesi -->
      <section class="mb-10">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.childSafety.s8Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.childSafety.s8Body') }}
        </p>
      </section>

      <!-- Geri linki -->
      <div class="mt-8 text-center">
        <RouterLink
          to="/login"
          class="text-[13px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('legal.childSafety.backToLogin') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
