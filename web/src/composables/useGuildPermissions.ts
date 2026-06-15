import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useRolesStore } from '@/stores/roles'
import { useMembersStore } from '@/stores/members'

/**
 * Client-tarafı efektif izin çözücü (UX gating).
 *
 * Backend (`PermissionsService.effectivePermissions`) güvenlik otoritesidir; bu composable
 * yalnız "bu butonu/sekmeyi göster mi" kararı için aynı 4 adımı aynalar — CLAUDE.md:
 * "Frontend validasyon yalnız UX'tir; güvenlik otoritesi backend."
 *
 * Adımlar (backend ile birebir):
 *  1. guild.ownerId === ben → tüm izinler
 *  2. enum rolüm OWNER/ADMIN (geçiş-uyum) → tüm izinler
 *  3. efektif = @everyone.permissions ∪ atanmış rollerimin permissions
 *  4. efektif ADMINISTRATOR içeriyorsa → tüm izinler; aksi hâlde flag ∈ efektif
 *
 * NOT: roller + üyeler store'da yüklü olmalı (granular izinler için). OWNER/enum-ADMIN
 * yolu store yüklenmeden de çalışır (ownerId + myRoleByGuild yeterli) → fail-safe.
 */
export function useGuildPermissions(guildId: () => string) {
  const authStore = useAuthStore()
  const guildsStore = useGuildsStore()
  const rolesStore = useRolesStore()
  const membersStore = useMembersStore()

  const gid = computed(guildId)

  const isOwner = computed(() => {
    const uid = authStore.user?.id
    if (!uid) return false
    const guild = guildsStore.guilds.find((g) => g.id === gid.value)
    return !!guild && guild.ownerId === uid
  })

  // Atanmış rollerim + @everyone'dan gelen efektif bayrak kümesi
  const effectiveFlags = computed<Set<string>>(() => {
    const uid = authStore.user?.id
    const flags = new Set<string>()
    if (!uid) return flags
    const roles = rolesStore.rolesFor(gid.value)
    const myMember = membersStore.membersFor(gid.value).find((m) => m.userId === uid)
    const myRoleIds = new Set((myMember?.roles ?? []).map((r) => r.id))
    for (const r of roles) {
      if (r.isEveryone || myRoleIds.has(r.id)) {
        for (const f of r.permissions) flags.add(f)
      }
    }
    return flags
  })

  // Tüm izinlere sahip miyim (OWNER / enum-ADMIN / ADMINISTRATOR bayrağı)
  const hasAll = computed(() => {
    if (isOwner.value) return true
    const enumRole = guildsStore.myRoleByGuild[gid.value]
    if (enumRole === 'OWNER' || enumRole === 'ADMIN') return true
    return effectiveFlags.value.has('ADMINISTRATOR')
  })

  function can(flag: string): boolean {
    return hasAll.value || effectiveFlags.value.has(flag)
  }

  // Ayarlar penceresini açabilir mi (içinde yapabileceği bir şey var mı)
  const canOpenSettings = computed(
    () =>
      isOwner.value ||
      can('MANAGE_GUILD') ||
      can('MANAGE_ROLES') ||
      can('CREATE_INVITE') ||
      can('BAN_MEMBERS'),
  )

  return { isOwner, can, hasAll, canOpenSettings }
}
