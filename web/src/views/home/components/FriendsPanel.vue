<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useDmStore } from '@/stores/dm'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const emit = defineEmits<{ openDm: [channelId: string] }>()

const { t } = useI18n()
const authStore = useAuthStore()
const friendsStore = useFriendsStore()
const dmStore = useDmStore()

type Tab = 'all' | 'pending' | 'blocked'
const activeTab = ref<Tab>('all')
const friendCodeInput = ref('')
const addError = ref('')
const addSuccess = ref('')
const addLoading = ref(false)
const dmLoading = ref<string | null>(null)
const confirmState = ref<{ show: boolean; message: string; action: () => Promise<void> }>({
  show: false,
  message: '',
  action: async () => {},
})
const confirmLoading = ref(false)

const ownCode = computed(() => authStore.user?.friendCode ?? '')
const { copy, copied } = useClipboard({ source: ownCode })

const incomingRequests = computed(() => friendsStore.requests.filter((r) => r.direction === 'incoming'))
const outgoingRequests = computed(() => friendsStore.requests.filter((r) => r.direction === 'outgoing'))
const pendingCount = computed(() => incomingRequests.value.length)

onMounted(() =>
  Promise.all([friendsStore.fetchFriends(), friendsStore.fetchRequests(), friendsStore.fetchBlocked()]),
)

async function sendRequest() {
  if (!friendCodeInput.value.trim()) return
  addLoading.value = true
  addError.value = ''
  addSuccess.value = ''
  try {
    await friendsStore.sendRequest(friendCodeInput.value.trim())
    friendCodeInput.value = ''
    addSuccess.value = t('friends.requestSent')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    addError.value = code
      ? (t(`friends.errors.${code}`) || err.response?.data?.message || t('common.error'))
      : t('common.error')
  } finally {
    addLoading.value = false
  }
}

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

