import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import { invitesApi } from '@/api/invites'
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

  async function joinByInvite(code: string): Promise<GuildDto> {
    const res = await invitesApi.join(code)
    if (!guilds.value.find((g) => g.id === res.data.id)) {
      guilds.value.push(res.data)
    }
    return res.data
  }

  async function updateGuild(id: string, payload: { name?: string; adultsOnly?: boolean; rules?: string }): Promise<GuildDto> {
    const res = await guildsApi.update(id, payload)
    const idx = guilds.value.findIndex((g) => g.id === id)
    if (idx !== -1) guilds.value[idx] = res.data
    return res.data
  }

  async function updateGuildIcon(id: string, storageKey: string | null): Promise<GuildDto> {
    const res = await guildsApi.setIcon(id, storageKey)
    const idx = guilds.value.findIndex((g) => g.id === id)
    if (idx !== -1) guilds.value[idx] = res.data
    return res.data
  }

  function setActiveGuild(id: string | null) {
    activeGuildId.value = id
  }

  return { guilds, activeGuildId, activeGuild, fetchGuilds, createGuild, joinByInvite, updateGuild, updateGuildIcon, setActiveGuild }
})
