<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import UserCardPopover from '@/components/shared/UserCardPopover.vue'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import type { GroupDmMemberDto } from '@/types'

const props = defineProps<{
  groupId: string
  ownerId: string
  members: GroupDmMemberDto[]
}>()
// Üye Ekle, Ayrıl, Düzenle (ad) ve Grubu Sil DM satırı sağ-tık menüsünde (`DmList.vue`,
// C51); panel yalnız üye listesi + üye çıkarma (sahip) tutuyor.
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const authStore = useAuthStore()

const isOwner = computed(() => authStore.user?.id === props.ownerId)

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

// Owner daima listenin en üstünde
const sortedMembers = computed(() => {
  return [...props.members].sort((a, b) => {
    if (a.id === props.ownerId) return -1
    if (b.id === props.ownerId) return 1
    return 0
  })
})

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
        <!-- Taç: owner işareti -->
        <span
          v-if="member.id === ownerId"
          class="text-[10px] px-1.5 py-0.5 rounded shrink-0"
          style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
        >
          👑
        </span>
        <!-- Çıkar butonu: isOwner=true AND bu üye owner değilse -->
        <button
          v-else-if="isOwner && member.id !== authStore.user?.id"
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
