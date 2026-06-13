<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { useFriendsStore } from '@/stores/friends'
import { useAuthStore } from '@/stores/auth'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { GroupDmMemberDto } from '@/types'

const props = defineProps<{
  groupId: string
  groupName: string | null
  ownerId: string
  members: GroupDmMemberDto[]
}>()
const emit = defineEmits<{ close: []; left: []; deleted: [] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const friendsStore = useFriendsStore()
const authStore = useAuthStore()

const isOwner = computed(() => authStore.user?.id === props.ownerId)

// Grupta olmayan kankalar (eklenebilir)
const addableFriends = computed(() =>
  friendsStore.friends.filter((f) => !props.members.find((m) => m.id === f.user.id))
)

// --- Üye ekle ---
const showAddMember = ref(false)
const addingId = ref<string | null>(null)
const addError = ref('')

async function addMember(userId: string) {
  if (addingId.value) return
  addError.value = ''
  addingId.value = userId
  try {
    await dmStore.addGroupMember(props.groupId, userId)
    showAddMember.value = false
  } catch {
    addError.value = t('group.addMemberError')
  } finally {
    addingId.value = null
  }
}

// --- Ayrıl ---
const showLeaveConfirm = ref(false)
const leaving = ref(false)

async function leaveGroup() {
  leaving.value = true
  try {
    await dmStore.leaveGroup(props.groupId)
    emit('left')
  } catch {
    // sessiz hata — zaten bildirim alacak
  } finally {
    leaving.value = false
    showLeaveConfirm.value = false
  }
}

// --- Sil (owner) ---
const showDeleteConfirm = ref(false)
const deleting = ref(false)

async function deleteGroup() {
  deleting.value = true
  try {
    await dmStore.deleteGroup(props.groupId)
    emit('deleted')
  } catch {
    // sessiz hata
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
  }
}

// --- Yeniden adlandır (owner) ---
const showRename = ref(false)
const renameValue = ref(props.groupName ?? '')
const renaming = ref(false)
const renameError = ref('')

async function renameGroup() {
  const name = renameValue.value.trim()
  if (!name || renaming.value) return
  renameError.value = ''
  renaming.value = true
  try {
    await dmStore.renameGroup(props.groupId, name)
    showRename.value = false
  } catch {
    renameError.value = t('group.renameError')
  } finally {
    renaming.value = false
  }
}
</script>

<template>
  <div
    class="w-[220px] flex flex-col shrink-0 border-l overflow-hidden"
    style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
  >
    <!-- Başlık -->
    <div
      class="h-16 flex items-center justify-between px-4 border-b shrink-0"
      style="border-color: var(--kv-border-subtle);"
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
        v-for="member in members"
        :key="member.id"
        class="flex items-center gap-2 px-2 py-1.5 rounded-[var(--kv-radius-sm)]"
      >
        <div
          class="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-semibold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          <img
            v-if="member.avatarUrl"
            :src="member.avatarUrl"
            :alt="member.username"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ member.username[0].toUpperCase() }}</span>
        </div>
        <span class="text-[13px] truncate" style="color: var(--kv-text-primary);">
          {{ member.username }}
        </span>
        <span
          v-if="member.id === ownerId"
          class="text-[10px] px-1.5 py-0.5 rounded ml-auto shrink-0"
          style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
        >
          👑
        </span>
      </div>
    </div>

    <!-- Aksiyonlar -->
    <div class="px-3 pb-4 pt-2 shrink-0 border-t space-y-1" style="border-color: var(--kv-border-subtle);">
      <!-- Üye Ekle -->
      <button
        class="w-full text-left px-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-colors"
        style="color: var(--kv-text-secondary);"
        @mouseenter="($event.target as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
        @mouseleave="($event.target as HTMLElement).style.backgroundColor = 'transparent'"
        @click="showAddMember = true"
      >
        + {{ t('group.addMember') }}
      </button>

      <!-- Yeniden Adlandır (owner) -->
      <button
        v-if="isOwner"
        class="w-full text-left px-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-colors"
        style="color: var(--kv-text-secondary);"
        @mouseenter="($event.target as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
        @mouseleave="($event.target as HTMLElement).style.backgroundColor = 'transparent'"
        @click="showRename = true; renameValue = groupName ?? ''"
      >
        ✏️ {{ t('group.renameGroup') }}
      </button>

      <!-- Ayrıl -->
      <button
        class="w-full text-left px-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-colors"
        style="color: var(--kv-text-muted);"
        @mouseenter="($event.target as HTMLElement).style.color = 'var(--kv-danger)'"
        @mouseleave="($event.target as HTMLElement).style.color = 'var(--kv-text-muted)'"
        @click="showLeaveConfirm = true"
      >
        ← {{ t('group.leaveGroup') }}
      </button>

      <!-- Grubu Sil (owner) -->
      <button
        v-if="isOwner"
        class="w-full text-left px-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-colors"
        style="color: var(--kv-text-muted);"
        @mouseenter="($event.target as HTMLElement).style.color = 'var(--kv-danger)'"
        @mouseleave="($event.target as HTMLElement).style.color = 'var(--kv-text-muted)'"
        @click="showDeleteConfirm = true"
      >
        🗑 {{ t('group.deleteGroup') }}
      </button>
    </div>
  </div>

  <!-- Üye ekle mini-modal -->
  <div
    v-if="showAddMember"
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.5);"
    @click.self="showAddMember = false"
  >
    <div
      class="w-[360px] max-h-[60vh] flex flex-col rounded-[var(--kv-radius-lg)] overflow-hidden"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0" style="border-color: var(--kv-border-subtle);">
        <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('group.addMemberTitle') }}
        </h3>
        <button class="text-[18px] cursor-pointer hover:opacity-70" style="color: var(--kv-text-muted);" @click="showAddMember = false">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto px-3 py-2">
        <p v-if="!addableFriends.length" class="text-[13px] px-2 py-3" style="color: var(--kv-text-muted);">
          {{ t('group.noFriends') }}
        </p>
        <button
          v-for="f in addableFriends"
          :key="f.user.id"
          class="w-full flex items-center gap-3 px-2 py-2 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left"
          :class="addingId === f.user.id ? 'opacity-50 pointer-events-none' : ''"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
          @click="addMember(f.user.id)"
        >
          <div
            class="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-semibold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="f.user.avatarUrl" :src="f.user.avatarUrl" :alt="f.user.username" class="w-full h-full object-cover" />
            <span v-else>{{ f.user.username[0].toUpperCase() }}</span>
          </div>
          <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">{{ f.user.username }}</span>
        </button>
        <p v-if="addError" class="text-[13px] px-2 mt-1" style="color: var(--kv-danger);">{{ addError }}</p>
      </div>
    </div>
  </div>

  <!-- Yeniden adlandır mini-modal -->
  <div
    v-if="showRename"
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.5);"
    @click.self="showRename = false"
  >
    <div
      class="w-[360px] rounded-[var(--kv-radius-lg)] overflow-hidden"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: var(--kv-border-subtle);">
        <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">{{ t('group.renameTitle') }}</h3>
        <button class="text-[18px] cursor-pointer hover:opacity-70" style="color: var(--kv-text-muted);" @click="showRename = false">✕</button>
      </div>
      <div class="px-4 py-4">
        <label class="block text-[11px] font-semibold uppercase tracking-wide mb-1" style="color: var(--kv-text-muted);">
          {{ t('group.renameLabel') }}
        </label>
        <input
          v-model="renameValue"
          maxlength="50"
          :placeholder="t('group.renamePlaceholder')"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border"
          style="background-color: var(--kv-bg-content); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
          @keydown.enter="renameGroup"
        />
        <p v-if="renameError" class="text-[13px] mt-1" style="color: var(--kv-danger);">{{ renameError }}</p>
      </div>
      <div class="flex justify-end gap-2 px-4 pb-4">
        <button
          class="px-4 py-2 text-[14px] rounded-[var(--kv-radius-md)] cursor-pointer hover:opacity-80"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
          @click="showRename = false"
        >{{ t('common.cancel') }}</button>
        <button
          class="px-4 py-2 text-[14px] font-semibold rounded-[var(--kv-radius-md)] cursor-pointer hover:opacity-90 transition-opacity"
          :class="!renameValue.trim() || renaming ? 'opacity-50 cursor-not-allowed' : ''"
          style="background-color: var(--kv-accent-500); color: #fff;"
          :disabled="!renameValue.trim() || renaming"
          @click="renameGroup"
        >{{ t('group.renameAction') }}</button>
      </div>
    </div>
  </div>

  <!-- Ayrıl onayı -->
  <ConfirmDialog
    v-if="showLeaveConfirm"
    :message="t('group.leaveConfirm')"
    :confirm-label="t('group.leaveAction')"
    :loading="leaving"
    @confirm="leaveGroup"
    @cancel="showLeaveConfirm = false"
  />

  <!-- Sil onayı (owner) -->
  <ConfirmDialog
    v-if="showDeleteConfirm"
    :message="t('group.deleteConfirm')"
    :confirm-label="t('group.deleteAction')"
    :loading="deleting"
    @confirm="deleteGroup"
    @cancel="showDeleteConfirm = false"
  />
</template>
