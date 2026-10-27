<script setup lang="ts">
/**
 * DiscoverGuildCard — Keşfet grid kartı. Afiş (yüklenmiş görsel varsa o, yoksa bannerColor→gradient) +
 * altıgen ikon + ad + açıklama + üye sayısı + etiket çipleri + Katıl.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KvButton from '@/components/ui/KvButton.vue'
import { bannerBackground } from '@/utils/bannerColor'
import { guildBannerSrc, guildIconSrc } from '@/utils/animatedMedia'
import type { DiscoveryGuildDto } from '@/types'

const props = defineProps<{
  guild: DiscoveryGuildDto
  joining: boolean
  isMember?: boolean // zaten üyeyim → kartın tamamı tıklanır, ortama gider (sahip kararı 2026-10-27)
  // C19 §7.1: 'hover' = kart üzerine gelince/odaklanınca simge+afiş oynar; 'always' = sürekli (öneri bloğu)
  animate?: 'always' | 'hover'
}>()
const emit = defineEmits<{ join: []; open: [] }>()

const { t } = useI18n()

// C19 §7: hareketli simge/afiş (azaltılmış harekette statik)
// Azaltılmış hareket kararı yardımcılarda; burada yalnız hover/odak kapısı.
const engaged = ref(false)
const playing = computed(() => (props.animate ?? 'hover') === 'always' || engaged.value)
const bannerSrc = computed(() => (playing.value ? guildBannerSrc(props.guild) : (props.guild.bannerUrl ?? null)))
const iconSrc = computed(() => guildIconSrc(props.guild, playing.value))

// focus-within: odak kart içinde bir çocuktan diğerine geçerken kapanmasın
function onFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  if (!next || !(e.currentTarget as HTMLElement).contains(next)) engaged.value = false
}

// Üye olunan ortamda kartın tamamı bağlantıdır; üye olmayanda katılma yalnız açık "Katıl" düğmesiyle
// (yanlışlıkla katılma olmasın).
function onCardActivate() {
  if (props.isMember) emit('open')
}

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
    :class="isMember ? 'cursor-pointer transition-colors hover:border-[var(--kv-border-strong)]' : ''"
    style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-sidebar);"
    :role="isMember ? 'link' : undefined"
    :tabindex="isMember ? 0 : undefined"
    @click="onCardActivate"
    @keydown.enter="onCardActivate"
    @mouseenter="engaged = true"
    @mouseleave="engaged = false"
    @focusin="engaged = true"
    @focusout="onFocusOut"
  >
    <!-- Afiş: yüklenmiş görsel varsa o, yoksa renk gradient -->
    <div class="relative h-20 shrink-0" :style="bannerStyle">
      <img
        v-if="bannerSrc"
        :src="bannerSrc"
        :alt="guild.name"
        class="absolute inset-0 w-full h-full object-cover"
      />
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
            v-if="iconSrc"
            :src="iconSrc"
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
        <!-- Üye değilse Katıl; üyeyse düğme yok, kartın tamamı ortama götürür -->
        <KvButton v-if="!isMember" size="sm" :loading="joining" @click="$emit('join')">
          {{ t('discover.join') }}
        </KvButton>
      </div>
    </div>
  </article>
</template>
