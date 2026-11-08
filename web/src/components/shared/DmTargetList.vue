<script setup lang="ts">
/**
 * DmTargetList: DM/grup DM hedef listesi (arama + satırlar). ForwardMessageModal'dan ayrıştırıldı (C49 Revize 1):
 * mesaj iletme ve yapay zeka video gönderimi aynı listeyi kullanır. Yalnız seçimi emit eder; gönderim çağırandadır.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { guildsApi } from '@/api/guilds'
import { ChannelType } from '@/types'
import type { DmChannelDto, ChannelDto } from '@/types'

const props = defineProps<{
  disabled?: boolean
  sendingId?: string | null
  sentIds?: Set<string>
  sentLabel: string
  /** C49 R2: DM'lere ek olarak ortam metin kanallarını da listeler (varsayılan kapalı, iletme etkilenmez). */
  withGuildChannels?: boolean
}>()
const emit = defineEmits<{ pick: [channel: DmChannelDto]; pickChannel: [channelId: string] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const query = ref('')

function channelName(c: DmChannelDto): string {
  if (c.type === 'DM') return c.otherUser.username
  return c.name || c.members.map((m) => m.username).join(', ')
}
function channelAvatar(c: DmChannelDto): string | null {
  return c.type === 'DM' ? c.otherUser.avatarUrl : null
}
function channelInitial(c: DmChannelDto): string {
  return channelName(c).charAt(0).toUpperCase()
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return dmStore.channels.filter((c) => !q || channelName(c).toLowerCase().includes(q))
})

interface GuildGroup {
  guildId: string
  guildName: string
  channels: ChannelDto[]
}
const guildGroups = ref<GuildGroup[]>([])

/**
 * Mobil ShareTargetList ile aynı kaynak/süzgeç: ortam listesi + her ortamın kanal listesi; yalnız metin kanalı ve
 * kilitli olmayanlar. Kalan kapılar (yazma/ek izni, yavaş mod) sunucuda, ret mesajı gönderimde gösterilir.
 */
async function loadGuildGroups() {
  const guilds = (await guildsApi.list()).data
  const settled = await Promise.allSettled(guilds.map((g) => guildsApi.getChannels(g.id)))
  const out: GuildGroup[] = []
  settled.forEach((res, i) => {
    if (res.status !== 'fulfilled') return
    const channels = res.value.data.filter((c) => c.type === ChannelType.GUILD_TEXT && !c.locked)
    if (channels.length) out.push({ guildId: guilds[i].id, guildName: guilds[i].name, channels })
  })
  guildGroups.value = out
}

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const match = (s: string) => !q || s.toLowerCase().includes(q)
  const out: GuildGroup[] = []
  for (const g of guildGroups.value) {
    const channels = match(g.guildName) ? g.channels : g.channels.filter((c) => match(c.name ?? ''))
    if (channels.length) out.push({ ...g, channels })
  }
  return out
})

const isEmpty = computed(() => !filtered.value.length && !filteredGroups.value.length)

onMounted(() => {
  if (!dmStore.channels.length) dmStore.fetchChannels().catch(() => {})
  if (props.withGuildChannels) loadGuildGroups().catch(() => {})
})
</script>

<template>
  <div class="flex flex-col gap-3 min-w-0">
    <input
      v-model="query"
      type="text"
      class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border"
      style="background-color: var(--kv-bg-content); color: var(--kv-text-primary); border-color: var(--kv-border-strong);"
      :placeholder="t('message.forwardSearch')"
    />

    <div class="max-h-72 overflow-y-auto flex flex-col -mx-1">
      <button
        v-for="c in filtered"
        :key="c.id"
        class="flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-md)] text-left transition-colors hover:bg-[var(--kv-accent-subtle)]"
        :disabled="props.disabled || props.sendingId === c.id"
        @click="emit('pick', c)"
      >
        <div
          class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          <img v-if="channelAvatar(c)" :src="channelAvatar(c)!" :alt="channelName(c)" class="w-full h-full object-cover" />
          <span v-else>{{ channelInitial(c) }}</span>
        </div>
        <span class="flex-1 truncate text-[14px]" style="color: var(--kv-text-primary);">{{ channelName(c) }}</span>
        <span
          v-if="props.sentIds?.has(c.id)"
          class="shrink-0 text-[12px] font-medium"
          style="color: var(--kv-online, #3DB46E);"
        >{{ props.sentLabel }}</span>
        <span v-else-if="props.sendingId === c.id" class="shrink-0 text-[12px]" style="color: var(--kv-text-muted);">…</span>
      </button>

      <template v-for="g in filteredGroups" :key="g.guildId">
        <p class="px-2 pt-3 pb-1 text-[12px] font-semibold truncate" style="color: var(--kv-text-muted);">{{ g.guildName }}</p>
        <button
          v-for="c in g.channels"
          :key="c.id"
          class="flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-md)] text-left transition-colors hover:bg-[var(--kv-accent-subtle)]"
          :disabled="props.disabled || props.sendingId === c.id"
          @click="emit('pickChannel', c.id)"
        >
          <span class="w-8 h-8 shrink-0 flex items-center justify-center text-[16px]" style="color: var(--kv-text-muted);">#</span>
          <span class="flex-1 truncate text-[14px]" style="color: var(--kv-text-primary);">{{ c.name }}</span>
        </button>
      </template>

      <p v-if="isEmpty" class="px-2 py-4 text-[13px]" style="color: var(--kv-text-muted);">
        {{ t(withGuildChannels ? 'aiVideo.noSendTargets' : 'message.forwardNoChannels') }}
      </p>
    </div>
  </div>
</template>
