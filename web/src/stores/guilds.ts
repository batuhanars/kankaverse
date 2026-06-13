import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import { invitesApi } from '@/api/invites'
import type { GuildDto, GuildMemberRole } from '@/types'

export const useGuildsStore = defineStore('guilds', () => {
  const guilds = ref<GuildDto[]>([])
  const activeGuildId = ref<string | null>(null)

  // Sprint V2 — kullanıcının guild'lerdeki rol önbelleği { guildId: role }
  const myRoleByGuild = ref<Record<string, GuildMemberRole>>({})

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

  async function deleteGuild(id: string): Promise<void> {
    await guildsApi.deleteGuild(id)
    guilds.value = guilds.value.filter((g) => g.id !== id)
    if (activeGuildId.value === id) {
      activeGuildId.value = null
    }
    delete myRoleByGuild.value[id]
  }

  function setActiveGuild(id: string | null) {
    activeGuildId.value = id
  }

  /** Sprint V2 — kullanıcının guild'deki rolünü önbellekle (channels store fetch sonrası çağrılır) */
  function setMyRole(guildId: string, role: GuildMemberRole): void {
    myRoleByGuild.value[guildId] = role
  }

  /** Sprint V2 — mevcut aktif guild'de kullanıcı OWNER veya ADMIN mi? */
  function isAdminInActiveGuild(userId: string): boolean {
    const guildId = activeGuildId.value
    if (!guildId) return false
    // Önce ownerId kontrolü (hızlı yol — üye listesi gelmeden önce çalışır)
    const guild = activeGuild()
    if (guild && guild.ownerId === userId) return true
    // Önbellekteki rol
    const role = myRoleByGuild.value[guildId]
    return role === 'OWNER' || role === 'ADMIN'
  }

  /** Guild'in unreadCount'unu güncelle (WS channel.activity veya kanal okundu sonrası) */
  function setGuildUnreadCount(guildId: string, count: number): void {
    const idx = guilds.value.findIndex((g) => g.id === guildId)
    if (idx !== -1 && guilds.value[idx].unreadCount !== count) {
      guilds.value[idx] = { ...guilds.value[idx], unreadCount: count }
    }
  }

  /** Guild unreadCount'unu 1 artır (WS channel.activity için) */
  function incrementGuildUnread(guildId: string): void {
    const idx = guilds.value.findIndex((g) => g.id === guildId)
    if (idx !== -1) {
      guilds.value[idx] = { ...guilds.value[idx], unreadCount: guilds.value[idx].unreadCount + 1 }
    }
  }

  return { guilds, activeGuildId, myRoleByGuild, activeGuild, fetchGuilds, createGuild, joinByInvite, updateGuild, updateGuildIcon, deleteGuild, setActiveGuild, setMyRole, isAdminInActiveGuild, setGuildUnreadCount, incrementGuildUnread }
})
