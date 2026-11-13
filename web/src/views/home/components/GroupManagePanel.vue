<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useRouter } from 'vue-router'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import UserCardPopover from '@/components/shared/UserCardPopover.vue'
import ContextMenuShell from '@/components/shared/ContextMenuShell.vue'
import { canMentionUser, mentionUser } from '@/composables/useComposerMentionBridge'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import { canModerateGroupTarget, groupRoleOf } from '@/utils/groupRoles'
import type { GroupDmMemberDto } from '@/types'

const props = defineProps<{
  groupId: string
  ownerId: string
  adminIds?: string[]
  members: GroupDmMemberDto[]
}>()
// Üye Ekle, Düzenle (ad) ve Grubu Sil DM satırı sağ-tık menüsünde (`DmList.vue`, C51).
// C60: üye eylemleri (profil, mesaj, bahset, ID kopyala, yönetici ver/al, çıkar, ayrıl)
// satır sağ-tık menüsünde; hover düğmeleri kalktı. Görünürlük yalnız gizleme amaçlı;
// kapı sunucuda (group-roles, R7).
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const authStore = useAuthStore()
const toast = useToastStore()
const router = useRouter()

const isOwner = computed(() => authStore.user?.id === props.ownerId)
const myRole = computed(() => groupRoleOf(props, authStore.user?.id))
const isAdmin = (memberId: string) => groupRoleOf(props, memberId) === 'admin'
const isSelf = (memberId: string) => memberId === authStore.user?.id
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

// ── Sağ-tık menüsü (C60) ────────────────────────────────────────────────────
const menuMember = ref<GroupDmMemberDto | null>(null)
const menuX = ref(0)
const menuY = ref(0)

function openMenu(member: GroupDmMemberDto, e: MouseEvent) {
  closeCard()
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuMember.value = member
}
function closeMenu() {
  menuMember.value = null
}
function menuProfile() {
  const m = menuMember.value
  if (!m) return
  closeMenu()
  cardUserId.value = m.id
  cardX.value = menuX.value
  cardY.value = menuY.value
  showCard.value = true
}
async function menuMessage() {
  const m = menuMember.value
  closeMenu()
  if (!m) return
  try {
    const channel = await dmStore.openChannel(m.id)
    await router.push({ name: 'dm', params: { channelId: channel.id } })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('common.error'))
  }
}
function menuMention() {
  const m = menuMember.value
  closeMenu()
  if (m) mentionUser(m.id, m.username)
}
async function menuCopyId() {
  const m = menuMember.value
  closeMenu()
  if (!m) return
  try {
    await navigator.clipboard.writeText(m.id)
    toast.success(t('userCard.idCopied'))
  } catch {
    // sessizce geç
  }
}
function menuToggleAdmin() {
  const m = menuMember.value
  closeMenu()
  if (m) void toggleAdmin(m)
}
function menuRemove() {
  removeMemberTarget.value = menuMember.value
  closeMenu()
}

// Gruptan ayrıl (kendi satırı): DmList'teki akışın aynısı (`dmStore.leaveGroup` + ana sayfa)
const leaveOpen = ref(false)
const leaving = ref(false)
function menuLeave() {
  closeMenu()
  leaveOpen.value = true
}
async function confirmLeave() {
  if (leaving.value) return
  leaving.value = true
  try {
    await dmStore.leaveGroup(props.groupId)
    await router.push({ name: 'app' })
  } catch {
    toast.error(t('group.leaveError'))
  } finally {
    leaving.value = false
    leaveOpen.value = false
  }
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
        @contextmenu.prevent="openMenu(member, $event)"
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
      </div>
    </div>
  </aside>

  <!-- Üye sağ-tık menüsü (C60) -->
  <ContextMenuShell
    v-if="menuMember"
    :x="menuX"
    :y="menuY"
    menu-id="group-member"
    @close="closeMenu"
  >
    <button class="kv-ctx__item" role="menuitem" @click="menuProfile">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>{{ t('member.actions.profile') }}</span>
    </button>
    <button v-if="!isSelf(menuMember.id)" class="kv-ctx__item" role="menuitem" @click="menuMessage">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>{{ t('member.actions.sendMessage') }}</span>
    </button>
    <button v-if="canMentionUser(menuMember.id)" class="kv-ctx__item" role="menuitem" @click="menuMention">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
      <span>{{ t('member.actions.mention') }}</span>
    </button>
    <button class="kv-ctx__item" role="menuitem" @click="menuCopyId">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <span>{{ t('member.actions.copyId') }}</span>
    </button>
    <button
      v-if="isOwner && menuMember.id !== ownerId"
      class="kv-ctx__item"
      role="menuitem"
      :disabled="togglingAdminId === menuMember.id"
      @click="menuToggleAdmin"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>{{ isAdmin(menuMember.id) ? t('group.removeAdmin') : t('group.makeAdmin') }}</span>
    </button>
    <template v-if="canRemove(menuMember.id) || isSelf(menuMember.id)">
      <div class="kv-ctx__divider" />
      <button v-if="canRemove(menuMember.id)" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="menuRemove">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        <span>{{ t('group.removeMember') }}</span>
      </button>
      <button v-if="isSelf(menuMember.id)" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="menuLeave">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>{{ t('group.leaveGroup') }}</span>
      </button>
    </template>
  </ContextMenuShell>

  <!-- Gruptan ayrıl onayı (kendi satırı) -->
  <ConfirmDialog
    v-if="leaveOpen"
    :message="t('group.leaveConfirm')"
    :confirm-label="t('group.leaveAction')"
    :loading="leaving"
    @confirm="confirmLeave"
    @cancel="leaveOpen = false"
  />

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
