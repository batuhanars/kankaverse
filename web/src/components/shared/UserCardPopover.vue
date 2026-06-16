<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/api/users'
import { friendsApi } from '@/api/friends'
import ReportModal from './ReportModal.vue'
import FullProfileModal from './FullProfileModal.vue'
import type { UserProfileCardDto } from '@/types'

const props = defineProps<{
  userId: string
  x: number
  y: number
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const popoverEl = ref<HTMLElement | null>(null)
const card = ref<UserProfileCardDto | null>(null)
const loading = ref(true)
const adding = ref(false)
const added = ref(false)
const errorMsg = ref('')
const showReportModal = ref(false)
const showFullProfile = ref(false)
let errorTimer: ReturnType<typeof setTimeout> | null = null

// Kendi profilini şikayet etme
const isSelf = computed(() => props.userId === authStore.user?.id)

const posStyle = computed(() => {
  const left = Math.min(props.x, window.innerWidth - 248)
  const top = Math.min(props.y + 8, window.innerHeight - 300)
  return `top:${top}px;left:${left}px;`
})

watch(
  () => props.userId,
  async (id) => {
    card.value = null
    loading.value = true
    added.value = false
    errorMsg.value = ''
    try {
      const { data } = await usersApi.getCard(id)
      card.value = data
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function onDocClick(e: MouseEvent) {
  // Tam profil / rapor modalı açıkken popover dışı-tıklama ile kapanmamalı:
  // bu modaller Teleport ile popoverEl DIŞINDA render olur; içlerine tıklama
  // yanlışlıkla popover'ı (ve child modalı) kapatırdı. Modal kendi kapanışını yönetir.
  if (showFullProfile.value || showReportModal.value) return
  if (popoverEl.value && !popoverEl.value.contains(e.target as Node)) {
    emit('close')
  }
}

onMounted(() => setTimeout(() => document.addEventListener('click', onDocClick), 50))
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  if (errorTimer) clearTimeout(errorTimer)
})

function onOpenDm(channelId: string) {
  showFullProfile.value = false
  emit('close')
  router.push({ name: 'dm', params: { channelId } })
}

async function addFriend() {
  if (!card.value || adding.value || added.value) return
  adding.value = true
  errorMsg.value = ''
  try {
    await friendsApi.sendRequestByUser(card.value.id)
    added.value = true
  } catch {
    errorMsg.value = t('userCard.requestFailed')
    errorTimer = setTimeout(() => { errorMsg.value = '' }, 3000)
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="popoverEl"
      class="fixed z-50 w-[220px] rounded-[var(--kv-radius-lg)] overflow-hidden"
      :style="posStyle + 'background-color:var(--kv-bg-elevated);border:1px solid var(--kv-border-subtle);'"
    >
      <!-- Yüklenme -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <span class="text-[13px]" style="color:var(--kv-text-muted);">{{ t('common.loading') }}</span>
      </div>

      <!-- Kart -->
      <template v-else-if="card">
        <!-- Banner -->
        <div class="h-12 w-full" style="background-color:var(--kv-accent-subtle);"></div>

        <!-- Avatar -->
        <div class="px-4 -mt-6">
          <div
            class="w-12 h-12 rounded-full border-4 overflow-hidden flex items-center justify-center text-[16px] font-bold text-white shrink-0"
            style="border-color:var(--kv-bg-elevated);background-color:var(--kv-accent-500);"
          >
            <img
              v-if="card.avatarUrl"
              :src="card.avatarUrl"
              :alt="card.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ card.username[0].toUpperCase() }}</span>
          </div>
        </div>

        <div class="px-4 pb-4 pt-2">
          <p class="text-[15px] font-bold truncate mb-1" style="color:var(--kv-text-primary);">
            {{ card.username }}
          </p>

          <!-- Statü rozeti -->
          <p
            v-if="card.friendStatus === 'friends'"
            class="text-[12px] mb-3"
            style="color:var(--kv-success);"
          >
            {{ t('userCard.statusFriend') }}
          </p>
          <p
            v-else-if="card.friendStatus === 'pending_out'"
            class="text-[12px] mb-3"
            style="color:var(--kv-text-muted);"
          >
            {{ t('userCard.statusPending') }}
          </p>
          <p
            v-else-if="card.friendStatus === 'pending_in'"
            class="text-[12px] mb-3"
            style="color:var(--kv-text-muted);"
          >
            {{ t('userCard.statusPendingIn') }}
          </p>
          <div v-else class="mb-3"></div>

          <!-- +Kanka butonu: sadece none'da — T&S: minöre göre gizlenmez, karar sunucuda -->
          <button
            v-if="card.friendStatus === 'none'"
            class="w-full py-1.5 rounded-[var(--kv-radius-md)] text-[13px] font-medium transition-opacity"
            :class="added || adding ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer'"
            style="background-color:var(--kv-accent-500);color:#fff;"
            :disabled="added || adding"
            @click="addFriend"
          >
            {{ added ? t('userCard.requestSent') : t('userCard.addFriend') }}
          </button>

          <!-- Jenerik hata — sebep gösterilmez -->
          <p v-if="errorMsg" class="text-[12px] mt-2 text-center" style="color:var(--kv-danger);">
            {{ errorMsg }}
          </p>

          <!-- Profilin tamamını gör (Sprint C5 — tam profil modalı) -->
          <button
            v-if="!isSelf"
            class="w-full mt-2 py-1.5 rounded-[var(--kv-radius-md)] text-[13px] font-medium transition-opacity hover:opacity-80 cursor-pointer"
            style="background-color: var(--kv-bg-content); color: var(--kv-text-primary);"
            @click="showFullProfile = true"
          >
            {{ t('profile.viewFull') }}
          </button>

          <!-- Kullanıcıyı şikâyet et (kendi profili değilse) -->
          <button
            v-if="!isSelf"
            class="w-full mt-2 py-1.5 rounded-[var(--kv-radius-md)] text-[13px] transition-opacity hover:opacity-80 cursor-pointer"
            style="background-color: transparent; color: var(--kv-danger); border: 1px solid var(--kv-danger);"
            @click="showReportModal = true"
          >
            {{ t('report.reportUser') }}
          </button>
        </div>
      </template>
    </div>
  </Teleport>

  <!-- Kullanıcı şikâyet modalı -->
  <ReportModal
    v-if="showReportModal && card"
    target-type="USER"
    :target-id="card.id"
    @close="showReportModal = false; emit('close')"
  />

  <!-- Tam profil modalı -->
  <FullProfileModal
    v-if="showFullProfile && card"
    :card="card"
    @close="showFullProfile = false"
    @open-dm="onOpenDm"
  />
</template>
