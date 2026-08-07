<script setup lang="ts">
/**
 * MessageRequestsView — C9 Mesaj İstekleri (arkadaş-olmayan DM onay süzgeci).
 * Orta panel: bana gelen bekleyen istekler listesi + seçili isteğin mesaj detayı.
 * Kabul → mesajlaşma başlar (DM'e geçer). Reddet/Engelle → istek kutusundan düşer.
 * Kanka isteğinden AYRIDIR (kankalar paneli "Bekleyen" ile karıştırılmaz).
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDmStore } from '@/stores/dm'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import HomeTopBar from './components/HomeTopBar.vue'

const { t } = useI18n()
const router = useRouter()
const dmStore = useDmStore()
const toast = useToastStore()

const loading = ref(true)
const selectedChannelId = ref<string | null>(null)
const acting = ref(false)
const showBlockConfirm = ref(false)

const requests = computed(() => dmStore.requests)
const selected = computed(
  () => requests.value.find((r) => r.channelId === selectedChannelId.value) ?? null,
)

onMounted(async () => {
  try {
    await dmStore.fetchRequests()
  } finally {
    loading.value = false
    // İlk isteği otomatik seç (varsa)
    if (!selectedChannelId.value && requests.value.length > 0) {
      selectedChannelId.value = requests.value[0].channelId
    }
  }
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function accept() {
  const ch = selected.value
  if (!ch || acting.value) return
  acting.value = true
  try {
    const channel = await dmStore.acceptRequest(ch.channelId)
    toast.success(t('messageRequests.accepted'))
    router.push({ name: 'dm', params: { channelId: channel.id } })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('common.error'))
  } finally {
    acting.value = false
  }
}

async function reject(block: boolean) {
  const ch = selected.value
  if (!ch || acting.value) return
  acting.value = true
  showBlockConfirm.value = false
  try {
    await dmStore.rejectRequest(ch.channelId, block)
    toast.success(block ? t('messageRequests.blocked') : t('messageRequests.rejected'))
    // Sonraki isteğe geç (varsa)
    selectedChannelId.value = requests.value[0]?.channelId ?? null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('common.error'))
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <HomeTopBar
      @select-dm="(id: string) => router.push({ name: 'dm', params: { channelId: id } })"
    />
    <div class="flex flex-1 min-w-0 overflow-hidden">
      <!-- Yüzen içerik kartı (DmConversation deseni: mb-4 + rounded + ≥1280 sağ boşluk) -->
      <div
        class="flex-1 min-w-0 flex flex-col mb-4 xl:mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
        style="background-color: var(--kv-bg-content)"
      >
        <!-- Başlık -->
        <div
          class="shrink-0 flex items-center px-6 border-b"
          style="height: var(--kv-header-height); border-color: var(--kv-border-subtle)"
        >
          <h1 class="text-[16px] font-semibold" style="color: var(--kv-text-primary)">
            {{ t('messageRequests.title') }}
          </h1>
          <span
            v-if="requests.length > 0"
            class="ml-2 min-w-[20px] h-[20px] px-1.5 flex items-center justify-center rounded-full text-[12px] font-bold text-white"
            style="background-color: var(--kv-accent-500)"
            >{{ requests.length }}</span
          >
        </div>

        <!-- Açıklama şeridi -->
        <p
          class="shrink-0 px-6 py-2.5 text-[12px] border-b"
          style="color: var(--kv-text-muted); border-color: var(--kv-border-subtle)"
        >
          {{ t('messageRequests.subtitle') }}
        </p>

        <!-- Yükleniyor -->
        <div
          v-if="loading"
          class="flex-1 flex items-center justify-center text-[14px]"
          style="color: var(--kv-text-muted)"
        >
          {{ t('common.loading') }}
        </div>

        <!-- Boş durum -->
        <div
          v-else-if="requests.length === 0"
          class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="color: var(--kv-text-muted)"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p class="text-[15px] font-medium" style="color: var(--kv-text-secondary)">
            {{ t('messageRequests.emptyTitle') }}
          </p>
          <p class="text-[13px] max-w-sm" style="color: var(--kv-text-muted)">
            {{ t('messageRequests.emptyHint') }}
          </p>
        </div>

        <!-- Liste + detay -->
        <div v-else class="flex-1 flex min-h-0">
          <!-- Sol: istek listesi -->
          <div
            class="w-[280px] shrink-0 overflow-y-auto border-r py-2"
            style="border-color: var(--kv-border-subtle)"
          >
            <button
              v-for="req in requests"
              :key="req.channelId"
              class="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors"
              :class="
                selectedChannelId === req.channelId
                  ? 'bg-[var(--kv-bg-elevated)]'
                  : 'hover:bg-[var(--kv-bg-elevated)]'
              "
              @click="selectedChannelId = req.channelId"
            >
              <div
                class="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[14px] font-bold text-white"
                style="background-color: var(--kv-accent-500)"
              >
                <img
                  v-if="req.requester?.avatarUrl"
                  :src="req.requester.avatarUrl"
                  :alt="req.requester.username"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ (req.requester?.username ?? '?')[0].toUpperCase() }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium truncate" style="color: var(--kv-text-primary)">
                  {{ req.requester?.username ?? '—' }}
                </p>
                <p class="text-[12px] truncate" style="color: var(--kv-text-muted)">
                  {{ req.preview }}
                </p>
              </div>
            </button>
          </div>

          <!-- Sağ: seçili istek detayı -->
          <div v-if="selected" class="flex-1 min-w-0 flex flex-col p-6">
            <div class="flex items-center gap-3 mb-5">
              <div
                class="w-14 h-14 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[20px] font-bold text-white"
                style="background-color: var(--kv-accent-500)"
              >
                <img
                  v-if="selected.requester?.avatarUrl"
                  :src="selected.requester.avatarUrl"
                  :alt="selected.requester.username"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ (selected.requester?.username ?? '?')[0].toUpperCase() }}</span>
              </div>
              <div class="min-w-0">
                <p class="text-[18px] font-semibold truncate" style="color: var(--kv-text-primary)">
                  {{ selected.requester?.username ?? '—' }}
                </p>
                <p class="text-[12px]" style="color: var(--kv-text-muted)">
                  {{ formatTime(selected.createdAt) }}
                </p>
              </div>
            </div>

            <!-- Mesaj detayı -->
            <div
              class="rounded-[var(--kv-radius-md)] border px-4 py-3 mb-6"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated)"
            >
              <p
                class="text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style="color: var(--kv-text-muted)"
              >
                {{ t('messageRequests.messageLabel') }}
              </p>
              <p
                class="text-[14px] whitespace-pre-wrap break-words"
                style="color: var(--kv-text-primary)"
              >
                {{ selected.preview }}
              </p>
            </div>

            <!-- Aksiyonlar -->
            <div class="flex flex-wrap items-center gap-2.5">
              <KvButton :disabled="acting" :loading="acting" @click="accept">{{
                t('messageRequests.accept')
              }}</KvButton>
              <KvButton variant="ghost" :disabled="acting" @click="reject(false)">{{
                t('messageRequests.reject')
              }}</KvButton>
              <button
                class="text-[14px] font-medium cursor-pointer transition-colors"
                style="color: var(--kv-danger)"
                :disabled="acting"
                @click="showBlockConfirm = true"
              >
                {{ t('messageRequests.rejectBlock') }}
              </button>
            </div>
            <p class="text-[12px] mt-4" style="color: var(--kv-text-muted)">
              {{ t('messageRequests.privacyNote') }}
            </p>
          </div>
        </div>
      </div>
      <!-- /yüzen kart -->
    </div>
    <!-- /iç flex -->

    <!-- Reddet + Engelle onayı -->
    <ConfirmDialog
      v-if="showBlockConfirm"
      :title="t('messageRequests.blockConfirmTitle')"
      :message="
        t('messageRequests.blockConfirmMessage', { name: selected?.requester?.username ?? '' })
      "
      :confirm-label="t('messageRequests.rejectBlock')"
      :loading="acting"
      @confirm="reject(true)"
      @cancel="showBlockConfirm = false"
    />
  </div>
</template>
