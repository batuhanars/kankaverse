import http from './http';
import type { GuildMemberDto } from './guilds';

/**
 * Sprint M1e-B — özel roller. Uçlar `api/src/modules/roles/roles.controller.ts`den birebir.
 *
 * 🔴 Yetki: liste her üyeye açık, **oluştur/güncelle/sil/ata OWNER-ADMIN**. `@everyone` rolünün
 * adı ve `hoist` değeri değiştirilemez, silinemez — sunucu reddeder, istemci de o alanları
 * render etmez.
 *
 * 🔴 `CANNOT_GRANT_PERMISSION`: sahip olmadığın izni bir role veremezsin. Bu kararı **sunucu**
 * verir; istemci izin listesini kısmaz, sunucunun mesajını gösterir.
 */
export interface RoleDto {
  id: string;
  guildId: string;
  name: string;
  /** Hex (`#RRGGBB`) — sunucu bu deseni doğruluyor, preset DEĞİL. */
  color: string;
  position: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string[];
  iconUrl: string | null;
  /** C21 — tek emoji (yalnız görünüm); yoksa null. */
  unicodeEmoji: string | null;
  isEveryone: boolean;
  isDefault: boolean;
  memberCount: number;
}

export interface CreateRoleBody {
  name: string;
  color?: string;
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: string[];
  /** C21 — null = kaldır. */
  unicodeEmoji?: string | null;
}

export const rolesApi = {
  /** Sprint M1i — `PATCH /guilds/:id/roles/reorder` (OWNER/ADMIN). **@everyone hariç** (sunucu). */
  async reorder(guildId: string, items: { id: string; position: number }[]): Promise<null> {
    const res = await http.patch<null>(`/guilds/${guildId}/roles/reorder`, { items });
    return res.data;
  },
  /** `position` DESC sırayla gelir (sunucu öyle döndürüyor) — istemci yeniden sıralamaz. */
  async listByGuild(guildId: string): Promise<RoleDto[]> {
    const res = await http.get<RoleDto[]>(`/guilds/${guildId}/roles`);
    return res.data;
  },

  async create(guildId: string, body: CreateRoleBody): Promise<RoleDto> {
    const res = await http.post<RoleDto>(`/guilds/${guildId}/roles`, body);
    return res.data;
  },

  async update(roleId: string, body: Partial<CreateRoleBody> & { isDefault?: boolean }): Promise<RoleDto> {
    const res = await http.patch<RoleDto>(`/roles/${roleId}`, body);
    return res.data;
  },

  async remove(roleId: string): Promise<null> {
    const res = await http.delete<null>(`/roles/${roleId}`);
    return res.data;
  },

  /** İkisi de idempotent; dönüş güncel üye (rolleri dahil). */
  async assign(roleId: string, userId: string): Promise<GuildMemberDto> {
    const res = await http.post<GuildMemberDto>(`/roles/${roleId}/members/${userId}`);
    return res.data;
  },

  async unassign(roleId: string, userId: string): Promise<GuildMemberDto> {
    const res = await http.delete<GuildMemberDto>(`/roles/${roleId}/members/${userId}`);
    return res.data;
  },
};

/**
 * 16 izin bayrağı — `web/src/i18n/tr.json` `guildSettings.permsFlags` ile **birebir aynı sıra**.
 * Etiket ve açıklama oradan okunur, burada metin YOK.
 *
 * Gruplama Discord'un okumasını izler ama bayraklar bizim: bizde olmayan izin (webhook, timeout,
 * thread, sticker…) yok.
 */
export const PERMISSION_GROUPS = [
  {
    key: 'general',
    flags: ['VIEW_CHANNELS', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_GUILD', 'MANAGE_EMOJIS'],
  },
  {
    key: 'membership',
    flags: ['CREATE_INVITE', 'KICK_MEMBERS', 'BAN_MEMBERS', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES'],
  },
  {
    // Anahtar web'deki `permsGroups.message` ile aynı olmalı — başlık oradan okunuyor.
    key: 'message',
    flags: ['MANAGE_MESSAGES', 'MANAGE_EVENTS', 'MENTION_EVERYONE'],
  },
  {
    key: 'voice',
    flags: ['MUTE_MEMBERS', 'MOVE_MEMBERS', 'PRIORITY_SPEAKER'],
  },
] as const;
