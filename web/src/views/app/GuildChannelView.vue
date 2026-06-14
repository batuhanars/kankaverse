<script setup lang="ts">
/**
 * GuildChannelView — guild kanalı ekranı (/channels/:guildId/:channelId).
 * Kendi route param'ını okur (merkezi syncFromRoute YOK). Metin → MessageArea, ses → VoiceRoomView.
 */
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import GuildTopBar from './components/GuildTopBar.vue'
import TextChannelView from './components/TextChannelView.vue'
import VoiceRoomView from './components/VoiceRoomView.vue'

const props = defineProps<{ guildId: string; channelId: string }>()

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { joinChannel, leaveChannel } = useSocket()

// Kanal türü VERİdir (channel.type), URL değil → RouterView değil, veri-sürümlü <component :is>
const channelComponent = computed(() =>
  channelsStore.activeChannel()?.type === 'GUILD_VOICE' ? VoiceRoomView : TextChannelView,
)

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
    <!-- Kanal türüne (veri) göre varyant: ses → VoiceRoomView, metin → TextChannelView -->
    <div class="flex flex-1 min-w-0 overflow-hidden mb-4">
      <component :is="channelComponent" class="flex-1 min-w-0" />
    </div>
  </div>
</template>
