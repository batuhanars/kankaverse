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
        {{ t('legal.accountDeletion.title') }}
      </h1>
      <p class="text-[13px] mb-2" style="color: var(--kv-text-muted);">
        {{ t('legal.accountDeletion.updateNote') }}
      </p>
      <p class="text-[14px] leading-relaxed mb-8" style="color: var(--kv-text-secondary);">
        {{ t('legal.accountDeletion.intro') }}
      </p>

      <!-- Bölüm 1 — Hesabını nasıl silersin -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.accountDeletion.s1Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s1Intro') }}
        </p>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.accountDeletion.s1Item1') }}</li>
          <li>{{ t('legal.accountDeletion.s1Item2') }}</li>
          <li>{{ t('legal.accountDeletion.s1Item3') }}</li>
          <li>{{ t('legal.accountDeletion.s1Item4') }}</li>
        </ol>
        <p class="text-[14px] leading-relaxed mt-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s1Note') }}
        </p>
      </section>

      <!-- Bölüm 2 — Sonra ne oluyor -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.accountDeletion.s2Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s2Body1') }}
        </p>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s2Body2') }}
        </p>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s2Body3') }}
        </p>
      </section>

      <!-- Bölüm 3 — Silinen veriler -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.accountDeletion.s3Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s3Intro') }}
        </p>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.accountDeletion.s3Item1') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item2') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item3') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item4') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item5') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item6') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item7') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item8') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item9') }}</li>
          <li>{{ t('legal.accountDeletion.s3Item10') }}</li>
        </ol>
        <p class="text-[14px] leading-relaxed mt-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s3Note') }}
        </p>
      </section>

      <!-- Bölüm 4 — Saklanan veriler ve nedenleri -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.accountDeletion.s4Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s4Intro') }}
        </p>
        <ol class="flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5" style="color: var(--kv-text-secondary);">
          <li>{{ t('legal.accountDeletion.s4Item1') }}</li>
          <li>{{ t('legal.accountDeletion.s4Item2') }}</li>
          <li>{{ t('legal.accountDeletion.s4Item3') }}</li>
        </ol>
        <p class="text-[14px] leading-relaxed mt-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s4Note') }}
        </p>
      </section>

      <!-- Bölüm 5 — Sorularım var -->
      <section class="mb-10">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.accountDeletion.s5Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed mb-2" style="color: var(--kv-text-secondary);">
          {{ t('legal.accountDeletion.s5Intro') }}
        </p>
        <p class="text-[14px] leading-relaxed font-semibold" style="color: var(--kv-text-primary);">
          <a :href="`mailto:${t('legal.accountDeletion.s5Email')}`" style="color: var(--kv-accent-500);">{{ t('legal.accountDeletion.s5Email') }}</a>
        </p>
      </section>

      <!-- Geri linki -->
      <div class="mt-8 text-center">
        <RouterLink
          to="/login"
          class="text-[13px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('legal.accountDeletion.backToLogin') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
