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
import { useRouter } from 'vue-router'
import { useFriendsStore } from '@/stores/friends'
import { useDmStore } from '@/stores/dm'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useAuthStore } from '@/stores/auth'
import { renderMessageHtml } from '@/utils/markdown'
import { bannerBackground } from '@/utils/bannerColor'
import { animatedOrStatic } from '@/utils/animatedMedia'
import { useActivityStore } from '@/stores/activity'
import { formatElapsed } from '@/utils/formatElapsed'
import GameLogo from '@/components/shared/GameLogo.vue'
import GamepadIcon from '@/components/shared/GamepadIcon.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import { usersApi } from '@/api/users'
import type { RecentGameDto, UserProfileCardDto } from '@/types'

const props = defineProps<{ card: UserProfileCardDto }>()
const emit = defineEmits<{ close: []; openDm: [channelId: string] }>()

const { t } = useI18n()
const router = useRouter()
const friendsStore = useFriendsStore()
const dmStore = useDmStore()
const channelsStore = useChannelsStore()
const guildsStore = useGuildsStore()
const authStore = useAuthStore()

// Ortak ortama tıkla → o ortama gir (kanalları yükle, ilk kanala yönlendir), modalı kapat.
async function goToGuild(guildId: string) {
  if (!channelsStore.channelsForGuild(guildId).length) {
    try { await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id) } catch { /* yoksay */ }
  }
  const channels = channelsStore.channelsForGuild(guildId)
  if (channels.length > 0) {
    router.push({ name: 'channel', params: { guildId, channelId: channels[0].id } })
  } else {
    guildsStore.setActiveGuild(guildId)
    channelsStore.setActiveChannel(null)
    router.push({ name: 'app' })
  }
  emit('close')
}

// Ortak kankaya tıkla → onunla DM aç.
async function openDmWith(userId: string) {
  try {
    const channel = await dmStore.openChannel(userId)
    emit('openDm', channel.id)
    emit('close')
  } catch { /* yoksay */ }
}

// C31e: kişinin görünür oyunu varsa "Etkinlik" sekmesi başa eklenir ve modal onunla açılır.
const activityStore = useActivityStore()
const game = computed(() => activityStore.getGame(props.card.id))

// C31f: son 7 günde oynananlar. Ayar kapalı/görünürlük yoksa sunucu boş dizi verir; hata da boş sayılır.
const recentGames = ref<RecentGameDto[]>([])
const hasActivity = computed(() => !!game.value || recentGames.value.length > 0)
onMounted(async () => {
  try {
    recentGames.value = (await usersApi.getRecentActivity(props.card.id)).data
  } catch { /* son etkinlik ikincil bilgi: yüklenemezse sekme yalnız mevcut oyunla çalışır */ }
})
const relativeFormat = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })
function relativeTime(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - now.value) / 60000)
  if (Math.abs(minutes) < 60) return relativeFormat.format(Math.min(minutes, -1), 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, 'hour')
  return relativeFormat.format(Math.round(hours / 24), 'day')
}

type Tab = 'activity' | 'friends' | 'guilds'
const pickedTab = ref<Tab | null>(game.value ? 'activity' : 'friends')
// Etkinlik kalmayınca (oyun bitti, son etkinlik de yok) sekme kaybolur, ortak kankalara düşer.
const activeTab = computed<Tab>({
  get: () => (pickedTab.value === 'activity' && !hasActivity.value ? 'friends' : (pickedTab.value ?? 'friends')),
  set: (v) => { pickedTab.value = v },
})

// Canlı geçen süre: saniyede bir güncellenir, bileşen kapanınca temizlenir.
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => clearInterval(timer))
const elapsed = computed(() =>
  game.value?.startedAt ? formatElapsed(now.value - new Date(game.value.startedAt).getTime()) : null,
)

