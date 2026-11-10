// Grup DM yetki hiyerarşisi: kurucu > yönetici > üye. Sunucudaki `api/src/shared/group-roles`
// kuralının aynası; burada YALNIZ düğmeleri gizlemek için. Kapı sunucuda (R7). Web: utils/groupRoles.ts.
export type GroupRole = 'owner' | 'admin' | 'member';

export function groupRoleOf(
  group: { ownerId: string; adminIds?: string[] },
  userId: string | null | undefined,
): GroupRole {
  if (!userId) return 'member';
  if (group.ownerId === userId) return 'owner';
  return group.adminIds?.includes(userId) ? 'admin' : 'member';
}

/** Mesaj silme / gruptan çıkarma: kurucu herkesi (kendisi hariç), yönetici yalnız normal üyeyi. */
export function canModerateGroupTarget(actor: GroupRole, target: GroupRole): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'admin') return target === 'member';
  return false;
}
