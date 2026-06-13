import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import { channelsApi } from '@/api/channels'
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

  async function createChannel(guildId: string, payload: { name: string; ageGated?: boolean }): Promise<ChannelDto> {
    const res = await guildsApi.createChannel(guildId, payload)
    if (!channelsByGuild.value[guildId]) channelsByGuild.value[guildId] = []
    channelsByGuild.value[guildId].push(res.data)
    return res.data
  }

  async function updateChannel(channelId: string, guildId: string, payload: { name?: string; ageGated?: boolean; slowModeSeconds?: number }): Promise<ChannelDto> {
    const res = await channelsApi.update(channelId, payload)
    const list = channelsByGuild.value[guildId]
    if (list) {
      const idx = list.findIndex((c) => c.id === channelId)
      if (idx !== -1) list[idx] = res.data
    }
    return res.data
  }

  async function deleteChannel(channelId: string, guildId: string): Promise<void> {
    await channelsApi.delete(channelId)
    const list = channelsByGuild.value[guildId]
    if (list) {
      channelsByGuild.value[guildId] = list.filter((c) => c.id !== channelId)
    }
    if (activeChannelId.value === channelId) activeChannelId.value = null
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
    createChannel,
    updateChannel,
    deleteChannel,
    setActiveChannel,
  }
})
