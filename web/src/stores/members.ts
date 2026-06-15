import { defineStore } from 'pinia'
import { ref } from 'vue'
import { guildsApi } from '@/api/guilds'
import type { GuildMemberDto } from '@/types'

/**
 * Members store — ortam (guild) üye listesi tek kaynağı (REV-14 realtime).
 * MemberPanel + mention autocomplete buradan okur; WS guild.member_* event'leri
 * burayı günceller → sayfa yenilemeden anlık (masaüstü hedefi: yenileme yok).
 */
export const useMembersStore = defineStore('members', () => {
  const membersByGuild = ref<Record<string, GuildMemberDto[]>>({})

  function membersFor(guildId: string): GuildMemberDto[] {
    return membersByGuild.value[guildId] ?? []
  }

  async function fetchMembers(guildId: string): Promise<void> {
    const res = await guildsApi.getMembers(guildId)
    membersByGuild.value[guildId] = res.data
  }

  /** WS guild.member_joined — listeye ekle (yoksa no-op; girince fetch eder) */
  function addMember(guildId: string, member: GuildMemberDto): void {
    const list = membersByGuild.value[guildId]
    if (!list) return
    if (!list.some((m) => m.userId === member.userId)) {
      membersByGuild.value[guildId] = [...list, member]
    }
  }

  /** WS guild.member_left / kick — listeden çıkar */
  function removeMember(guildId: string, userId: string): void {
    const list = membersByGuild.value[guildId]
    if (!list) return
    membersByGuild.value[guildId] = list.filter((m) => m.userId !== userId)
  }

  /** WS guild.member_updated — rol değişimi */
  function updateMember(guildId: string, member: GuildMemberDto): void {
    const list = membersByGuild.value[guildId]
    if (!list) return
    const idx = list.findIndex((m) => m.userId === member.userId)
    if (idx !== -1) {
      const next = [...list]
      next[idx] = member
      membersByGuild.value[guildId] = next
    }
  }

  return { membersByGuild, membersFor, fetchMembers, addMember, removeMember, updateMember }
})
