import { defineStore } from 'pinia'
import { ref } from 'vue'
import { rolesApi } from '@/api/roles'
import type { RoleDto } from '@/types'

export const useRolesStore = defineStore('roles', () => {
  const rolesByGuild = ref<Record<string, RoleDto[]>>({})

  function rolesFor(guildId: string): RoleDto[] {
    return [...(rolesByGuild.value[guildId] ?? [])].sort((a, b) => b.position - a.position)
  }

  async function fetchRoles(guildId: string): Promise<void> {
    const res = await rolesApi.listRoles(guildId)
    rolesByGuild.value[guildId] = [...res.data].sort((a, b) => b.position - a.position)
  }

  function upsertRole(guildId: string, role: RoleDto): void {
    const list = rolesByGuild.value[guildId] ?? []
    const idx = list.findIndex((r) => r.id === role.id)
    let next: RoleDto[]
    if (idx !== -1) {
      next = [...list]
      next[idx] = role
    } else {
      next = [...list, role]
    }
    rolesByGuild.value[guildId] = next.sort((a, b) => b.position - a.position)
  }

  function removeRoleLocal(guildId: string, roleId: string): void {
    const list = rolesByGuild.value[guildId]
    if (!list) return
    rolesByGuild.value[guildId] = list.filter((r) => r.id !== roleId)
  }

  function findGuildIdByRole(roleId: string): string | undefined {
    for (const [guildId, roles] of Object.entries(rolesByGuild.value)) {
      if (roles.some((r) => r.id === roleId)) return guildId
    }
    return undefined
  }

  return { rolesByGuild, rolesFor, fetchRoles, upsertRole, removeRoleLocal, findGuildIdByRole }
})