async function openDm(userId: string) {
  dmLoading.value = userId
  try {
    const channel = await dmStore.openChannel(userId)
    emit('openDm', channel.id)
  } finally {
    dmLoading.value = null
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--kv-bg-content);">
    <!-- Üst bölüm: başlık + kendi kodu + arkadaş ekle formu -->
    <div class="px-6 pt-6 pb-4 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <h2 class="text-[18px] font-semibold mb-4" style="color: var(--kv-text-primary);">
        {{ t('friends.title') }}
      </h2>

      <!-- Kendi arkadaş kodu -->
      <div
        class="flex items-center gap-2 mb-4 px-3 py-2 rounded-[var(--kv-radius-md)]"
        style="background-color: var(--kv-bg-elevated);"
      >
        <span class="text-[12px] shrink-0" style="color: var(--kv-text-muted);">{{ t('friends.myCode') }}:</span>
        <code class="flex-1 font-mono text-[13px] font-semibold tracking-wider" style="color: var(--kv-text-primary);">
          {{ ownCode }}
        </code>
        <button
          class="text-[12px] px-2 py-0.5 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer shrink-0"
          :style="copied
            ? 'color: #3DB46E;'
            : 'color: var(--kv-text-secondary);'"
          @click="copy()"
        >
          {{ copied ? t('friends.copied') : t('friends.copy') }}
        </button>
      </div>

      <!-- Arkadaş ekle formu -->
      <form class="flex gap-2" @submit.prevent="sendRequest">
        <KvInput
          v-model="friendCodeInput"
          :placeholder="t('friends.codePlaceholder')"
          class="flex-1"
        />
        <KvButton type="submit" :loading="addLoading" size="sm" class="shrink-0">
          {{ t('friends.addButton') }}
        </KvButton>
      </form>
      <p v-if="addSuccess" class="mt-1 text-[12px]" style="color: #3DB46E;">{{ addSuccess }}</p>
      <p v-if="addError" class="mt-1 text-[12px]" style="color: var(--kv-danger);">{{ addError }}</p>
    </div>

    <!-- Alt sekmeler -->
    <div class="flex px-6 gap-4 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <button
        v-for="[key, label] in ([['all', t('friends.tabAll')], ['pending', t('friends.tabPending')], ['blocked', t('friends.tabBlocked')]] as [Tab, string][])"
        :key="key"
        class="relative pb-2 pt-3 text-[13px] font-medium border-b-2 transition-colors cursor-pointer"
        :style="activeTab === key
          ? 'border-color: var(--kv-accent-500); color: var(--kv-text-primary);'
          : 'border-color: transparent; color: var(--kv-text-muted);'"
        @click="activeTab = key"
      >
        {{ label }}
        <span
          v-if="key === 'pending' && pendingCount > 0"
          class="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full text-white"
          style="background-color: var(--kv-danger);"
        >
          {{ pendingCount }}
        </span>
      </button>
    </div>

    <!-- İçerik -->
    <div class="flex-1 overflow-y-auto px-4 py-3">
      <!-- Tüm Arkadaşlar -->
      <template v-if="activeTab === 'all'">
        <p v-if="!friendsStore.friends.length" class="text-center py-12 text-[14px]" style="color: var(--kv-text-muted);">
          {{ t('friends.noFriends') }}
        </p>
        <div
          v-for="f in friendsStore.friends"
          :key="f.friendshipId"
          class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] group hover:bg-[var(--kv-bg-elevated)]"
        >
          <div class="w-9 h-9 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
            <img v-if="f.user.avatarUrl" :src="f.user.avatarUrl" :alt="f.user.username" class="w-full h-full object-cover" />
            <span v-else class="w-full h-full flex items-center justify-center text-[13px] font-semibold" style="color: var(--kv-text-secondary);">
              {{ f.user.username[0].toUpperCase() }}
            </span>
          </div>
          <p class="flex-1 text-[14px] font-medium truncate" style="color: var(--kv-text-primary);">{{ f.user.username }}</p>
          <div class="hidden group-hover:flex items-center gap-1">
            <button
              class="p-1.5 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :title="t('friends.dm')"
              style="color: var(--kv-text-secondary);"
              :disabled="dmLoading === f.user.id"
              @click="openDm(f.user.id)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              class="p-1.5 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :title="t('friends.remove')"
              style="color: var(--kv-text-muted);"
              @click="openConfirm(t('friends.confirmRemove'), () => friendsStore.removeFriend(f.user.id))"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="8" x2="23" y2="14"/>
                <line x1="23" y1="8" x2="17" y2="14"/>
              </svg>
            </button>
            <button
              class="p-1.5 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :title="t('friends.block')"
              style="color: var(--kv-text-muted);"
              @click="openConfirm(t('friends.confirmBlock'), () => friendsStore.blockUser(f.user.id))"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </button>
          </div>
        </div>
      </template>

      <!-- Bekleyen İstekler -->
      <template v-else-if="activeTab === 'pending'">
        <template v-if="incomingRequests.length">
          <p class="text-[11px] font-semibold mb-2 px-1 uppercase tracking-wider" style="color: var(--kv-text-muted);">
            {{ t('friends.incoming') }} — {{ incomingRequests.length }}
          </p>
          <div
            v-for="r in incomingRequests"
            :key="r.id"
            class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
          >
            <div class="w-9 h-9 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
              <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" :alt="r.user.username" class="w-full h-full object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center text-[13px] font-semibold" style="color: var(--kv-text-secondary);">
                {{ r.user.username[0].toUpperCase() }}
              </span>
            </div>
            <p class="flex-1 text-[14px] font-medium" style="color: var(--kv-text-primary);">{{ r.user.username }}</p>
            <div class="flex gap-2 shrink-0">
              <button
                class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                style="background-color: #3DB46E; color: white;"
                :title="t('friends.accept')"
                @click="friendsStore.acceptRequest(r.id)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button
                class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                style="background-color: var(--kv-danger); color: white;"
                :title="t('friends.decline')"
                @click="friendsStore.declineRequest(r.id)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </template>

        <template v-if="outgoingRequests.length">
          <p class="text-[11px] font-semibold mb-2 mt-5 px-1 uppercase tracking-wider" style="color: var(--kv-text-muted);">
            {{ t('friends.outgoing') }} — {{ outgoingRequests.length }}
          </p>
          <div
            v-for="r in outgoingRequests"
            :key="r.id"
            class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
          >
            <div class="w-9 h-9 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
              <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" :alt="r.user.username" class="w-full h-full object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center text-[13px] font-semibold" style="color: var(--kv-text-secondary);">
                {{ r.user.username[0].toUpperCase() }}
              </span>
            </div>
            <p class="flex-1 text-[14px] font-medium" style="color: var(--kv-text-primary);">{{ r.user.username }}</p>
            <span class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('friends.pending') }}</span>
          </div>
        </template>

        <p
          v-if="!incomingRequests.length && !outgoingRequests.length"
          class="text-center py-12 text-[14px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('friends.noPending') }}
        </p>
      </template>

      <!-- Engellenenler -->
      <template v-else-if="activeTab === 'blocked'">
        <p v-if="!friendsStore.blocked.length" class="text-center py-12 text-[14px]" style="color: var(--kv-text-muted);">
          {{ t('friends.noBlocked') }}
        </p>
        <div
          v-for="b in friendsStore.blocked"
          :key="b.user.id"
          class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] group hover:bg-[var(--kv-bg-elevated)]"
        >
          <div class="w-9 h-9 rounded-full shrink-0 overflow-hidden opacity-50" style="background-color: var(--kv-bg-elevated);">
            <img v-if="b.user.avatarUrl" :src="b.user.avatarUrl" :alt="b.user.username" class="w-full h-full object-cover" />
            <span v-else class="w-full h-full flex items-center justify-center text-[13px] font-semibold" style="color: var(--kv-text-secondary);">
              {{ b.user.username[0].toUpperCase() }}
            </span>
          </div>
          <p class="flex-1 text-[14px] font-medium" style="color: var(--kv-text-muted);">{{ b.user.username }}</p>
          <button
            class="hidden group-hover:block px-3 py-1 text-[13px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            @click="friendsStore.unblockUser(b.user.id)"
          >
            {{ t('friends.unblock') }}
          </button>
        </div>
      </template>
    </div>

    <ConfirmDialog
      v-if="confirmState.show"
      :message="confirmState.message"
      :loading="confirmLoading"
      @confirm="runConfirm"
      @cancel="confirmState.show = false"
    />
  </div>
</template>
