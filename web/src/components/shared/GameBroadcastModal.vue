<script setup lang="ts">
/**
 * C31c §4 — oyunu yayınla penceresi (yalnız masaüstü). Kullanıcının erişebildiği VE ekran paylaşımı
 * izinli ses kanallarını listeler (uygunluk: utils/screenShare). Seçilince kanala katılır, ardından
 * mevcut ekran paylaşım akışı (ses çubuğu: ipucu + nudge + seçici onayı) başlar. Yeni paylaşım yolu yok.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useActivityStore } from '@/stores/activity'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import { useVoiceStore } from '@/stores/voice'
import { channelAllowsScreenShare } from '@/utils/screenShare'
import { readRecentVoiceChannels } from '@/utils/recentVoiceChannels'
import GameLogo from '@/components/shared/GameLogo.vue'
import type { ChannelDto } from '@/types'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const router = useRouter()
const activityStore = useActivityStore()
const authStore = useAuthStore()
const channelsStore = useChannelsStore()
const guildsStore = useGuildsStore()
const toastStore = useToastStore()
const voiceStore = useVoiceStore()

const query = ref('')
const activeIndex = ref(0)
const joining = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)

const game = computed(() => activityStore.myGame())

interface Row {
  channel: ChannelDto
  guildName: string
}

/** Üye olunan ortamların uygun ses kanalları (kanal listesi yüklü değilse onMounted çeker). */
const eligible = computed<Row[]>(() => {
  const isMinor = authStore.user?.isMinor === true
  const rows: Row[] = []
  for (const guild of guildsStore.guilds) {
    for (const channel of channelsStore.channelsForGuild(guild.id)) {
      if (channelAllowsScreenShare(channel, isMinor)) rows.push({ channel, guildName: guild.name })
    }
  }
  return rows
})

const recent = computed<Row[]>(() => {
  const byId = new Map(eligible.value.map((r) => [r.channel.id, r]))
  return readRecentVoiceChannels()
    .map((id) => byId.get(id))
    .filter((r): r is Row => !!r)
})

const searching = computed(() => query.value.trim().length > 0)
const rows = computed<Row[]>(() => {
  if (searching.value) {
    const q = query.value.trim().toLocaleLowerCase('tr')
    return eligible.value.filter(
      (r) =>
        (r.channel.name ?? '').toLocaleLowerCase('tr').includes(q) ||
        r.guildName.toLocaleLowerCase('tr').includes(q),
    )
  }
  return recent.value.length > 0 ? recent.value : eligible.value
})

const heading = computed(() =>
  searching.value
    ? t('activity.broadcast.results')
    : recent.value.length > 0
      ? t('activity.broadcast.recent')
      : t('activity.broadcast.all'),
)

onMounted(async () => {
  await nextTick()
  searchInput.value?.focus()
  await Promise.all(
    guildsStore.guilds
      .filter((g) => channelsStore.channelsForGuild(g.id).length === 0)
      .map((g) => channelsStore.fetchChannels(g.id).catch(() => undefined)),
  )
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (rows.value.length) activeIndex.value = (activeIndex.value + 1) % rows.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (rows.value.length)
      activeIndex.value = (activeIndex.value - 1 + rows.value.length) % rows.value.length
  } else if (e.key === 'Enter') {
    const row = rows.value[activeIndex.value]
    if (row) void choose(row)
  }
}

async function choose(row: Row) {
  if (joining.value) return
  joining.value = true
  try {
    // Başka kanaldaysak join() mevcut geçiş davranışıyla önce ayrılır.
    await voiceStore.join(row.channel.id)
    if (voiceStore.connectedChannelId !== row.channel.id) {
      toastStore.error(t('activity.broadcast.joinFailed'))
      return
    }
    await router.push({
      name: 'channel',
      params: { guildId: row.channel.guildId ?? '', channelId: row.channel.id },
    })
    if (voiceStore.canPublishScreen) {
      // Ses çubuğu bekleyen isteği tüketir: ipucu + mevcut ekran paylaşım akışı (nudge dahil).
      activityStore.requestShare()
    } else {
      toastStore.info(t('activity.broadcast.notAllowed'))
    }
    emit('close')
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background-color: var(--kv-bg-overlay);"
      @click.self="emit('close')"
      @keydown="onKeydown"
    >
      <div
        class="w-full max-w-md rounded-[var(--kv-radius-lg)] border overflow-hidden flex flex-col max-h-[85vh]"
        style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
        role="dialog"
        aria-modal="true"
        :aria-label="t('activity.broadcast.title')"
      >
        <!-- Arama -->
        <div class="p-4 pb-2 shrink-0">
          <input
            ref="searchInput"
            v-model="query"
            type="text"
            class="w-full rounded-[var(--kv-radius-md)] px-3 py-2.5 text-[14px] outline-none"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border: 1px solid var(--kv-border-subtle);"
            :placeholder="t('activity.broadcast.search')"
            @input="activeIndex = 0"
          />
        </div>

        <!-- Kanallar -->
        <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          <p
            class="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest"
            style="color: var(--kv-text-muted);"
          >
            {{ heading }}
          </p>
          <p
            v-if="rows.length === 0"
            class="px-2 py-6 text-center text-[13px]"
            style="color: var(--kv-text-muted);"
          >
            {{ searching ? t('activity.broadcast.noResults') : t('activity.broadcast.empty') }}
          </p>
          <button
            v-for="(row, i) in rows"
            :key="row.channel.id"
            type="button"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-sm)] text-left cursor-pointer"
            :style="i === activeIndex ? 'background-color: var(--kv-bg-elevated);' : ''"
            :disabled="joining"
            @mouseenter="activeIndex = i"
            @click="choose(row)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="color: var(--kv-text-muted);">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <span class="flex-1 min-w-0 truncate text-[14px]" style="color: var(--kv-text-primary);">
              {{ row.channel.name }}
            </span>
            <span class="shrink-0 max-w-[40%] truncate text-[12px]" style="color: var(--kv-text-muted);">
              {{ row.guildName }}
            </span>
          </button>
        </div>

        <!-- Oyun -->
        <div
          v-if="game"
          class="flex items-center gap-2.5 px-4 py-3 border-t shrink-0"
          style="border-color: var(--kv-border-subtle);"
        >
          <GameLogo :icon-url="game.iconUrl" :size="24" />
          <span class="flex-1 min-w-0 truncate text-[13px] font-medium" style="color: var(--kv-text-primary);">
            {{ game.name }}
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
