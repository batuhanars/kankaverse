<script setup lang="ts">
/**
 * ProfileConnections - C36 §6.2: profil kartı/paneli/tam profil için bağlı Kick/Twitch satırları.
 * Platform simgesi + kullanıcı adı; tıklayınca yeni sekme (noopener noreferrer). Boşsa hiçbir şey çizmez.
 */
import { useI18n } from 'vue-i18n'
import PlatformLogo from './PlatformLogo.vue'
import type { ProfileConnectionDto } from '@/types'

defineProps<{ connections?: ProfileConnectionDto[] }>()
const { t } = useI18n()
</script>

<template>
  <section v-if="connections && connections.length > 0">
    <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
      {{ t('connections.profileTitle') }}
    </h3>
    <ul class="flex flex-col gap-1.5">
      <li v-for="c in connections" :key="c.provider">
        <a
          :href="c.url"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 min-w-0 max-w-full text-[13px] hover:underline"
          style="color: var(--kv-text-body);"
        >
          <PlatformLogo :provider="c.provider" :size="16" />
          <span class="truncate">{{ c.username }}</span>
        </a>
      </li>
    </ul>
  </section>
</template>
