/**
 * Rol izin bayrakları — tek kaynak sabiti.
 * Faz 2: kaydedilir ama enforce edilmez (enforcement Faz 3).
 * Faz 3 enforcement bu dosyayı kullanacak.
 *
 * ADMINISTRATOR: Bu bayrak bir rolde varsa o rol tüm izinlere sahip kabul edilir
 * (Ortam Sil + Sahiplik Devri HARİÇ — onlar yalnız OWNER). Faz 3 §52.
 */
export const PERMISSION_FLAGS = [
  'ADMINISTRATOR',
  'VIEW_CHANNELS',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'MANAGE_GUILD',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MANAGE_MESSAGES',
  'MENTION_EVERYONE',
  'MANAGE_EMOJIS',
  'CREATE_INVITE',
  'CHANGE_NICKNAME',
  'MANAGE_NICKNAMES',
  'MUTE_MEMBERS',
  'MOVE_MEMBERS',
  'PRIORITY_SPEAKER',
  'MANAGE_EVENTS',
] as const;

export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];

export const DEFAULT_EVERYONE_PERMISSIONS: PermissionFlag[] = [
  'VIEW_CHANNELS',
  'CREATE_INVITE',
  'CHANGE_NICKNAME',
];

/** Bilinmeyen bayrakları filtreler (forward-compat — gelecekteki client'lar yeni flag gönderebilir). */
export function filterKnownPermissions(flags: string[]): PermissionFlag[] {
  const known = new Set<string>(PERMISSION_FLAGS);
  return flags.filter((f) => known.has(f)) as PermissionFlag[];
}
