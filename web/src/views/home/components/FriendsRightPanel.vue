<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFriendsStore } from '@/stores/friends'
import { useDmStore } from '@/stores/dm'
import { usePresenceStore } from '@/stores/presence'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const props = defineProps<{ initialTab?: 'all' | 'pending' | 'blocked' }>()
const emit = defineEmits<{ addFriend: []; openDm: [channelId: string] }>()

const { t } = useI18n()
const friendsStore = useFriendsStore()
const dmStore = useDmStore()
const presenceStore = usePresenceStore()

type Tab = 'all' | 'pending' | 'blocked'
const activeTab = ref<Tab>(props.initialTab ?? 'all')
const openMenuId = ref<string | null>(null)
const dmLoading = ref<string | null>(null)
const confirmState = ref<{ show: boolean; message: string; action: () => Promise<void> }>({
  show: false, message: '', action: async () => {},
})
const confirmLoading = ref(false)

onMounted(() =>
  Promise.all([friendsStore.fetchFriends(), friendsStore.fetchRequests(), friendsStore.fetchBlocked()]),
)

const incomingRequests = computed(() => friendsStore.requests.filter((r) => r.direction === 'incoming'))
const outgoingRequests = computed(() => friendsStore.requests.filter((r) => r.direction === 'outgoing'))
const pendingCount = computed(() => incomingRequests.value.length)

const onlineFriends = computed(() =>
  friendsStore.friends.filter((f) => presenceStore.getStatus(f.user.id) !== 'offline'),
)
const offlineFriends = computed(() =>
  friendsStore.friends.filter((f) => presenceStore.getStatus(f.user.id) === 'offline'),
)

function presenceStatusLabel(userId: string): string {
  const status = presenceStore.getStatus(userId)
  return t(`presence.${status}`)
}

