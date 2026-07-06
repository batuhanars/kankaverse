<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDmStore } from '@/stores/dm'
import { useToastStore } from '@/stores/toast'
import { useAppModals } from '@/composables/useAppModals'
import { usersApi } from '@/api/users'
import { friendsApi } from '@/api/friends'
import { bannerBackground } from '@/utils/bannerColor'
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
const dmStore = useDmStore()
const toast = useToastStore()
const { openUserSettings } = useAppModals()

// ⋯ menü (geri kalan aksiyonlar burada; Discord deseni)
const menuOpen = ref(false)

// Üyelik tarihi + ortak kanka/ortam özet satırı (kart zenginleştirme)
const memberSinceLabel = computed(() =>
  card.value
    ? new Date(card.value.memberSince).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '',
)
const mutualText = computed(() => {
  if (!card.value) return ''
  const parts: string[] = []
  if (card.value.mutualFriends.length) parts.push(t('userCard.mutualFriendsShort', { n: card.value.mutualFriends.length }))
  if (card.value.mutualGuilds.length) parts.push(t('userCard.mutualGuildsShort', { n: card.value.mutualGuilds.length }))
  return parts.join(' • ')
})

async function copyId() {
  menuOpen.value = false
  if (!card.value) return
  try {
    await navigator.clipboard.writeText(card.value.id)
    toast.success(t('userCard.idCopied'))
  } catch {
    // sessizce geç
  }
}

// Mesaj Gönder → DM aç. Arkadaş değilse + karşı taraf izin veriyorsa DM "mesaj isteği" olarak
// açılır (ilk mesaj gönderilince alıcının Mesaj İstekleri kutusuna düşer). İzin yoksa jenerik hata.
const dmLoading = ref(false)
async function openDm() {
  if (dmLoading.value || isSelf.value) return
  dmLoading.value = true
  errorMsg.value = ''
  try {
    const channel = await dmStore.openChannel(props.userId)
    router.push({ name: 'dm', params: { channelId: channel.id } })
    emit('close')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    errorMsg.value = err.response?.data?.message ?? t('common.error')
  } finally {
    dmLoading.value = false
  }
}

