<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useDmStore } from '@/stores/dm'
import KvButton from '@/components/ui/KvButton.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const props = defineProps<{ initialTab?: 'all' | 'pending' | 'blocked' | 'add' }>()
const emit = defineEmits<{ openDm: [channelId: string]; logout: [] }>()

const { t } = useI18n()
const authStore = useAuthStore()
const friendsStore = useFriendsStore()
const dmStore = useDmStore()

type Tab = 'all' | 'pending' | 'blocked' | 'add'
const activeTab = ref<Tab>(props.initialTab ?? 'all')
const searchQuery = ref('')
const codeInput = ref('')
const addError = ref('')
const addSuccess = ref('')
const addLoading = ref(false)
const dmLoading = ref<string | null>(null)
const openMenuId = ref<string | null>(null)

const confirmState = ref<{ show: boolean; message: string; action: () => Promise<void> }>({
  show: false, message: '', action: async () => {},
})
const confirmLoading = ref(false)

const ownCode = computed(() => authStore.user?.friendCode ?? '')
const { copy, copied } = useClipboard({ source: ownCode })

const incomingRequests = computed(() => friendsStore.requests.filter((r) => r.direction === 'incoming'))
const outgoingRequests = computed(() => friendsStore.requests.filter((r) => r.direction === 'outgoing'))
const pendingCount = computed(() => incomingRequests.value.length)

const filteredFriends = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return friendsStore.friends
  return friendsStore.friends.filter((f) => f.user.username.toLowerCase().includes(q))
})

onMounted(() =>
  Promise.all([friendsStore.fetchFriends(), friendsStore.fetchRequests(), friendsStore.fetchBlocked()]),
)

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