function presenceStatusColor(userId: string): string {
  const status = presenceStore.getStatus(userId)
  if (status === 'online') return 'var(--kv-online)'
  if (status === 'away') return 'var(--kv-idle)'
  if (status === 'dnd') return 'var(--kv-dnd)'
  return 'var(--kv-text-muted)'
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
</script>

<template>
  <!-- Dropdown kapatan overlay -->
  <div v-if="openMenuId" class="fixed inset-0 z-10" @click="openMenuId = null" />

  <aside
    class="shrink-0 flex flex-col mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden relative"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
  >
    <!-- Başlık + sekmeler -->
    <div class="px-4 pt-5 pb-0 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <h2 class="text-[15px] font-bold mb-3" style="color: var(--kv-text-primary);">
        {{ t('friends.title') }}
      </h2>
      <div class="flex justify-between">
        <button
          v-for="[key, label] in ([['all', t('friends.tabAll')], ['pending', t('friends.tabPending')], ['blocked', t('friends.tabBlocked')]] as [Tab, string][])"
          :key="key"
          class="flex items-center pb-3 mb-[-1px] text-[13px] font-medium border-b-2 transition-colors cursor-pointer"
          :class="activeTab === key
            ? 'border-[var(--kv-accent-500)] text-[var(--kv-accent-500)]'
            : 'border-transparent text-[var(--kv-text-muted)] hover:text-[var(--kv-accent-500)]'"
          @click="activeTab = key"
        >
          {{ label }}
          <span
            v-if="key === 'pending' && pendingCount > 0"
            class="px-1.5 py-px text-[10px] rounded-full text-white"
            style="background-color: var(--kv-danger);"
          >{{ pendingCount }}</span>
        </button>
      </div>
    </div>

    <!-- İçerik -->
    <div class="flex-1 overflow-y-auto pb-14">

      <!-- Tümü -->
      <template v-if="activeTab === 'all'">
        <p
          v-if="!friendsStore.friends.length"
          class="text-center py-12 text-[13px] px-4"
          style="color: var(--kv-text-muted);"
        >{{ t('friends.noFriends') }}</p>

        <template v-else>
          <!-- Çevrimiçi grup -->
          <template v-if="onlineFriends.length">
            <p
              class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-widest"
              style="color: var(--kv-text-muted);"
            >
              {{ t('home.onlineSection', { count: onlineFriends.length }) }}
            </p>
            <div
              v-for="f in onlineFriends"
              :key="f.friendshipId"
              class="group relative flex items-center gap-2.5 px-3 mx-1 py-2.5 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
            >
              <!-- Avatar + presence noktası -->
              <div class="relative shrink-0">
                <div
                  class="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-[12px] font-bold text-white"
                  style="background-color: var(--kv-accent-500);"
                >
                  <img v-if="f.user.avatarUrl" :src="f.user.avatarUrl" :alt="f.user.username" class="w-full h-full object-cover" />
                  <span v-else>{{ f.user.username[0].toUpperCase() }}</span>
                </div>
                <PresenceDot
                  :status="presenceStore.getStatus(f.user.id)"
                  border-color="var(--kv-bg-sidebar)"
                  class="absolute bottom-0 right-0 w-2.5 h-2.5"
                />
              </div>

              <!-- Ad + durum -->
              <div class="flex-1 min-w-0 cursor-pointer" @click="openDm(f.user.id)">
                <p class="text-[13px] font-medium truncate" style="color: var(--kv-text-primary);">{{ f.user.username }}</p>
                <p class="text-[11px]" :style="{ color: presenceStatusColor(f.user.id) }">{{ presenceStatusLabel(f.user.id) }}</p>
              </div>

              <!-- Hover aksiyonlar -->
              <div
                class="flex items-center gap-1 shrink-0 transition-opacity"
                :class="openMenuId === f.friendshipId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
              >
                <button
                  class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[var(--kv-bg-content)]"
                  style="color: var(--kv-text-secondary);"
                  :disabled="dmLoading === f.user.id"
                  @click.stop="openDm(f.user.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <div class="relative">
                  <button
                    class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[var(--kv-bg-content)]"
                    style="color: var(--kv-text-secondary);"
                    @click.stop="openMenuId = openMenuId === f.friendshipId ? null : f.friendshipId"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                    </svg>
                  </button>
                  <div
                    v-if="openMenuId === f.friendshipId"
                    class="absolute right-0 top-full mt-1 w-44 rounded-[var(--kv-radius-md)] border py-1 z-20"
                    style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle); box-shadow: 0 4px 16px rgba(0,0,0,0.3);"
                  >
                    <button
                      class="w-full flex items-center px-3 py-2 text-[13px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                      style="color: var(--kv-text-primary);"
                      @click.stop="openDm(f.user.id)"
                    >{{ t('friends.dm') }}</button>
                    <button
                      class="w-full flex items-center px-3 py-2 text-[13px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                      style="color: var(--kv-text-primary);"
                      @click.stop="openConfirm(t('friends.confirmRemove'), () => friendsStore.removeFriend(f.user.id))"
                    >{{ t('friends.remove') }}</button>
                    <button
                      class="w-full flex items-center px-3 py-2 text-[13px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                      style="color: var(--kv-danger);"
                      @click.stop="openConfirm(t('friends.confirmBlock'), () => friendsStore.blockUser(f.user.id))"
                    >{{ t('friends.block') }}</button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Çevrimdışı grup -->
          <template v-if="offlineFriends.length">
            <p
              class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-widest"
              style="color: var(--kv-text-muted);"
            >
              {{ t('home.offlineSection', { count: offlineFriends.length }) }}
            </p>
            <div
              v-for="f in offlineFriends"
              :key="f.friendshipId"
              class="group relative flex items-center gap-2.5 px-3 mx-1 py-2.5 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
            >
              <!-- Avatar + presence noktası -->
              <div class="relative shrink-0">
                <div
                  class="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-[12px] font-bold text-white"
                  style="background-color: var(--kv-accent-500);"
                >
                  <img v-if="f.user.avatarUrl" :src="f.user.avatarUrl" :alt="f.user.username" class="w-full h-full object-cover" />
                  <span v-else>{{ f.user.username[0].toUpperCase() }}</span>
                </div>
                <PresenceDot
                  :status="presenceStore.getStatus(f.user.id)"
                  border-color="var(--kv-bg-sidebar)"
                  class="absolute bottom-0 right-0 w-2.5 h-2.5"
                />
              </div>

              <!-- Ad + durum -->
              <div class="flex-1 min-w-0 cursor-pointer" @click="openDm(f.user.id)">
                <p class="text-[13px] font-medium truncate" style="color: var(--kv-text-primary);">{{ f.user.username }}</p>
                <p class="text-[11px]" style="color: var(--kv-text-muted);">{{ presenceStatusLabel(f.user.id) }}</p>
              </div>

              <!-- Hover aksiyonlar -->
              <div
                class="flex items-center gap-1 shrink-0 transition-opacity"
                :class="openMenuId === f.friendshipId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
              >
                <button
                  class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[var(--kv-bg-content)]"
                  style="color: var(--kv-text-secondary);"
                  :disabled="dmLoading === f.user.id"
                  @click.stop="openDm(f.user.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <div class="relative">
                  <button
                    class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[var(--kv-bg-content)]"
                    style="color: var(--kv-text-secondary);"
                    @click.stop="openMenuId = openMenuId === f.friendshipId ? null : f.friendshipId"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                    </svg>
                  </button>
                  <div
                    v-if="openMenuId === f.friendshipId"
                    class="absolute right-0 top-full mt-1 w-44 rounded-[var(--kv-radius-md)] border py-1 z-20"
                    style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle); box-shadow: 0 4px 16px rgba(0,0,0,0.3);"
                  >
                    <button
                      class="w-full flex items-center px-3 py-2 text-[13px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                      style="color: var(--kv-text-primary);"
                      @click.stop="openDm(f.user.id)"
                    >{{ t('friends.dm') }}</button>
                    <button
                      class="w-full flex items-center px-3 py-2 text-[13px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                      style="color: var(--kv-text-primary);"
                      @click.stop="openConfirm(t('friends.confirmRemove'), () => friendsStore.removeFriend(f.user.id))"
                    >{{ t('friends.remove') }}</button>
                    <button
                      class="w-full flex items-center px-3 py-2 text-[13px] cursor-pointer text-left hover:bg-[var(--kv-bg-elevated)]"
                      style="color: var(--kv-danger);"
                      @click.stop="openConfirm(t('friends.confirmBlock'), () => friendsStore.blockUser(f.user.id))"
                    >{{ t('friends.block') }}</button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>
      </template>

      <!-- Bekleyen -->
      <template v-else-if="activeTab === 'pending'">
        <template v-if="incomingRequests.length">
          <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('friends.incoming') }} — {{ incomingRequests.length }}
          </p>
          <div
            v-for="r in incomingRequests"
            :key="r.id"
            class="flex items-center gap-2.5 px-3 mx-1 py-2.5 rounded-[var(--kv-radius-md)]"
          >
            <div class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold text-white" style="background-color: var(--kv-accent-500);">
              <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" :alt="r.user.username" class="w-full h-full object-cover" />
              <span v-else>{{ r.user.username[0].toUpperCase() }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-medium truncate" style="color: var(--kv-text-primary);">{{ r.user.username }}</p>
              <p class="text-[11px]" style="color: var(--kv-text-muted);">{{ t('friends.incomingRequestLabel') }}</p>
            </div>
            <div class="flex gap-1.5 shrink-0">
              <button
                class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                style="background-color: #3DB46E; color: white;"
                :title="t('friends.accept')"
                @click="friendsStore.acceptRequest(r.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button
                class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                style="background-color: var(--kv-danger); color: white;"
                :title="t('friends.decline')"
                @click="friendsStore.declineRequest(r.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </template>

        <template v-if="outgoingRequests.length">
          <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('friends.outgoing') }} — {{ outgoingRequests.length }}
          </p>
          <div
            v-for="r in outgoingRequests"
            :key="r.id"
            class="flex items-center gap-2.5 px-3 mx-1 py-2.5 rounded-[var(--kv-radius-md)]"
          >
            <div class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold text-white" style="background-color: var(--kv-accent-500);">
              <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" :alt="r.user.username" class="w-full h-full object-cover" />
              <span v-else>{{ r.user.username[0].toUpperCase() }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-medium truncate" style="color: var(--kv-text-primary);">{{ r.user.username }}</p>
              <p class="text-[11px]" style="color: var(--kv-text-muted);">{{ t('friends.pending') }}</p>
            </div>
          </div>
        </template>

        <p
          v-if="!incomingRequests.length && !outgoingRequests.length"
          class="text-center py-12 text-[13px] px-4"
          style="color: var(--kv-text-muted);"
        >{{ t('friends.noPending') }}</p>
      </template>

      <!-- Engellenmiş -->
      <template v-else-if="activeTab === 'blocked'">
        <p
          v-if="!friendsStore.blocked.length"
          class="text-center py-12 text-[13px] px-4"
          style="color: var(--kv-text-muted);"
        >{{ t('friends.noBlocked') }}</p>
        <template v-else>
          <p class="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('friends.tabBlocked') }} — {{ friendsStore.blocked.length }}
          </p>
          <div
            v-for="b in friendsStore.blocked"
            :key="b.user.id"
            class="group flex items-center gap-2.5 px-3 mx-1 py-2.5 rounded-[var(--kv-radius-md)] hover:bg-[var(--kv-bg-elevated)]"
          >
            <div
              class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold opacity-40"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            >
              {{ b.user.username[0].toUpperCase() }}
            </div>
            <p class="flex-1 text-[13px] font-medium truncate" style="color: var(--kv-text-muted);">{{ b.user.username }}</p>
            <button
              class="hidden group-hover:block px-2 py-1 text-[12px] font-medium rounded-[var(--kv-radius-sm)] cursor-pointer shrink-0"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
              @click="friendsStore.unblockUser(b.user.id)"
            >{{ t('friends.unblock') }}</button>
          </div>
        </template>
      </template>

    </div>

    <!-- "+ Yeni Kanka Ekle" sabit alt buton -->
    <div
      class="absolute bottom-0 left-0 right-0 p-3 border-t"
      style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
    >
      <button
        class="w-full py-2.5 text-[13px] font-semibold rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-90"
        style="background-color: var(--kv-accent-500); color: white;"
        @click="emit('addFriend')"
      >
        {{ t('home.addFriendBtn') }}
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
