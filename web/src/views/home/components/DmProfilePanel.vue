<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFriendsStore } from '@/stores/friends'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { FriendCodeUserDto } from '@/types'

const props = defineProps<{ otherUser: FriendCodeUserDto }>()

const { t } = useI18n()
const friendsStore = useFriendsStore()

onMounted(() => Promise.all([friendsStore.fetchFriends(), friendsStore.fetchBlocked()]))

const isFriend = computed(() => friendsStore.friends.some((f) => f.user.id === props.otherUser.id))
const isBlocked = computed(() => friendsStore.blocked.some((b) => b.user.id === props.otherUser.id))

const confirmState = ref<{ show: boolean; message: string; action: () => Promise<void> }>({
  show: false, message: '', action: async () => {},
})
const confirmLoading = ref(false)

function openConfirm(message: string, action: () => Promise<void>) {
  confirmState.value = { show: true, message, action }
  confirmLoading.value = false
}

async function runConfirm() {
  confirmLoading.value = true
  try {
    await confirmState.value.action()
  } finally {
    confirmLoading.value = false
    confirmState.value.show = false
  }
}
</script>

<template>
  <aside
    class="shrink-0 flex flex-col mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
  >
    <!-- Avatar + ad -->
    <div
      class="flex flex-col items-center pt-8 pb-6 px-4 gap-3 border-b"
      style="border-color: var(--kv-border-subtle);"
    >
      <div
        class="w-16 h-16 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[22px] font-bold text-white"
        style="background-color: var(--kv-accent-500);"
      >
        <img
          v-if="otherUser.avatarUrl"
          :src="otherUser.avatarUrl"
          :alt="otherUser.username"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ otherUser.username[0].toUpperCase() }}</span>
      </div>
      <p class="text-[16px] font-bold text-center" style="color: var(--kv-text-primary);">
        {{ otherUser.username }}
      </p>
    </div>

    <!-- Aksiyonlar -->
    <div class="p-4 flex flex-col gap-2">
      <button
        v-if="isFriend && !isBlocked"
        class="w-full py-2 text-[13px] font-medium rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
        @click="openConfirm(t('friends.confirmRemove'), () => friendsStore.removeFriend(otherUser.id))"
      >
        {{ t('friends.remove') }}
      </button>
      <button
        v-if="!isBlocked"
        class="w-full py-2 text-[13px] font-medium rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-danger);"
        @click="openConfirm(t('friends.confirmBlock'), () => friendsStore.blockUser(otherUser.id))"
      >
        {{ t('friends.block') }}
      </button>
      <button
        v-if="isBlocked"
        class="w-full py-2 text-[13px] font-medium rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
        @click="friendsStore.unblockUser(otherUser.id)"
      >
        {{ t('friends.unblock') }}
      </button>
    </div>

    <ConfirmDialog
      v-if="confirmState.show"
      :message="confirmState.message"
      :loading="confirmLoading"
      @confirm="runConfirm"
      @cancel="confirmState.show = false"
    />
  </aside>
</template>
