import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import { channelsApi, categoriesApi } from '@/api/channels'
import { useGuildsStore } from '@/stores/guilds'
import type { ChannelDto, CategoryDto, GuildMemberRole } from '@/types'

export const useChannelsStore = defineStore('channels', () => {
  const channelsByGuild = ref<Record<string, ChannelDto[]>>({})
  const activeChannelId = ref<string | null>(null)

  // Sprint V2 — Kategori state: { guildId: CategoryDto[] }
  const categoriesByGuild = ref<Record<string, CategoryDto[]>>({})

  const activeChannel = () => {
    if (!activeChannelId.value) return null
    for (const channels of Object.values(channelsByGuild.value)) {
      const found = channels.find((c) => c.id === activeChannelId.value)
      if (found) return found
    }
    return null
  }

  const channelsForGuild = (guildId: string) => channelsByGuild.value[guildId] ?? []

  // R11: id ile kanal bul (guildId çözümü için — voice.moved yönlendirmesi)
  const findChannelById = (channelId: string): ChannelDto | null => {
    for (const channels of Object.values(channelsByGuild.value)) {
      const found = channels.find((c) => c.id === channelId)
      if (found) return found
    }
    return null
  }

  const categoriesForGuild = (guildId: string) => categoriesByGuild.value[guildId] ?? []

  async function fetchChannels(guildId: string) {
    const res = await guildsApi.getChannels(guildId)
    channelsByGuild.value[guildId] = res.data
  }

  // Sprint V2 — Kanallar + kategoriler birlikte çek; kullanıcı rolünü guilds store'a yaz
  async function fetchChannelsAndCategories(guildId: string, userId?: string): Promise<void> {
    const [channelsRes, catsRes] = await Promise.all([
      guildsApi.getChannels(guildId),
      guildsApi.getCategories(guildId),
    ])
    channelsByGuild.value[guildId] = channelsRes.data
    categoriesByGuild.value[guildId] = catsRes.data

    // Kullanıcının rolünü üye listesinden öğren (arka planda, hata sessiz)
    if (userId) {
      guildsApi.getMembers(guildId).then((res) => {
        const me = res.data.find((m) => m.userId === userId)
        if (me) {
          useGuildsStore().setMyRole(guildId, me.role as GuildMemberRole)
        }
      }).catch(() => { /* sessiz */ })
    }
  }

  async function createChannel(guildId: string, payload: { name: string; type?: 'GUILD_TEXT' | 'GUILD_VOICE'; ageGated?: boolean; isPrivate?: boolean; categoryId?: string | null }): Promise<ChannelDto> {
    const res = await guildsApi.createChannel(guildId, payload)
    if (!channelsByGuild.value[guildId]) channelsByGuild.value[guildId] = []
    channelsByGuild.value[guildId].push(res.data)
    return res.data
  }

  async function updateChannel(channelId: string, guildId: string, payload: { name?: string; ageGated?: boolean; slowModeSeconds?: number; categoryId?: string | null; userLimit?: number }): Promise<ChannelDto> {
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

  // Sprint V2 — Kategori aksiyonları

  async function createCategory(guildId: string, name: string): Promise<CategoryDto> {
    const res = await guildsApi.createCategory(guildId, name)
    if (!categoriesByGuild.value[guildId]) categoriesByGuild.value[guildId] = []
    categoriesByGuild.value[guildId].push(res.data)
    // Otoritatif tazele
    const fresh = await guildsApi.getCategories(guildId)
    categoriesByGuild.value[guildId] = fresh.data
    return res.data
  }

  async function renameCategory(categoryId: string, guildId: string, name: string): Promise<CategoryDto> {
    const res = await categoriesApi.rename(categoryId, name)
    // Otoritatif tazele
    const fresh = await guildsApi.getCategories(guildId)
    categoriesByGuild.value[guildId] = fresh.data
    return res.data
  }

  async function deleteCategory(categoryId: string, guildId: string): Promise<void> {
    await categoriesApi.delete(categoryId)
    // Kanallar kategorisiz oldu — her ikisini de tazele
    const [channelsRes, catsRes] = await Promise.all([
      guildsApi.getChannels(guildId),
      guildsApi.getCategories(guildId),
    ])
    channelsByGuild.value[guildId] = channelsRes.data
    categoriesByGuild.value[guildId] = catsRes.data
  }

  async function assignChannelCategory(channelId: string, guildId: string, categoryId: string | null): Promise<ChannelDto> {
    const res = await channelsApi.update(channelId, { categoryId })
    const list = channelsByGuild.value[guildId]
    if (list) {
      const idx = list.findIndex((c) => c.id === channelId)
      if (idx !== -1) list[idx] = res.data
    }
    return res.data
  }

  function setActiveChannel(id: string | null) {
    activeChannelId.value = id
  }

  /** Kanalı okundu işaretle: POST /channels/:id/read → optimistik 0 + sunucudan otoritatif tazele */
  async function markChannelRead(channelId: string, guildId?: string): Promise<void> {
    // Optimistik: önce local'i sıfırla (anlık his)
    let resolvedGuildId = guildId
    for (const [loopGuildId, channels] of Object.entries(channelsByGuild.value)) {
      const idx = channels.findIndex((c) => c.id === channelId)
      if (idx !== -1) {
        // REV-4: okundu → unread + okunmamış-bahsetme ikisini de sıfırla (optimistik)
        if (channels[idx].unreadCount > 0 || channels[idx].unreadMentionCount > 0) {
          channels[idx] = { ...channels[idx], unreadCount: 0, unreadMentionCount: 0 }
        }
        if (!resolvedGuildId) resolvedGuildId = loopGuildId
        break
      }
    }
    // Optimistik guild sayacı — event yolu kalıyor (fallback)
    if (resolvedGuildId) {
      window.dispatchEvent(new CustomEvent('kv:guild:recheck-unread', { detail: { guildId: resolvedGuildId } }))
    }
    try {
      await channelsApi.markRead(channelId)
      // Sunucu-otoritesi: POST başarılı → kanalları sunucudan tazele; guild sayacını gerçek toplamdan güncelle
      if (resolvedGuildId) {
        await fetchChannels(resolvedGuildId)
        window.dispatchEvent(new CustomEvent('kv:guild:recheck-unread', { detail: { guildId: resolvedGuildId } }))
      }
    } catch {
      // Sessizce yut — okundu işaretleme kritik değil
    }
  }

  /** WS channel.activity: kanal aktif değilse unreadCount++ */
  function markChannelUnread(channelId: string, guildId: string): void {
    const channels = channelsByGuild.value[guildId]
    if (!channels) return
    const idx = channels.findIndex((c) => c.id === channelId)
    if (idx !== -1) {
      channels[idx] = { ...channels[idx], unreadCount: channels[idx].unreadCount + 1 }
    }
  }

  /** Guild'in tüm kanallarının unreadCount toplamını döner (guild sayacı güncellemek için) */
  function totalUnreadForGuild(guildId: string): number {
    return (channelsByGuild.value[guildId] ?? []).reduce((sum, c) => sum + c.unreadCount, 0)
  }

  // REV-4: WS mention → kanal aktif değilse unreadMentionCount++ (+ generic unread de zaten artar)
  function markChannelMentioned(channelId: string, guildId: string): void {
    const channels = channelsByGuild.value[guildId]
    if (!channels) return
    const idx = channels.findIndex((c) => c.id === channelId)
    if (idx !== -1) {
      channels[idx] = { ...channels[idx], unreadMentionCount: channels[idx].unreadMentionCount + 1 }
    }
  }

  /** Guild'in okunmamış-bahsetme toplamı (rail kırmızı rozeti) */
  function totalMentionsForGuild(guildId: string): number {
    return (channelsByGuild.value[guildId] ?? []).reduce((sum, c) => sum + c.unreadMentionCount, 0)
  }

  /** REV-4: o guild'de okunmamış bahsetmesi olan kanallar (position sırasında) — bant zıplama döngüsü */
  // ── Realtime (WS guild kanal/kategori olayları — diğer üyelerde anlık) ──
  function upsertChannelLocal(guildId: string, channel: ChannelDto): void {
    const list = channelsByGuild.value[guildId]
    if (!list) return // bu guild henüz yüklenmedi → girince fetch eder
    const idx = list.findIndex((c) => c.id === channel.id)
    if (idx === -1) {
      channelsByGuild.value[guildId] = [...list, channel]
    } else {
      // Güncelleme: unread sayaçları korunur (WS DTO'sunda 0 gelir)
      const next = [...list]
      next[idx] = { ...channel, unreadCount: next[idx].unreadCount, unreadMentionCount: next[idx].unreadMentionCount }
      channelsByGuild.value[guildId] = next
    }
  }
  function removeChannelLocal(guildId: string, channelId: string): void {
    const list = channelsByGuild.value[guildId]
    if (list) channelsByGuild.value[guildId] = list.filter((c) => c.id !== channelId)
  }
  function upsertCategoryLocal(guildId: string, category: CategoryDto): void {
    const list = categoriesByGuild.value[guildId]
    if (!list) return
    const idx = list.findIndex((c) => c.id === category.id)
    if (idx === -1) categoriesByGuild.value[guildId] = [...list, category]
    else { const next = [...list]; next[idx] = category; categoriesByGuild.value[guildId] = next }
  }
  function removeCategoryLocal(guildId: string, categoryId: string): void {
    const cats = categoriesByGuild.value[guildId]
    if (cats) categoriesByGuild.value[guildId] = cats.filter((c) => c.id !== categoryId)
    // Kategorinin kanalları kategorisize düşer (backend de böyle yapar)
    const chans = channelsByGuild.value[guildId]
    if (chans) channelsByGuild.value[guildId] = chans.map((c) => (c.categoryId === categoryId ? { ...c, categoryId: null } : c))
  }

  // Drag-reorder optimistik uygulama (API + WS ile reconcile)
  function applyChannelReorder(guildId: string, items: { id: string; position: number; categoryId?: string | null }[]): void {
    const list = channelsByGuild.value[guildId]
    if (!list) return
    const byId = new Map(items.map((i) => [i.id, i]))
    channelsByGuild.value[guildId] = list.map((c) => {
      const it = byId.get(c.id)
      if (!it) return c
      return { ...c, position: it.position, ...(it.categoryId !== undefined ? { categoryId: it.categoryId } : {}) }
    })
  }
  function applyCategoryReorder(guildId: string, items: { id: string; position: number }[]): void {
    const list = categoriesByGuild.value[guildId]
    if (!list) return
    const byId = new Map(items.map((i) => [i.id, i.position]))
    categoriesByGuild.value[guildId] = list.map((c) => (byId.has(c.id) ? { ...c, position: byId.get(c.id)! } : c))
  }

  function channelsWithMentions(guildId: string) {
    return (channelsByGuild.value[guildId] ?? [])
      .filter((c) => c.unreadMentionCount > 0)
      .sort((a, b) => a.position - b.position)
  }

  return {
    channelsByGuild,
    activeChannelId,
    categoriesByGuild,
    activeChannel,
    channelsForGuild,
    findChannelById,
    categoriesForGuild,
    fetchChannels,
    fetchChannelsAndCategories,
    createChannel,
    updateChannel,
    deleteChannel,
    createCategory,
    renameCategory,
    deleteCategory,
    assignChannelCategory,
    setActiveChannel,
    markChannelRead,
    markChannelUnread,
    totalUnreadForGuild,
    markChannelMentioned,
    totalMentionsForGuild,
    channelsWithMentions,
    upsertChannelLocal,
    removeChannelLocal,
    upsertCategoryLocal,
    removeCategoryLocal,
    applyChannelReorder,
    applyCategoryReorder,
  }
})
