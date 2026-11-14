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
        {{ t('legal.privacy.title') }}
      </h1>
      <p class="text-[13px] mb-8" style="color: var(--kv-text-muted);">
        {{ t('legal.privacy.betaNote') }}
      </p>

      <!-- Bölüm 1 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s1Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.privacy.s1Body') }}
        </p>
      </section>

      <!-- Bölüm 2 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s2Title') }}
        </h2>
        <ul class="flex flex-col gap-2 text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span><strong style="color: var(--kv-text-primary);">{{ t('legal.privacy.s2Item1Label') }}</strong> {{ t('legal.privacy.s2Item1') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span><strong style="color: var(--kv-text-primary);">{{ t('legal.privacy.s2Item2Label') }}</strong> {{ t('legal.privacy.s2Item2') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span><strong style="color: var(--kv-text-primary);">{{ t('legal.privacy.s2Item3Label') }}</strong> {{ t('legal.privacy.s2Item3') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span><strong style="color: var(--kv-text-primary);">{{ t('legal.privacy.s2Item4Label') }}</strong> {{ t('legal.privacy.s2Item4') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span><strong style="color: var(--kv-text-primary);">{{ t('legal.privacy.s2Item5Label') }}</strong> {{ t('legal.privacy.s2Item5') }}</span>
          </li>
        </ul>
      </section>

      <!-- Bölüm 3 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s3Title') }}
        </h2>
        <ul class="flex flex-col gap-2 text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s3Item1') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s3Item2') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s3Item3') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s3Item4') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s3Item5') }}</span>
          </li>
        </ul>
      </section>

      <!-- Bölüm 4 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s4Title') }}
        </h2>
        <ul class="flex flex-col gap-2 text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s4Item1') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s4Item2') }}</span>
          </li>
        </ul>
      </section>

      <!-- Bölüm 5 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s5Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.privacy.s5Body') }}
        </p>
      </section>

      <!-- Bölüm 6 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s6Title') }}
        </h2>
        <ul class="flex flex-col gap-2 text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s6Item1') }}</span>
          </li>
          <li class="flex gap-2">
            <span style="color: var(--kv-accent-500);">•</span>
            <span>{{ t('legal.privacy.s6Item2') }}</span>
          </li>
        </ul>
      </section>

      <!-- Bölüm 7 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s7Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.privacy.s7Body') }}
        </p>
      </section>

      <!-- Bölüm 8 -->
      <section class="mb-7">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s8Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.privacy.s8Body') }}
        </p>
      </section>

      <!-- Bölüm 9 -->
      <section class="mb-10">
        <h2 class="text-[16px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('legal.privacy.s9Title') }}
        </h2>
        <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
          {{ t('legal.privacy.s9Body') }}
        </p>
      </section>

      <!-- Geri linki -->
      <div class="mt-8 text-center">
        <RouterLink
          to="/login"
          class="text-[13px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('legal.privacy.backToLogin') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
