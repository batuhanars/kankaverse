import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import type { GuildDto } from '@/types'

export const useGuildsStore = defineStore('guilds', () => {
  const guilds = ref<GuildDto[]>([])
  const activeGuildId = ref<string | null>(null)

  const activeGuild = () => guilds.value.find((g) => g.id === activeGuildId.value) ?? null

  async function fetchGuilds() {
    const res = await guildsApi.list()
    guilds.value = res.data
  }

  async function createGuild(name: string): Promise<GuildDto> {
    const res = await guildsApi.create(name)
    guilds.value.push(res.data)
    return res.data
  }

  async function joinGuild(id: string): Promise<GuildDto> {
    const res = await guildsApi.join(id)
    if (!guilds.value.find((g) => g.id === res.data.id)) {
      guilds.value.push(res.data)
    }
    return res.data
  }

  function setActiveGuild(id: string | null) {
    activeGuildId.value = id
  }

  return { guilds, activeGuildId, activeGuild, fetchGuilds, createGuild, joinGuild, setActiveGuild }
})
