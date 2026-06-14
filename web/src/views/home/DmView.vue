<script setup lang="ts">
/**
 * DmView — 1-1 ve grup DM ekranı (/dm/:channelId). Kendi route param'ını okur.
 */
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import HomeTopBar from './components/HomeTopBar.vue'
import DmConversation from './components/DmConversation.vue'
import DmProfilePanel from './components/DmProfilePanel.vue'

const props = defineProps<{ channelId: string }>()

const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { leaveChannel } = useSocket()

const activeDmChannel = computed(() => dmStore.activeChannel())

async function sync(channelId: string) {
  if (!channelId) {
    await router.replace({ name: 'app' })
    return
  }
  // DM listede yoksa tazele; hâlâ yoksa home'a düş
  if (!dmStore.channels.find((c) => c.id === channelId)) {
    try {
      await dmStore.fetchChannels()
    } catch {
      await router.replace({ name: 'app' })
      return
    }
  }
  if (!dmStore.channels.find((c) => c.id === channelId)) {
    await router.replace({ name: 'app' })
    return
  }

  guildsStore.setActiveGuild(null)
  const prev = channelsStore.activeChannelId
  if (prev) leaveChannel(prev)
  channelsStore.setActiveChannel(null)
  dmStore.setActiveChannel(channelId)
}

function toHome() {
  router.push({ name: 'app' })
}

watch(() => props.channelId, (id) => sync(id), { immediate: true })
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <HomeTopBar @select-dm="(id: string) => router.push({ name: 'dm', params: { channelId: id } })" />
    <div v-if="activeDmChannel" class="flex flex-1 min-w-0 overflow-hidden gap-4">
      <DmConversation
        :channel="activeDmChannel"
        @cleared="toHome"
        @left="toHome"
        @deleted="toHome"
      />
      <!-- Profil paneli yalnızca 1-1 DM için -->
      <div v-if="activeDmChannel.type === 'DM'" class="hidden xl:flex">
        <DmProfilePanel :other-user="activeDmChannel.otherUser" />
      </div>
    </div>
  </div>
</template>
