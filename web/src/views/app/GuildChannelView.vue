<script setup lang="ts">
/**
 * GuildChannelView — guild kanalı ekranı (/channels/:guildId/:channelId).
 * Kendi route param'ını okur (merkezi syncFromRoute YOK). Metin → MessageArea, ses → VoiceRoomView.
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import GuildTopBar from './components/GuildTopBar.vue'
import MessageArea from './components/MessageArea.vue'
import VoiceRoomView from './components/VoiceRoomView.vue'

const props = defineProps<{ guildId: string; channelId: string }>()

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { joinChannel, leaveChannel } = useSocket()

const showMemberPanel = ref(true)
const activeChannelIsVoice = computed(() => channelsStore.activeChannel()?.type === 'GUILD_VOICE')

async function sync(guildId: string, channelId: string) {
  if (!guildId || !channelId) {
    await router.replace({ name: 'app' })
    return
  }
  guildsStore.setActiveGuild(guildId)

  if (!channelsStore.channelsForGuild(guildId).length) {
    try {
      await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id)
    } catch {
      await router.replace({ name: 'app' })
      return
    }
  }

  const channels = channelsStore.channelsForGuild(guildId)
  const exists = channels.some((c) => c.id === channelId)
  if (!exists && channels.length > 0) {
    await router.replace({ name: 'channel', params: { guildId, channelId: channels[0].id } })
    return
  }

  const prev = channelsStore.activeChannelId
  if (prev && prev !== channelId) leaveChannel(prev)
  channelsStore.setActiveChannel(channelId)
  await joinChannel(channelId)
  await channelsStore.markChannelRead(channelId, guildId)
  recheckGuildUnread(guildId)
  dmStore.setActiveChannel(null)
}

function recheckGuildUnread(guildId: string) {
  guildsStore.setGuildUnreadCount(guildId, channelsStore.totalUnreadForGuild(guildId))
}

watch(
  () => [props.guildId, props.channelId] as const,
  ([g, c]) => sync(g, c),
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <GuildTopBar />
    <!-- Ses kanalında merkez = VoiceRoomView; metin kanalında TopBar + MessageArea + üye paneli -->
    <div class="flex flex-1 min-w-0 overflow-hidden gap-4 mb-4">
      <VoiceRoomView
        v-if="activeChannelIsVoice && channelsStore.activeChannelId"
        :channel-id="channelsStore.activeChannelId"
        class="flex-1 min-w-0"
      />
      <template v-else>
        <div class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)]">
          <TopBar
            :show-member-panel="showMemberPanel"
            @toggle-members="showMemberPanel = !showMemberPanel"
          />
          <MessageArea class="flex-1 min-h-0" />
        </div>
        <MemberPanel v-if="showMemberPanel" class="hidden xl:flex" />
      </template>
    </div>
  </div>
</template>