// Kendi kartında "Profilime git" → profil ayarları modalını aç
function goToMyProfile() {
  openUserSettings('profil')
  emit('close')
}
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
  const W = 300, H = 420
  const left = Math.max(8, Math.min(props.x, window.innerWidth - W - 8))
  const top = Math.max(8, Math.min(props.y + 8, window.innerHeight - H - 8))
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
      class="fixed z-50 w-[300px] rounded-[var(--kv-radius-lg)] overflow-hidden"
      :style="posStyle + 'background-color:var(--kv-bg-elevated);border:1px solid var(--kv-border-subtle);'"
      @click="menuOpen = false"
    >
      <!-- Yüklenme -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <span class="text-[13px]" style="color:var(--kv-text-muted);">{{ t('common.loading') }}</span>
      </div>

      <!-- Kart -->
      <template v-else-if="card">
        <!-- Banner + üstteki ikon aksiyonlar + banner'a binen avatar -->
        <div class="relative">
          <div class="h-[80px] relative overflow-hidden" :style="{ background: bannerBackground(card.bannerColor) }">
            <img v-if="card.bannerUrl" :src="card.bannerUrl" alt="" class="absolute inset-0 w-full h-full object-cover" />
          </div>

          <!-- Sağ üst ikon butonlar (kendi kartım değilse): +Kanka + ⋯ menü -->
          <div v-if="!isSelf" class="absolute top-2 right-2 z-20 flex items-center gap-1.5">
            <!-- Kanka Ekle (yalnız none) -->
            <button
              v-if="card.friendStatus === 'none' && !card.selfBlocked"
              class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60"
              style="background-color: rgba(0,0,0,0.55); color: #fff; backdrop-filter: blur(2px);"
              :title="added ? t('userCard.requestSent') : t('userCard.addFriend')"
              :disabled="added || adding"
              @click.stop="addFriend"
            >
              <svg v-if="added" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </button>

            <!-- ⋯ menü -->
            <div class="relative">
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-90"
                style="background-color: rgba(0,0,0,0.55); color: #fff; backdrop-filter: blur(2px);"
                :title="t('userCard.moreActions')"
                @click.stop="menuOpen = !menuOpen"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>

              <div
                v-if="menuOpen"
                class="absolute top-full right-0 mt-1.5 w-[200px] rounded-[var(--kv-radius-md)] py-1 z-30 overflow-hidden"
                style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle); box-shadow: 0 8px 24px rgba(0,0,0,0.4);"
                @click.stop
              >
                <button class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]" style="color: var(--kv-text-primary);" @click="menuOpen = false; showFullProfile = true">
                  {{ t('profile.viewFull') }}
                </button>
                <button class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]" style="color: var(--kv-text-primary);" @click="copyId">
                  {{ t('userCard.copyId') }}
                </button>
                <div class="my-1 mx-2 border-t" style="border-color: var(--kv-border-subtle);" />
                <button class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[rgba(242,59,75,0.1)]" style="color: var(--kv-danger);" @click="menuOpen = false; showReportModal = true">
                  {{ t('report.reportUser') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Avatar (banner'a binen; absolute → kırpılmaz) -->
          <div
            class="absolute left-4 -bottom-8 z-10 w-[68px] h-[68px] rounded-full border-4 overflow-hidden flex items-center justify-center text-[24px] font-bold text-white"
            style="border-color: var(--kv-bg-elevated); background-color: var(--kv-accent-500);"
          >
            <img v-if="card.avatarUrl" :src="card.avatarUrl" :alt="card.username" class="w-full h-full object-cover" />
            <span v-else>{{ card.username[0].toUpperCase() }}</span>
          </div>
        </div>

        <!-- İçerik -->
        <div class="px-4 pt-11 pb-4">
          <p class="text-[17px] font-bold truncate" style="color: var(--kv-text-primary);">
            {{ card.username }}
          </p>

          <!-- Statü rozeti (kanka / bekleyen) -->
          <p v-if="card.friendStatus === 'friends'" class="text-[12px] mt-0.5" style="color: var(--kv-success);">
            {{ t('userCard.statusFriend') }}
          </p>
          <p v-else-if="card.friendStatus === 'pending_out'" class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('userCard.statusPending') }}
          </p>
          <p v-else-if="card.friendStatus === 'pending_in'" class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('userCard.statusPendingIn') }}
          </p>

          <!-- Ortak kanka/ortam özeti -->
          <p v-if="mutualText" class="text-[12px] mt-1.5" style="color: var(--kv-text-muted);">
            {{ mutualText }}
          </p>

          <!-- Detay kartı: bio + üyelik (kart zenginleştirme) -->
          <div class="mt-3 rounded-[var(--kv-radius-md)] p-3 flex flex-col gap-3" style="background-color: var(--kv-bg-content);">
            <div>
              <h3 class="text-[10px] font-bold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">{{ t('profile.bio') }}</h3>
              <p v-if="card.bio" class="text-[13px] leading-relaxed break-words" style="color: var(--kv-text-body); display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;">{{ card.bio }}</p>
              <p v-else class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('profile.noBio') }}</p>
            </div>
            <div class="h-px" style="background-color: var(--kv-border-subtle);" />
            <div>
              <h3 class="text-[10px] font-bold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">{{ t('userCard.memberSincePrefix') }}</h3>
              <p class="text-[13px]" style="color: var(--kv-text-body);">{{ memberSinceLabel }}</p>
            </div>
          </div>

          <!-- Birincil aksiyon: Mesaj (kendisi değil + engellemedim) -->
          <button
            v-if="!isSelf && !card.selfBlocked"
            class="w-full mt-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60"
            style="background-color: var(--kv-accent-500); color: #fff;"
            :disabled="dmLoading"
            @click="openDm"
          >
            {{ t('profile.message') }}
          </button>

          <!-- Kendi kartım → profil ayarları -->
          <button
            v-if="isSelf"
            class="w-full mt-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
            style="background-color: var(--kv-accent-500); color: #fff;"
            @click="goToMyProfile"
          >
            {{ t('userCard.goToMyProfile') }}
          </button>

          <!-- Engellediysem bilgi notu -->
          <p v-if="card.selfBlocked && !isSelf" class="text-[12px] mt-3 text-center" style="color: var(--kv-text-muted);">
            {{ t('userCard.selfBlockedNote') }}
          </p>

          <!-- Jenerik hata -->
          <p v-if="errorMsg" class="text-[12px] mt-3 text-center" style="color: var(--kv-danger);">
            {{ errorMsg }}
          </p>
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