function openStore(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

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
        class="relative w-full max-w-4xl rounded-[var(--kv-radius-lg)] overflow-hidden flex"
        style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle); max-height: 88vh; min-height: 480px;"
      >
        <!-- Kapat (modal üst-sağ) -->
        <button
          type="button"
          class="absolute top-3 right-3 z-10 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
          style="width: 30px; height: 30px; color: var(--kv-text-muted); background-color: var(--kv-bg-overlay);"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <!-- ── SOL kolon: kimlik + aksiyon + bio ── -->
        <div class="w-[360px] shrink-0 flex flex-col border-r min-h-0" style="border-color: var(--kv-border-subtle);">
          <!-- Başlık: afiş + banner'a binen avatar (scroll DIŞI — kırpılmaz) -->
          <div class="relative shrink-0">
            <div class="h-36 relative overflow-hidden" :style="{ background: bannerBackground(card.bannerColor) }">
              <img
                v-if="card.bannerUrl"
                :src="animatedOrStatic(card, 'banner') ?? card.bannerUrl"
                alt=""
                class="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <div class="absolute left-6 -bottom-12 z-10">
              <div
                class="w-[104px] h-[104px] rounded-full border-4 overflow-hidden flex items-center justify-center text-[34px] font-bold text-white"
                style="border-color: var(--kv-bg-content); background-color: var(--kv-accent-500);"
              >
                <img v-if="card.avatarUrl" :src="animatedOrStatic(card, 'avatar') ?? card.avatarUrl" :alt="card.username" class="w-full h-full object-cover" />
                <span v-else>{{ card.username[0].toUpperCase() }}</span>
              </div>
            </div>
          </div>

          <!-- Kaydırılabilir içerik (avatar için üst boşluk) -->
          <div class="flex-1 overflow-y-auto pt-16">
            <div class="px-6">
              <p class="text-[21px] font-bold leading-tight" style="color: var(--kv-text-primary);">{{ card.username }}</p>
            </div>

            <!-- Aksiyonlar -->
            <div class="px-6 pt-3.5 flex flex-wrap gap-2">
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
            <p v-if="addError" class="px-6 pt-2 text-[12px]" style="color: var(--kv-danger);">{{ addError }}</p>

            <!-- Bio + üyelik tarihi kartı -->
            <div class="px-6 py-5">
              <div class="rounded-[var(--kv-radius-md)] p-4 flex flex-col gap-4" style="background-color: var(--kv-bg-elevated);">
                <section>
                  <h3 class="text-[11px] font-bold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
                    {{ t('profile.bio') }}
                  </h3>
                  <div
                    v-if="card.bio"
                    class="kv-md text-[13px] break-words leading-relaxed"
                    style="color: var(--kv-text-body);"
                    v-html="bioHtml"
                  />
                  <p v-else class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('profile.noBio') }}</p>
                </section>
                <div class="h-px" style="background-color: var(--kv-border-subtle);" />
                <section>
                  <h3 class="text-[11px] font-bold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
                    {{ t('profile.memberSince') }}
                  </h3>
                  <p class="text-[13px]" style="color: var(--kv-text-body);">{{ memberSinceLabel }}</p>
                </section>
              </div>
            </div>
          </div>
        </div>

        <!-- ── SAĞ kolon: ortak sekmeler ── -->
        <div class="flex-1 min-w-0 flex flex-col min-h-0">
          <!-- Sekmeler -->
          <div class="px-6 pt-6 shrink-0">
            <div class="flex gap-1 border-b" style="border-color: var(--kv-border-subtle);">
              <button
                v-if="hasActivity"
                type="button"
                class="px-3 py-2.5 text-[13px] font-semibold cursor-pointer transition-colors -mb-px border-b-2"
                :style="activeTab === 'activity'
                  ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
                  : 'color: var(--kv-text-muted); border-color: transparent;'"
                @click="activeTab = 'activity'"
              >
                {{ t('profile.activity.tab') }}
              </button>
              <button
                type="button"
                class="px-3 py-2.5 text-[13px] font-semibold cursor-pointer transition-colors -mb-px border-b-2"
                :style="activeTab === 'friends'
                  ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
                  : 'color: var(--kv-text-muted); border-color: transparent;'"
                @click="activeTab = 'friends'"
              >
                {{ t('profile.mutualFriendsCount', { count: card.mutualFriends.length }) }}
              </button>
              <button
                type="button"
                class="px-3 py-2.5 text-[13px] font-semibold cursor-pointer transition-colors -mb-px border-b-2"
                :style="activeTab === 'guilds'
                  ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
                  : 'color: var(--kv-text-muted); border-color: transparent;'"
                @click="activeTab = 'guilds'"
              >
                {{ t('profile.mutualGuildsCount', { count: card.mutualGuilds.length }) }}
              </button>
            </div>
          </div>

          <!-- Liste -->
          <div class="flex-1 overflow-y-auto px-4 py-3">
            <!-- Etkinlik -->
            <div v-if="activeTab === 'activity'" class="px-2 py-2">
              <template v-if="game">
              <h3 class="text-[11px] font-bold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                {{ t('profile.activity.current') }}
              </h3>
              <div class="rounded-[var(--kv-radius-md)] p-4 flex items-center gap-4" style="background-color: var(--kv-bg-elevated);">
                <GameLogo :icon-url="game.iconUrl" :size="40" />
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
                    {{ t('profile.activity.playing') }}
                  </p>
                  <p class="text-[16px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ game.name }}</p>
                  <p v-if="elapsed" class="mt-1 flex items-center gap-1.5 text-[13px] tabular-nums" style="color: var(--kv-text-body);">
                    <GamepadIcon :size="14" />{{ elapsed }}
                  </p>
                </div>
                <button
                  v-if="game.storeUrl"
                  type="button"
                  class="shrink-0 py-1.5 px-4 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-80"
                  style="background-color: var(--kv-bg-content); color: var(--kv-text-secondary);"
                  @click="openStore(game.storeUrl)"
                >
                  {{ t('profile.activity.viewOnSteam') }}
                </button>
              </div>
              </template>

              <template v-if="recentGames.length > 0">
                <h3 class="text-[11px] font-bold uppercase tracking-widest mb-3" :class="{ 'mt-5': game }" style="color: var(--kv-text-muted);">
                  {{ t('profile.activity.recent') }}
                </h3>
                <ul class="flex flex-col gap-1">
                  <li
                    v-for="item in recentGames"
                    :key="item.game.id"
                    class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)]"
                    style="background-color: var(--kv-bg-elevated);"
                  >
                    <GameLogo :icon-url="item.game.iconUrl" :size="32" />
                    <span class="min-w-0 flex-1 truncate text-[14px] font-medium" style="color: var(--kv-text-primary);">{{ item.game.name }}</span>
                    <span class="shrink-0 text-[12px]" style="color: var(--kv-text-muted);">{{ relativeTime(item.lastPlayedAt) }}</span>
                  </li>
                </ul>
              </template>
            </div>

            <!-- Ortak Kankalar -->
            <div v-else-if="activeTab === 'friends'">
              <p v-if="card.mutualFriends.length === 0" class="text-[13px] px-2 py-4" style="color: var(--kv-text-muted);">
                {{ t('profile.noMutualFriends') }}
              </p>
              <ul v-else class="flex flex-col gap-0.5">
                <li
                  v-for="f in card.mutualFriends"
                  :key="f.id"
                  class="flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
                  role="button"
                  :title="t('profile.message')"
                  @click="openDmWith(f.id)"
                >
                  <div
                    class="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[14px] font-bold text-white"
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
              <p v-if="card.mutualGuilds.length === 0" class="text-[13px] px-2 py-4" style="color: var(--kv-text-muted);">
                {{ t('profile.noMutualGuilds') }}
              </p>
              <ul v-else class="flex flex-col gap-0.5">
                <li
                  v-for="g in card.mutualGuilds"
                  :key="g.id"
                  class="flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
                  role="button"
                  :title="t('discover.goToServer')"
                  @click="goToGuild(g.id)"
                >
                  <div
                    class="w-9 h-9 shrink-0 overflow-hidden flex items-center justify-center text-[13px] font-semibold text-white"
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
