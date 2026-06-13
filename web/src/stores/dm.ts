import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dmApi } from '@/api/dm'
import { useAuthStore } from '@/stores/auth'
import type { DmChannelDto, GroupDmMemberDto } from '@/types'

export const useDmStore = defineStore('dm', () => {
  const channels = ref<DmChannelDto[]>([])
  const activeDmChannelId = ref<string | null>(null)

  async function fetchChannels() {
    const res = await dmApi.getChannels()
    channels.value = res.data
  }

  async function openChannel(userId: string): Promise<DmChannelDto> {
    const res = await dmApi.openChannel(userId)
    const channel = res.data
    const idx = channels.value.findIndex((c) => c.id === channel.id)
    if (idx === -1) {
      channels.value.unshift(channel)
    } else {
      channels.value[idx] = channel
    }
    activeDmChannelId.value = channel.id
    return channel
  }

  async function markRead(channelId: string) {
    await dmApi.markRead(channelId)
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) ch.unread = false
  }

  function removeChannel(channelId: string) {
    channels.value = channels.value.filter((c) => c.id !== channelId)
    if (activeDmChannelId.value === channelId) activeDmChannelId.value = null
  }

  function setActiveChannel(channelId: string | null) {
    activeDmChannelId.value = channelId
  }

  function activeChannel(): DmChannelDto | null {
    return channels.value.find((c) => c.id === activeDmChannelId.value) ?? null
  }

  async function applyActivity(payload: {
    channelId: string
    lastMessage: { content: string; createdAt: string }
    senderId: string
  }) {
    const authStore = useAuthStore()
    const idx = channels.value.findIndex((c) => c.id === payload.channelId)

    if (idx !== -1) {
      const ch = channels.value[idx]
      // lastMessage alanlarını güncelle (MessageDto uyumlu — eksik alanlar korunur)
      if (ch.lastMessage) {
        ch.lastMessage.content = payload.lastMessage.content
        ch.lastMessage.createdAt = payload.lastMessage.createdAt
      } else {
        // Önceki lastMessage null idi — minimal şekle yaz
        ch.lastMessage = {
          id: '',
          channelId: payload.channelId,
          content: payload.lastMessage.content,
          replyToId: null,
          author: { id: payload.senderId, username: '', avatarUrl: null },
          createdAt: payload.lastMessage.createdAt,
        }
      }

      // Kanalı listenin başına taşı (en güncel üste)
      channels.value.splice(idx, 1)
      channels.value.unshift(ch)

      // Unread: kendi mesajım DEĞİLSE ve aktif DM DEĞİLSE set et
      const myId = authStore.user?.id
      if (payload.senderId !== myId && payload.channelId !== activeDmChannelId.value) {
        ch.unread = true
      }
    } else {
      // Alıcının listesinde henüz yok (yeni DM / grup) — listeyi tazele
      await fetchChannels()
    }
  }

  // Sprint 12 — Grup DM aksiyonları

  async function createGroup(memberIds: string[], name?: string): Promise<DmChannelDto> {
    const res = await dmApi.createGroup(memberIds, name)
    const channel = res.data
    channels.value.unshift(channel)
    activeDmChannelId.value = channel.id
    return channel
  }

  async function addGroupMember(groupId: string, userId: string) {
    await dmApi.addGroupMember(groupId, userId)
    // Üye eklenince kanal listesini tazele (members dizisi güncellensin)
    await fetchChannels()
  }

  async function leaveGroup(groupId: string) {
    await dmApi.leaveGroup(groupId)
    removeChannel(groupId)
  }

  async function deleteGroup(groupId: string) {
    await dmApi.deleteGroup(groupId)
    removeChannel(groupId)
  }

  async function renameGroup(groupId: string, name: string) {
    const res = await dmApi.renameGroup(groupId, name)
    const updated = res.data
    const idx = channels.value.findIndex((c) => c.id === groupId)
    if (idx !== -1) channels.value[idx] = updated
  }

  // Grup üyesi listesini store'da güncelle (WS veya optimistik güncelleme için)
  function updateGroupMembers(groupId: string, members: GroupDmMemberDto[]) {
    const ch = channels.value.find((c) => c.id === groupId)
    if (ch && ch.type === 'GROUP_DM') {
      ch.members = members
    }
  }

  return {
    channels,
    activeDmChannelId,
    fetchChannels,
    openChannel,
    markRead,
    removeChannel,
    setActiveChannel,
    activeChannel,
    applyActivity,
    createGroup,
    addGroupMember,
    leaveGroup,
    deleteGroup,
    renameGroup,
    updateGroupMembers,
  }
})
