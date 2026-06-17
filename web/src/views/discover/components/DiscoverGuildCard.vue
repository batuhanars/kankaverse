<script setup lang="ts">
/**
 * DiscoverGuildCard — Keşfet grid kartı. Renk afişi (bannerColor→gradient) + altıgen ikon +
 * ad + açıklama + üye sayısı + etiket çipleri + Katıl. Görsel afiş YOK (yalnız renk preset).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import KvButton from '@/components/ui/KvButton.vue'
import { bannerBackground } from '@/utils/bannerColor'
import type { DiscoveryGuildDto } from '@/types'

const props = defineProps<{
  guild: DiscoveryGuildDto
  joining: boolean
  isMember?: boolean // zaten üyeyim → "Katıl" yerine "Sunucuya Git" (Görsel #35)
}>()
defineEmits<{ join: []; open: [] }>()

const { t } = useI18n()

const bannerStyle = computed(() => ({ background: bannerBackground(props.guild.bannerColor) }))

function guildInitial(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}
</script>

<template>
  <article
    class="flex flex-col rounded-[var(--kv-radius-lg)] border overflow-hidden"
    style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-sidebar);"
  >
    <!-- Renk afişi -->
    <div class="relative h-20 shrink-0" :style="bannerStyle">
      <!-- Afişe binen altıgen ikon -->
      <div class="absolute -bottom-5 left-4">
        <div
          class="flex items-center justify-center overflow-hidden text-[15px] font-semibold"
          style="
            width: 48px;
            height: 48px;
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            background-color: var(--kv-bg-elevated);
            color: var(--kv-text-secondary);
          "
        >
          <img
            v-if="guild.iconUrl"
            :src="guild.iconUrl"
            :alt="guild.name"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ guildInitial(guild.name) }}</span>
        </div>
      </div>
    </div>

    <!-- Gövde -->
    <div class="flex flex-col flex-1 px-4 pt-7 pb-4 gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <h3 class="text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
          {{ guild.name }}
        </h3>
        <span
          v-if="guild.adultsOnly"
          class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
          style="background-color: var(--kv-danger-subtle); color: var(--kv-danger);"
        >
          18+
        </span>
      </div>

      <p
        v-if="guild.description"
        class="text-[13px] line-clamp-2"
        style="color: var(--kv-text-muted);"
      >
        {{ guild.description }}
      </p>

      <!-- Etiket çipleri -->
      <div v-if="guild.tags.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in guild.tags"
          :key="tag"
          class="text-[11px] px-2 py-0.5 rounded-full"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
        >
          {{ tag }}
        </span>
      </div>

      <!-- Alt satır: üye sayısı + Katıl -->
      <div class="flex items-center justify-between gap-2 mt-auto pt-2">
        <span class="text-[12px] font-medium" style="color: var(--kv-text-muted);">
          {{ t('discover.memberCount', { count: guild.memberCount }) }}
        </span>
        <!-- Zaten üye → Sunucuya Git; değilse Katıl -->
        <KvButton v-if="isMember" size="sm" variant="ghost" @click="$emit('open')">
          {{ t('discover.goToServer') }}
        </KvButton>
        <KvButton v-else size="sm" :loading="joining" @click="$emit('join')">
          {{ t('discover.join') }}
        </KvButton>
      </div>
    </div>
  </article>
</template>