async function sendRequest() {
  const code = codeInput.value.trim().toUpperCase()
  if (!code) return
  if (code.length !== 8) {
    addError.value = t('friends.errors.INVALID_CODE')
    return
  }
  addLoading.value = true
  addError.value = ''
  addSuccess.value = ''
  try {
    await friendsStore.sendRequest(code)
    codeInput.value = ''
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
  openMenuId.value = null
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
  openMenuId.value = null
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
  <!-- Dropdown kapatan şeffaf overlay -->
  <div v-if="openMenuId" class="fixed inset-0 z-10" @click="openMenuId = null" />

  <div class="flex flex-1 flex-col min-w-0 h-full overflow-hidden" style="background-color: var(--kv-bg-content);">

    <!-- Üst bar: başlık + sekmeler + Arkadaş Ekle butonu -->
    <div
      class="h-16 flex items-center px-4 gap-1 shrink-0 border-b"
      style="border-color: var(--kv-border-subtle);"
    >
      <!-- Başlık -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" class="shrink-0"
        style="color: var(--kv-text-primary);">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <span class="text-[15px] font-semibold ml-1.5 shrink-0" style="color: var(--kv-text-primary);">
        {{ t('friends.title') }}
      </span>


      <!-- Dikey ayraç -->
      <div class="w-px h-5 mx-3 shrink-0" style="background-color: var(--kv-border-subtle);" />

      <div class="flex items-center gap-3">
   <!-- Sekmeler -->
      <button
        v-for="[key, label] in ([['all', t('friends.tabAll')], ['pending', t('friends.tabPending')], ['blocked', t('friends.tabBlocked')]] as [Tab, string][])"
        :key="key"
        class="relative px-4 py-2 flex items-center text-[14px] font-medium rounded-(--kv-radius-sm) transition-colors cursor-pointer shrink-0 hover:bg-(--kv-accent-subtle)"
        :class="activeTab === key
          ? 'text-[var(--kv-text-primary)]'
          : 'text-[var(--kv-text-muted)] hover:text-[var(--kv-text-primary)]'"
        :style="activeTab === key ? 'background-color: var(--kv-accent-subtle);' : ''"
        @click="activeTab = key"
      >
        {{ label }}
        <span
          v-if="key === 'pending' && pendingCount > 0"
          class="ml-1 px-1.5 py-px text-[10px] rounded-full text-white align-middle"
          style="background-color: var(--kv-danger);"
        >{{ pendingCount }}</span>
      </button>

      <!-- Arkadaş Ekle -->
      <button
        class="h-7 px-5 py-5 flex items-center text-[14px] font-semibold rounded-[var(--kv-radius-sm)] cursor-pointer shrink-0 transition-opacity"
        :style="activeTab === 'add' ? 'opacity:1;' : 'opacity:0.85;'"
        style="background-color: var(--kv-accent-500); color: white;"
        @click="activeTab = 'add'"
      >
        {{ t('friends.tabAdd') }}
      </button>
      </div>
   

      <!-- Çıkış Yap -->
      <div class="ml-auto">
        <button
          class="h-7 px-3 text-[13px] font-medium rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-text-muted);"
          @click="emit('logout')"
        >
          {{ t('common.logout') }}
        </button>
      </div>
    </div>

    <!-- İçerik -->
    <div class="flex-1 overflow-y-auto">

      <!-- ── Tüm Arkadaşlar ── -->
      <template v-if="activeTab === 'all'">
        <!-- Arama -->
        <div class="px-4 pt-4 pb-2">
          <input
            v-model="searchQuery"
            :placeholder="t('friends.searchFriends')"
            class="w-full px-3 py-2 text-[13px] rounded-[var(--kv-radius-md)] outline-none"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border: 1px solid var(--kv-border-subtle);"
          />
        </div>

        <!-- Sayaç başlığı -->
        <p
          v-if="filteredFriends.length"
          class="px-5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest"
          style="color: var(--kv-text-muted);"
        >
          {{ t('friends.allCount', { count: filteredFriends.length }) }}
        </p>

        <p
          v-if="!filteredFriends.length"
          class="text-center py-16 text-[14px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('friends.noFriends') }}
        </p>

        <!-- Arkadaş satırları -->
        <template v-for="(f, i) in filteredFriends" :key="f.friendshipId">
          <div
            class="group relative flex items-center gap-3 mx-2 px-3 py-3 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
          >
            <!-- Avatar -->
            <div class="w-10 h-10 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
              <img v-if="f.user.avatarUrl" :src="f.user.avatarUrl" :alt="f.user.username" class="w-full h-full object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center text-[14px] font-semibold" style="color: var(--kv-text-secondary);">
                {{ f.user.username[0].toUpperCase() }}
              </span>
            </div>

            <!-- Ad + durum -->
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold truncate" style="color: var(--kv-text-primary);">
                {{ f.user.username }}
              </p>
              <p class="text-[12px]" style="color: var(--kv-text-muted);">
                {{ t('friends.statusOffline') }}
              </p>
            </div>

            <!-- Hover aksiyonlar -->
            <div
              class="flex items-center gap-1.5 shrink-0 transition-opacity"
              :class="openMenuId === f.friendshipId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            >
              <!-- Mesaj gönder -->
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
                style="background-color: var(--kv-bg-content); color: var(--kv-text-secondary);"
                :title="t('friends.dm')"
                :disabled="dmLoading === f.user.id"
                @click.stop="openDm(f.user.id)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>

              <!-- ⋮ menü -->
              <div class="relative">
                <button
                  class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
                  style="background-color: var(--kv-bg-content); color: var(--kv-text-secondary);"
                  @click.stop="toggleMenu(f.friendshipId)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.5"/>
                    <circle cx="12" cy="12" r="1.5"/>
                    <circle cx="19" cy="12" r="1.5"/>
                  </svg>
                </button>

                <!-- Dropdown -->
                <div
                  v-if="openMenuId === f.friendshipId"
                  class="absolute right-0 top-full mt-1 w-48 rounded-[var(--kv-radius-md)] border py-1 z-20"
                  style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle); box-shadow: 0 4px 16px rgba(0,0,0,0.3);"
                >
                  <button
                    class="w-full flex items-center px-3 py-2 text-[14px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                    style="color: var(--kv-text-primary);"
                    @click.stop="openDm(f.user.id)"
                  >{{ t('friends.dm') }}</button>
                  <button
                    class="w-full flex items-center px-3 py-2 text-[14px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                    style="color: var(--kv-text-primary);"
                    @click.stop="openConfirm(t('friends.confirmRemove'), () => friendsStore.removeFriend(f.user.id))"
                  >{{ t('friends.remove') }}</button>
                  <button
                    class="w-full flex items-center px-3 py-2 text-[14px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                    style="color: var(--kv-danger);"
                    @click.stop="openConfirm(t('friends.confirmBlock'), () => friendsStore.blockUser(f.user.id))"
                  >{{ t('friends.block') }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Satır ayracı (son hariç) -->
          <div
            v-if="i < filteredFriends.length - 1"
            class="mx-5 h-px"
            style="background-color: var(--kv-border-subtle); opacity: 0.5;"
          />
        </template>
      </template>

      <!-- ── Bekleyen İstekler ── -->
      <template v-else-if="activeTab === 'pending'">
        <template v-if="incomingRequests.length">
          <p class="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('friends.incoming') }} — {{ incomingRequests.length }}
          </p>
          <div
            v-for="r in incomingRequests"
            :key="r.id"
            class="flex items-center gap-3 mx-2 px-3 py-3 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
          >
            <div class="w-10 h-10 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
              <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" :alt="r.user.username" class="w-full h-full object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center text-[14px] font-semibold" style="color: var(--kv-text-secondary);">
                {{ r.user.username[0].toUpperCase() }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ r.user.username }}</p>
              <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('friends.incomingRequestLabel') }}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                style="background-color: #3DB46E; color: white;"
                :title="t('friends.accept')"
                @click="friendsStore.acceptRequest(r.id)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
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
          <p class="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('friends.outgoing') }} — {{ outgoingRequests.length }}
          </p>
          <div
            v-for="r in outgoingRequests"
            :key="r.id"
            class="flex items-center gap-3 mx-2 px-3 py-3 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
          >
            <div class="w-10 h-10 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
              <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" :alt="r.user.username" class="w-full h-full object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center text-[14px] font-semibold" style="color: var(--kv-text-secondary);">
                {{ r.user.username[0].toUpperCase() }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ r.user.username }}</p>
              <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('friends.pending') }}</p>
            </div>
          </div>
        </template>

        <p
          v-if="!incomingRequests.length && !outgoingRequests.length"
          class="text-center py-16 text-[14px]"
          style="color: var(--kv-text-muted);"
        >{{ t('friends.noPending') }}</p>
      </template>

      <!-- ── Engellenmiş ── -->
      <template v-else-if="activeTab === 'blocked'">
        <p
          v-if="friendsStore.blocked.length"
          class="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-widest"
          style="color: var(--kv-text-muted);"
        >
          {{ t('friends.tabBlocked') }} — {{ friendsStore.blocked.length }}
        </p>
        <p
          v-if="!friendsStore.blocked.length"
          class="text-center py-16 text-[14px]"
          style="color: var(--kv-text-muted);"
        >{{ t('friends.noBlocked') }}</p>
        <div
          v-for="b in friendsStore.blocked"
          :key="b.user.id"
          class="group flex items-center gap-3 mx-2 px-3 py-3 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
        >
          <div class="w-10 h-10 rounded-full shrink-0 overflow-hidden opacity-40" style="background-color: var(--kv-bg-elevated);">
            <img v-if="b.user.avatarUrl" :src="b.user.avatarUrl" :alt="b.user.username" class="w-full h-full object-cover" />
            <span v-else class="w-full h-full flex items-center justify-center text-[14px] font-semibold" style="color: var(--kv-text-secondary);">
              {{ b.user.username[0].toUpperCase() }}
            </span>
          </div>
          <p class="flex-1 text-[14px] font-semibold truncate" style="color: var(--kv-text-muted);">{{ b.user.username }}</p>
          <button
            class="hidden group-hover:block px-3 py-1.5 text-[13px] font-medium rounded-[var(--kv-radius-sm)] cursor-pointer shrink-0"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            @click="friendsStore.unblockUser(b.user.id)"
          >{{ t('friends.unblock') }}</button>
        </div>
      </template>

      <!-- ── Arkadaş Ekle ── -->
      <template v-else-if="activeTab === 'add'">
        <div class="px-8 pt-8 pb-6 border-b" style="border-color: var(--kv-border-subtle);">
          <h2 class="text-[22px] font-bold mb-1" style="color: var(--kv-text-primary);">
            {{ t('friends.addTitle') }}
          </h2>
          <p class="text-[14px] mb-6" style="color: var(--kv-text-muted);">
            {{ t('friends.addDescription') }}
          </p>
          <form class="flex gap-3" @submit.prevent="sendRequest">
            <input
              v-model="codeInput"
              :placeholder="t('friends.codePlaceholder')"
              class="flex-1 px-4 py-3 text-[14px] rounded-[var(--kv-radius-md)] outline-none"
              style="background-color: var(--kv-bg-rail); color: var(--kv-text-primary); border: 2px solid var(--kv-border-subtle);"
              @focus="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-accent-500)'"
              @blur="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-border-subtle)'"
            />
            <KvButton type="submit" :loading="addLoading" class="shrink-0">
              {{ t('friends.addButton') }}
            </KvButton>
          </form>
          <p v-if="addSuccess" class="mt-2 text-[13px]" style="color: #3DB46E;">{{ addSuccess }}</p>
          <p v-if="addError" class="mt-2 text-[13px]" style="color: var(--kv-danger);">{{ addError }}</p>
        </div>

        <!-- Kendi handle'ı -->
        <div class="px-8 py-6">
          <p class="text-[11px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
            {{ t('friends.myCode') }}
          </p>
          <div class="flex items-center gap-3">
            <code class="text-[15px] font-mono font-semibold tracking-wider" style="color: var(--kv-text-primary);">
              {{ ownCode }}
            </code>
            <button
              class="px-3 py-1 text-[12px] font-medium rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
              :style="copied
                ? 'background-color: #3DB46E; color: white;'
                : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);'"
              @click="copy()"
            >{{ copied ? t('friends.copied') : t('friends.copy') }}</button>
          </div>
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
