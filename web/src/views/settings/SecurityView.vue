<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TwoFactorSection from './components/TwoFactorSection.vue'
import SessionsSection from './components/SessionsSection.vue'
import ChangePasswordSection from './components/ChangePasswordSection.vue'
import ChangeEmailSection from './components/ChangeEmailSection.vue'
import DeleteAccountSection from './components/DeleteAccountSection.vue'

const { t } = useI18n()
</script>

<template>
  <div class="min-h-screen py-8 px-4" style="background-color: var(--kv-bg-rail);">
    <div class="max-w-xl mx-auto">
      <div class="flex items-center gap-4 mb-8">
        <RouterLink :to="{ name: 'app' }" class="text-[13px]" style="color: var(--kv-text-muted);">
          ← {{ t('security.backToApp') }}
        </RouterLink>
        <h1 class="text-[22px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('security.title') }}
        </h1>
      </div>

      <div class="flex flex-col gap-4">
        <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
          <TwoFactorSection />
        </section>
        <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
          <SessionsSection />
        </section>
        <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
          <ChangePasswordSection />
        </section>
        <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
          <ChangeEmailSection />
        </section>
        <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
          <DeleteAccountSection />
        </section>
      </div>
    </div>
  </div>
</template>
