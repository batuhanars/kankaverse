<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import UserCardPopover from '@/components/shared/UserCardPopover.vue'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import { canModerateGroupTarget, groupRoleOf } from '@/utils/groupRoles'
import type { GroupDmMemberDto } from '@/types'

const props = defineProps<{
  groupId: string
  ownerId: string
  adminIds?: string[]
  members: GroupDmMemberDto[]
}>()
// Üye Ekle, Ayrıl, Düzenle (ad) ve Grubu Sil DM satırı sağ-tık menüsünde (`DmList.vue`,
// C51); panel üye listesi + üye çıkarma (kurucu/yönetici) + yönetici atama (kurucu) tutuyor.
// Düğmeler yalnız gizleme amaçlı; kapı sunucuda (group-roles, R7).
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const authStore = useAuthStore()

const isOwner = computed(() => authStore.user?.id === props.ownerId)
const myRole = computed(() => groupRoleOf(props, authStore.user?.id))
const isAdmin = (memberId: string) => groupRoleOf(props, memberId) === 'admin'
const canRemove = (memberId: string) =>
  memberId !== authStore.user?.id &&
  canModerateGroupTarget(myRole.value, groupRoleOf(props, memberId))

// --- Yönetici ver/al (yalnız kurucu) ---
const togglingAdminId = ref<string | null>(null)
async function toggleAdmin(member: GroupDmMemberDto) {
  if (togglingAdminId.value) return
  togglingAdminId.value = member.id
  try {
    await dmStore.setGroupAdmin(props.groupId, member.id, !isAdmin(member.id))
  } catch {
    removeError.value = t('group.adminError')
  } finally {
    togglingAdminId.value = null
  }
}

// ── Kullanıcı kartı popover (üyeye sol-tık — mesaj-yazarı deseni) ───────────
// Sprint C16 — hareketli avatar yalnız hover'daki satırda
const hoveredMemberId = ref<string | null>(null)

const showCard = ref(false)
const cardUserId = ref('')
const cardX = ref(0)
const cardY = ref(0)

function openCard(userId: string, e: MouseEvent) {
  cardUserId.value = userId
  cardX.value = e.clientX
  cardY.value = e.clientY
  showCard.value = true
}

function closeCard() {
  showCard.value = false
}

onMounted(() => window.addEventListener('kv:close-user-cards', closeCard))
onUnmounted(() => window.removeEventListener('kv:close-user-cards', closeCard))

// Sıra: kurucu, yöneticiler, üyeler
const ROLE_ORDER = { owner: 0, admin: 1, member: 2 } as const
const sortedMembers = computed(() =>
  [...props.members].sort(
    (a, b) => ROLE_ORDER[groupRoleOf(props, a.id)] - ROLE_ORDER[groupRoleOf(props, b.id)],
  ),
)

// --- Üye çıkar (owner) ---
const removeMemberTarget = ref<GroupDmMemberDto | null>(null)
const removing = ref(false)
const removeError = ref('')

async function removeMember() {
  if (!removeMemberTarget.value || removing.value) return
  removeError.value = ''
  removing.value = true
  try {
    await dmStore.removeGroupMember(props.groupId, removeMemberTarget.value.id)
  } catch {
    removeError.value = t('group.removeMemberError')
  } finally {
    removing.value = false
    removeMemberTarget.value = null
  }
}
</script>

<template>
  <aside
    class="flex flex-col shrink-0 mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
  >
    <!-- Başlık -->
    <div
      class="flex items-center justify-between px-4 border-b shrink-0"
      style="height: var(--kv-header-height); border-color: var(--kv-border-subtle);"
    >
      <span class="text-[13px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-muted);">
        {{ t('group.members') }}
      </span>
      <button
        class="text-[16px] cursor-pointer transition-opacity hover:opacity-70"
        style="color: var(--kv-text-muted);"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Üye listesi -->
    <div class="flex-1 overflow-y-auto px-3 py-3">
      <p v-if="removeError" class="px-2 pb-2 text-[12px]" style="color: var(--kv-danger);">{{ removeError }}</p>
      <div
        v-for="member in sortedMembers"
        :key="member.id"
        class="group flex items-center gap-3 px-2 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
        @mouseenter="hoveredMemberId = member.id; ($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
        @mouseleave="hoveredMemberId = null; ($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
        @click="openCard(member.id, $event)"
      >
        <div
          class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[14px] font-semibold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          <img
            v-if="hoverAvatarSrc(member, hoveredMemberId === member.id)"
            :src="hoverAvatarSrc(member, hoveredMemberId === member.id) as string"
            :alt="member.username"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ member.username[0].toUpperCase() }}</span>
        </div>
        <span class="flex-1 text-[15px] font-medium truncate" style="color: var(--kv-text-primary);">
          {{ member.username }}
        </span>
        <!-- Taç: kurucu · rozet: yönetici -->
        <span
          v-if="member.id === ownerId"
          class="text-[10px] px-1.5 py-0.5 rounded shrink-0"
          style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
        >
          👑
        </span>
        <span
          v-else-if="isAdmin(member.id)"
          class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
          style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
        >
          {{ t('group.admin') }}
        </span>
        <!-- Yönetici ver/al: yalnız kurucu, kurucu olmayan üyede -->
        <button
          v-if="isOwner && member.id !== ownerId"
          class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-5 h-5 flex items-center justify-center rounded cursor-pointer"
          :style="{ color: isAdmin(member.id) ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)' }"
          :title="isAdmin(member.id) ? t('group.removeAdmin') : t('group.makeAdmin')"
          :disabled="togglingAdminId === member.id"
          @click.stop="toggleAdmin(member)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </button>
        <!-- Çıkar: kurucu herkesi, yönetici yalnız normal üyeyi -->
        <button
          v-if="canRemove(member.id)"
          class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-5 h-5 flex items-center justify-center rounded cursor-pointer"
          style="color: var(--kv-danger);"
          :title="t('group.removeMember')"
          @click.stop="removeMemberTarget = member"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  </aside>

  <!-- Üye çıkar onayı (owner) -->
  <ConfirmDialog
    v-if="removeMemberTarget"
    :message="t('group.removeMemberConfirm', { username: removeMemberTarget.username })"
    :confirm-label="t('group.removeMemberAction')"
    :loading="removing"
    @confirm="removeMember"
    @cancel="removeMemberTarget = null"
  />

  <!-- Kullanıcı kartı (üyeye sol-tık — mesaj-yazarı deseni) -->
  <UserCardPopover
    v-if="showCard"
    :user-id="cardUserId"
    :x="cardX"
    :y="cardY"
    @close="closeCard"
  />
</template>
