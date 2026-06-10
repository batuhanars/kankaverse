import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import type { ChannelDto } from '@/types'

export const useChannelsStore = defineStore('channels', () => {
  const channelsByGuild = ref<Record<string, ChannelDto[]>>({})
  const activeChannelId = ref<string | null>(null)

  const activeChannel = () => {
    if (!activeChannelId.value) return null
    for (const channels of Object.values(channelsByGuild.value)) {
      const found = channels.find((c) => c.id === activeChannelId.value)
      if (found) return found
    }
    return null
  }

  const channelsForGuild = (guildId: string) => channelsByGuild.value[guildId] ?? []

  async function fetchChannels(guildId: string) {
    const res = await guildsApi.getChannels(guildId)
    channelsByGuild.value[guildId] = res.data
  }

  function setActiveChannel(id: string | null) {
    activeChannelId.value = id
  }

  return {
    channelsByGuild,
    activeChannelId,
    activeChannel,
    channelsForGuild,
    fetchChannels,
    setActiveChannel,
  }
})
