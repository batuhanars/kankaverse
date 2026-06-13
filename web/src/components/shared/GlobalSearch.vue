<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'

const emit = defineEmits<{ close: []; selectDm: [channelId: string] }>()

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()

const query = ref('')
const inputRef = ref<HTMLInputElement>()

onMounted(() => {
  inputRef.value?.focus()
})

const filteredGuilds = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return guildsStore.guilds
  return guildsStore.guilds.filter((g) => g.name.toLowerCase().includes(q))
})

const filteredDms = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return dmStore.channels
  return dmStore.channels.filter((ch) => {
    if (ch.type === 'DM') return ch.otherUser.username.toLowerCase().includes(q)
    // GROUP_DM: ada veya üye adlarına göre filtrele
    const nameMatch = ch.name?.toLowerCase().includes(q) ?? false
    const memberMatch = ch.members.some((m) => m.username.toLowerCase().includes(q))
    return nameMatch || memberMatch
  })
})

// DM kanalı için görüntü adı + avatar yardımcıları
function dmDisplayName(ch: (typeof dmStore.channels)[number]): string {
  if (ch.type === 'DM') return ch.otherUser.username
  if (ch.name) return ch.name
  const names = ch.members.map((m) => m.username)
  if (names.length <= 2) return names.join(', ')
  return names.slice(0, 2).join(', ') + ` +${names.length - 2}`
}

function dmAvatarUrl(ch: (typeof dmStore.channels)[number]): string | null {
  if (ch.type === 'DM') return ch.otherUser.avatarUrl
  return ch.members[0]?.avatarUrl ?? null
}

function dmAvatarInitial(ch: (typeof dmStore.channels)[number]): string {
  if (ch.type === 'DM') return ch.otherUser.username[0].toUpperCase()
  return (ch.members[0]?.username ?? '?')[0].toUpperCase()
}

const hasResults = computed(() => filteredGuilds.value.length > 0 || filteredDms.value.length > 0)

async function selectGuild(guildId: string) {
  if (!channelsStore.channelsForGuild(guildId).length) {
    await channelsStore.fetchChannels(guildId)
  }
  const channels = channelsStore.channelsForGuild(guildId)
  if (channels.length) {
    router.push({ name: 'channel', params: { guildId, channelId: channels[0].id } })
  } else {
    guildsStore.setActiveGuild(guildId)
    channelsStore.setActiveChannel(null)
  }
  emit('close')
}

function selectDm(channelId: string) {
  router.push({ name: 'dm', params: { channelId } })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex flex-col items-center px-4"
      style="background-color: rgba(0,0,0,0.75); padding-top: 80px;"
      @click.self="emit('close')"
      @keydown.escape.stop="emit('close')"
    >
      <!-- Üst başlık -->
      <p class="text-[15px] font-semibold mb-3" style="color: var(--kv-text-secondary);">
        {{ t('search.title') }}
      </p>

      <!-- Kart -->
      <div
        class="w-full rounded-[var(--kv-radius-lg)] overflow-hidden flex flex-col"
        style="max-width: 560px; background-color: var(--kv-bg-sidebar); max-height: 520px;"
        @click.stop
      >
        <!-- Arama girişi -->
        <div class="flex items-center gap-3 px-4 py-3 border-b" style="border-color: var(--kv-border-subtle);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted); shrink-0: 0;" class="shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref="inputRef"
            v-model="query"
            class="flex-1 bg-transparent outline-none text-[16px]"
            style="color: var(--kv-text-primary);"
            :placeholder="t('search.placeholder')"
            @keydown.escape.stop="emit('close')"
          />
          <kbd
            class="text-[11px] px-1.5 py-0.5 rounded hidden sm:block"
            style="color: var(--kv-text-muted); background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
          >ESC</kbd>
        </div>

        <!-- Sonuçlar -->
        <div class="overflow-y-auto flex-1">
          <!-- Sunucular -->
          <template v-if="filteredGuilds.length">
            <p class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
              {{ t('search.sectionGuilds') }}
            </p>
            <button
              v-for="guild in filteredGuilds"
              :key="guild.id"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
              @click="selectGuild(guild.id)"
            >
              <div
                class="w-8 h-8 rounded-[var(--kv-radius-sm)] flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                style="background-color: var(--kv-accent-500);"
              >
                {{ guild.name.charAt(0).toUpperCase() }}
              </div>
              <span class="text-[14px] font-medium truncate" style="color: var(--kv-text-primary);">
                {{ guild.name }}
              </span>
            </button>
          </template>

          <!-- Direkt Mesajlar -->
          <template v-if="filteredDms.length">
            <p class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
              {{ t('search.sectionDms') }}
            </p>
            <button
              v-for="ch in filteredDms"
              :key="ch.id"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
              @click="selectDm(ch.id)"
            >
              <div class="w-8 h-8 rounded-full overflow-hidden shrink-0" style="background-color: var(--kv-bg-content);">
                <img
                  v-if="dmAvatarUrl(ch)"
                  :src="dmAvatarUrl(ch)!"
                  :alt="dmDisplayName(ch)"
                  class="w-full h-full object-cover"
                />
                <span
                  v-else
                  class="w-full h-full flex items-center justify-center text-[12px] font-semibold"
                  style="color: var(--kv-text-secondary);"
                >{{ dmAvatarInitial(ch) }}</span>
              </div>
              <span class="text-[14px] font-medium truncate" style="color: var(--kv-text-primary);">
                {{ dmDisplayName(ch) }}
              </span>
            </button>
          </template>

          <!-- Boş durum -->
          <div v-if="!hasResults" class="px-4 py-10 text-center">
            <p class="text-[14px]" style="color: var(--kv-text-muted);">{{ t('search.empty') }}</p>
          </div>
        </div>

        <!-- Alt ipucu -->
        <div class="px-4 py-2 border-t shrink-0" style="border-color: var(--kv-border-subtle);">
          <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('search.tip') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
