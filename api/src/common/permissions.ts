/**
 * Rol izin bayrakları — tek kaynak sabiti.
 * Faz 2: kaydedilir ama enforce edilmez (enforcement Faz 3).
 * Faz 3 enforcement bu dosyayı kullanacak.
 */
export const PERMISSION_FLAGS = [
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
