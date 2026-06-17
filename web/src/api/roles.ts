import http from './axios'
import type { RoleDto, GuildMemberDto } from '@/types'

export interface CreateRolePayload {
  name: string
  color?: string
  hoist?: boolean
  mentionable?: boolean
  permissions?: string[]
}

export interface UpdateRolePayload {
  name?: string
  color?: string
  hoist?: boolean
  mentionable?: boolean
  permissions?: string[]
  isDefault?: boolean // yeni üyelere otomatik atanan varsayılan rol (guild başına tek)
}

export const rolesApi = {
  listRoles(guildId: string) {
    return http.get<RoleDto[]>(`/guilds/${guildId}/roles`)
  },
  createRole(guildId: string, payload: CreateRolePayload) {
    return http.post<RoleDto>(`/guilds/${guildId}/roles`, payload)
  },
  updateRole(roleId: string, payload: UpdateRolePayload) {
    return http.patch<RoleDto>(`/roles/${roleId}`, payload)
  },
  deleteRole(roleId: string) {
    return http.delete<null>(`/roles/${roleId}`)
  },
  assignRole(roleId: string, userId: string) {
    return http.post<GuildMemberDto>(`/roles/${roleId}/members/${userId}`)
  },
  removeRole(roleId: string, userId: string) {
    return http.delete<GuildMemberDto>(`/roles/${roleId}/members/${userId}`)
  },
  reorderRoles(guildId: string, items: { id: string; position: number }[]) {
    return http.patch<null>(`/guilds/${guildId}/roles/reorder`, { items })
  },
}
