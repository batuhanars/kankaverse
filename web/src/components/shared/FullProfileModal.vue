<script setup lang="ts">
/**
 * FullProfileModal — başkasının tam profil modalı (Sprint C5 §5).
 * Avatar (varsayılan) · username · bio (güvenli markdown render, linkler tıklanabilir) ·
 * üyelik tarihi · sekmeler: Ortak Kankalar / Ortak Ortamlar.
 * Aksiyonlar = yalnız MEVCUT akışlar: Mesaj · Kanka Ekle (by-user, jenerik ret) · Engelle/Çıkar (ConfirmDialog).
 *
 * Veri: parent zaten çektiği UserProfileCardDto'yu prop ile verir (çift fetch yok).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFriendsStore } from '@/stores/friends'
import { useDmStore } from '@/stores/dm'
import { renderMessageHtml } from '@/utils/markdown'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { UserProfileCardDto } from '@/types'

const props = defineProps<{ card: UserProfileCardDto }>()
const emit = defineEmits<{ close: []; openDm: [channelId: string] }>()

const { t } = useI18n()
const friendsStore = useFriendsStore()
const dmStore = useDmStore()

type Tab = 'friends' | 'guilds'
const activeTab = ref<Tab>('friends')

const bioHtml = computed(() =>
  props.card.bio ? renderMessageHtml(props.card.bio, () => undefined, '') : '',
)

const memberSinceLabel = computed(() =>
  new Date(props.card.memberSince).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
)

// ── ESC ile kapat ──────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

// ── Aksiyonlar (yalnız mevcut akışlar) ──────────────────────────────────────
const adding = ref(false)
const added = ref(false)
const addError = ref('')
const dmLoading = ref(false)

async function addFriend() {
  if (adding.value || added.value) return
  adding.value = true
  addError.value = ''
  try {
    await friendsStore.sendRequestByUser(props.card.id)
    added.value = true
  } catch {
    addError.value = t('userCard.requestFailed')
  } finally {
    adding.value = false
  }
}

async function openDm() {
  if (dmLoading.value) return
  dmLoading.value = true
  try {
    const channel = await dmStore.openChannel(props.card.id)
    emit('openDm', channel.id)
    emit('close')
  } finally {
    dmLoading.value = false
  }
}

// Engelle / Kankalıktan çıkar — ConfirmDialog
const confirmState = ref<{ show: boolean; message: string; action: () => Promise<void> }>({
  show: false,
  message: '',
  action: async () => {},
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
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background-color: var(--kv-bg-overlay);"
      role="dialog"
      aria-modal="true"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-lg rounded-[var(--kv-radius-lg)] overflow-hidden flex flex-col"
        style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle); max-height: 85vh;"
      >
        <!-- Banner + kapat -->
        <div class="relative h-20 shrink-0" style="background-color: var(--kv-accent-subtle);">
          <button
            type="button"
            class="absolute top-3 right-3 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
            style="width: 30px; height: 30px; color: var(--kv-text-muted); background-color: var(--kv-bg-overlay);"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Avatar + username -->
        <div class="px-6 -mt-10">
          <div
            class="w-20 h-20 rounded-full border-4 overflow-hidden flex items-center justify-center text-[28px] font-bold text-white shrink-0"
            style="border-color: var(--kv-bg-content); background-color: var(--kv-accent-500);"
          >
            <img v-if="card.avatarUrl" :src="card.avatarUrl" :alt="card.username" class="w-full h-full object-cover" />
            <span v-else>{{ card.username[0].toUpperCase() }}</span>
          </div>
        </div>

        <div class="px-6 pt-3 pb-2">
          <p class="text-[20px] font-bold" style="color: var(--kv-text-primary);">{{ card.username }}</p>
        </div>

        <!-- Aksiyonlar -->
        <div class="px-6 pb-4 flex flex-wrap gap-2">
          <button
            v-if="card.friendStatus !== 'self' && !card.selfBlocked"
            class="py-1.5 px-4 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-90"
            style="background-color: var(--kv-accent-500); color: #fff;"
            :disabled="dmLoading"
            @click="openDm"
          >
            {{ t('profile.message') }}
          </button>
          <button
            v-if="card.friendStatus === 'none'"
            class="py-1.5 px-4 rounded-[var(--kv-radius-md)] text-[13px] font-medium transition-opacity"
            :class="added || adding ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            :disabled="added || adding"
            @click="addFriend"
          >
            {{ added ? t('userCard.requestSent') : t('userCard.addFriend') }}
          </button>
          <button
            v-if="card.friendStatus === 'friends'"
            class="py-1.5 px-4 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-80"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            @click="openConfirm(t('friends.confirmRemove'), () => friendsStore.removeFriend(card.id))"
          >
            {{ t('friends.remove') }}
          </button>
          <button
            v-if="card.friendStatus !== 'self' && !card.selfBlocked"
            class="py-1.5 px-4 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-80"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-danger);"
            @click="openConfirm(t('friends.confirmBlock'), () => friendsStore.blockUser(card.id))"
          >
            {{ t('friends.block') }}
          </button>
        </div>
        <p v-if="addError" class="px-6 -mt-2 mb-2 text-[12px]" style="color: var(--kv-danger);">{{ addError }}</p>

        <!-- Kaydırılabilir gövde -->
        <div class="flex-1 overflow-y-auto px-6 pb-6 border-t pt-4" style="border-color: var(--kv-border-subtle);">
          <!-- Bio -->
          <section class="mb-5">
            <h3 class="text-[11px] font-bold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
              {{ t('profile.bio') }}
            </h3>
            <div
              v-if="card.bio"
              class="kv-md text-[14px] break-words"
              style="color: var(--kv-text-body);"
              v-html="bioHtml"
            />
            <p v-else class="text-[14px]" style="color: var(--kv-text-muted);">{{ t('profile.noBio') }}</p>
          </section>

          <!-- Üyelik tarihi -->
          <section class="mb-5">
            <h3 class="text-[11px] font-bold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
              {{ t('profile.memberSince') }}
            </h3>
            <p class="text-[14px]" style="color: var(--kv-text-body);">{{ memberSinceLabel }}</p>
          </section>

          <!-- Ortak sekmeler -->
          <div class="flex gap-1 mb-3 border-b" style="border-color: var(--kv-border-subtle);">
            <button
              type="button"
              class="px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors -mb-px border-b-2"
              :style="activeTab === 'friends'
                ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
                : 'color: var(--kv-text-muted); border-color: transparent;'"
              @click="activeTab = 'friends'"
            >
              {{ t('profile.mutualFriendsCount', { count: card.mutualFriends.length }) }}
            </button>
            <button
              type="button"
              class="px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors -mb-px border-b-2"
              :style="activeTab === 'guilds'
                ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
                : 'color: var(--kv-text-muted); border-color: transparent;'"
              @click="activeTab = 'guilds'"
            >
              {{ t('profile.mutualGuildsCount', { count: card.mutualGuilds.length }) }}
            </button>
          </div>

          <!-- Ortak Kankalar -->
          <div v-if="activeTab === 'friends'">
            <p v-if="card.mutualFriends.length === 0" class="text-[13px] py-2" style="color: var(--kv-text-muted);">
              {{ t('profile.noMutualFriends') }}
            </p>
            <ul v-else class="flex flex-col gap-1">
              <li
                v-for="f in card.mutualFriends"
                :key="f.id"
                class="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--kv-radius-md)]"
              >
                <div
                  class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[13px] font-bold text-white"
                  style="background-color: var(--kv-accent-500);"
                >
                  <img v-if="f.avatarUrl" :src="f.avatarUrl" :alt="f.username" class="w-full h-full object-cover" />
                  <span v-else>{{ f.username[0].toUpperCase() }}</span>
                </div>
                <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">{{ f.username }}</span>
              </li>
            </ul>
          </div>

          <!-- Ortak Ortamlar -->
          <div v-else>
            <p v-if="card.mutualGuilds.length === 0" class="text-[13px] py-2" style="color: var(--kv-text-muted);">
              {{ t('profile.noMutualGuilds') }}
            </p>
            <ul v-else class="flex flex-col gap-1">
              <li
                v-for="g in card.mutualGuilds"
                :key="g.id"
                class="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--kv-radius-md)]"
              >
                <div
                  class="w-8 h-8 shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
                  style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
                >
                  <img v-if="g.iconUrl" :src="g.iconUrl" :alt="g.name" class="w-full h-full object-cover" />
                  <span v-else>{{ g.name[0].toUpperCase() }}</span>
                </div>
                <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">{{ g.name }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="confirmState.show"
      :message="confirmState.message"
      :loading="confirmLoading"
      @confirm="runConfirm"
      @cancel="confirmState.show = false"
    />
  </Teleport>
</template>
