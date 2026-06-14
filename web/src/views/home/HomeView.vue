<script setup lang="ts">
/**
 * HomeView — ana ekran (/). Arkadaşlar/dashboard + arkadaş istekleri (query ?tab=pending).
 * Guild/kanal/DM aktif state'ini temizler; modalları useAppModals üzerinden açar.
 */
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import { useAppModals } from '@/composables/useAppModals'
import HomeTopBar from './components/HomeTopBar.vue'
import HomeDashboard from './components/HomeDashboard.vue'
import FriendsRightPanel from './components/FriendsRightPanel.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { leaveChannel } = useSocket()
const { openServerModal, openAddFriend } = useAppModals()

const initialTab = computed<'all' | 'pending'>(() => (route.query.tab === 'pending' ? 'pending' : 'all'))

function clearActive() {
  guildsStore.setActiveGuild(null)
  const prev = channelsStore.activeChannelId
  if (prev) leaveChannel(prev)
  channelsStore.setActiveChannel(null)
  dmStore.setActiveChannel(null)
}
watch(() => route.name, () => { if (route.name === 'app') clearActive() }, { immediate: true })

function selectDm(channelId: string) {
  router.push({ name: 'dm', params: { channelId } })
}

async function openGuild(guildId: string) {
  if (!channelsStore.channelsForGuild(guildId).length) {
    await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id)
  }
  const channels = channelsStore.channelsForGuild(guildId)
  if (channels.length > 0) {
    router.push({ name: 'channel', params: { guildId, channelId: channels[0].id } })
  } else {
    guildsStore.setActiveGuild(guildId)
    channelsStore.setActiveChannel(null)
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <HomeTopBar @select-dm="selectDm" />
    <div class="flex flex-1 min-w-0 overflow-hidden gap-4">
      <HomeDashboard
        @add-friend="openAddFriend"
        @create-ortam="openServerModal('create')"
        @join-ortam="openServerModal('join')"
        @open-guild="openGuild"
      />
      <FriendsRightPanel
        :key="initialTab"
        :initial-tab="initialTab"
        @add-friend="openAddFriend"
        @open-dm="selectDm"
      />
    </div>
  </div>
</template>
