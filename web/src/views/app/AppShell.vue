<script setup lang="ts">
/**
 * AppShell — uygulama layout/kabuğu (kalıcı çerçeve). Standart: stack/frontend/component-organization §Routing.
 * Sorumluluk: app lifecycle (socket bağlantısı, ilk veri yükü, global listener'lar, logout) + kalıcı UI
 * (ServerRail + sidebar router-view + UserCard + modallar). Değişen ekranlar <RouterView/> ile gelir.
 * Üst-seviye ekran state'i URL'dedir; burada v-if ile ekran değiştirme YOK.
 *
 * Responsive: <768 → sol kolon off-canvas drawer (SPRINT_RESPONSIVE_CONTRACT §4).
 * Drawer state: useAppShellNav singleton.
 */
import { onMounted, onUnmounted, watch, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useFriendsStore } from '@/stores/friends'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { useSocket } from '@/composables/useSocket'
import { useIdlePresence } from '@/composables/useIdlePresence'
import { useAppModals } from '@/composables/useAppModals'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { useNativeNotifications } from '@/composables/useNativeNotifications'
import { isMobile, isWide } from '@/composables/useResponsive'
import ServerRail from '@/components/layout/ServerRail.vue'
import UserCard from '@/components/layout/UserCard.vue'
import EmailVerificationBanner from '@/components/shared/EmailVerificationBanner.vue'
import ServerModal from './components/ServerModal.vue'
import FriendAddModal from '@/views/home/components/FriendAddModal.vue'
import IncomingCallModal from '@/components/shared/IncomingCallModal.vue'
import UserSettingsView from '@/views/settings/UserSettingsView.vue'

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const friendsStore = useFriendsStore()
const notificationPrefsStore = useNotificationPrefsStore()
const { connect, disconnect } = useSocket()
const {
  showServerModal, serverModalStep, showAddFriendModal, openServerModal, closeServerModal, closeAddFriend,
  // Birleşik kullanıcı ayarları modalı (UserCard + UserCardPopover "kendi profili" açar)
  showUserSettings, userSettingsSection, openUserSettings,
} = useAppModals()

// Router watch'ı kurar (her route değişiminde drawer'ları kapat).
const { leftDrawerOpen, closeLeftDrawer, rightPanelVisible, closeRightPanel } = useAppShellNav()

// Drawer DOM ref'i — focus-trap için
const drawerRef = ref<HTMLElement | null>(null)

// Socket'i setup'ta bağla (child view'lar mount olup joinChannel çağırmadan ÖNCE soket var olsun).
// Child mounted, parent mounted'tan önce koşar; bu yüzden connect()'i onMounted'a bırakamayız.
if (sessionStorage.getItem('kv_access_token')) connect()

// Auto-boşta: hareketsizlikte 'away', etkileşimde 'online' (manuel DND/away'a saygılı)
useIdlePresence()

// Electron native bildirim katmanı: görünür-değilken yeni bildirim → OS toast.
// Yalnız window.kankaverse?.isElectron=true iken aktif; tarayıcıda no-op.
useNativeNotifications()

// Drawer açıkken body scroll-lock. Watch: isMobile değişince veya drawer kapanınca temizle.
watch(
  [leftDrawerOpen, isMobile],
  ([drawerOpen, mobile]) => {
    if (drawerOpen && mobile) {
      document.body.style.overflow = 'hidden'
      // Focus-trap: drawer açılınca içindeki ilk odaklanabilir öğeye fokus taşı
      nextTick(() => {
        const focusable = drawerRef.value?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        focusable?.focus()
      })
    } else {
      document.body.style.overflow = ''
    }
  },
  { immediate: true },
)

// ESC ile açık drawer/overlay kapat. Sol drawer yalnız mobil; sağ panel overlay yalnız <1280.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (isMobile.value && leftDrawerOpen.value) {
    closeLeftDrawer()
  } else if (!isWide.value && rightPanelVisible.value) {
    closeRightPanel()
  }
}

function recheckGuildUnread(guildId: string) {
  guildsStore.setGuildUnreadCount(guildId, channelsStore.totalUnreadForGuild(guildId))
  // REV-4: rail kırmızı rozeti = mention toplamı; kanal okunduğunda/senkronda tazele
  guildsStore.setGuildMentionCount(guildId, channelsStore.totalMentionsForGuild(guildId))
}
function onRecheckUnread(e: Event) {
  const { guildId } = (e as CustomEvent<{ guildId: string }>).detail
  recheckGuildUnread(guildId)
}
async function onAuthExpired() {
  await router.push({ name: 'login' })
}

async function logout() {
  await authStore.logout()
  disconnect()
  await router.push({ name: 'login' })
}

onMounted(async () => {
  // İlk veri yükü: rail + DM listesi (her view kendi derin-verisini ayrıca kurar)
  await guildsStore.fetchGuilds()
  await dmStore.fetchChannels()
  // Arkadaş listesi temel state (DM "Kanka Ekle" görünürlüğü, presence gruplama) — DM'e
  // doğrudan girişte de yüklü olsun diye shell seviyesinde bir kez hidrate et.
  void friendsStore.fetchFriends()
  // Bildirim tercihlerini bir kez hidrate et (sustur/seviye menüleri için temel)
  void notificationPrefsStore.load()
  window.addEventListener('kv:auth:expired', onAuthExpired)
  window.addEventListener('kv:guild:recheck-unread', onRecheckUnread)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  disconnect()
  document.body.style.overflow = ''
  window.removeEventListener('kv:auth:expired', onAuthExpired)
  window.removeEventListener('kv:guild:recheck-unread', onRecheckUnread)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--kv-bg-rail);">
    <EmailVerificationBanner v-if="authStore.user && !authStore.user.emailVerified" />

    <div class="flex flex-1 overflow-hidden relative gap-4">
      <!--
        SOL KOLON: ServerRail + sidebar (route'a göre) + UserCard
        <768:  off-canvas drawer — translate-x ile gizlenir; açıkken translate-x-0
        ≥768:  inline (mevcut davranış birebir korunur, shrink-0)
      -->
      <div
        ref="drawerRef"
        :class="[
          'flex flex-col h-full',
          'transition-transform duration-300 ease-in-out',
          isMobile
            ? ['absolute inset-y-0 left-0 z-30', leftDrawerOpen ? 'translate-x-0' : '-translate-x-full']
            : 'relative shrink-0 translate-x-0',
        ]"
        :role="isMobile ? 'dialog' : 'navigation'"
        :aria-modal="isMobile ? 'true' : undefined"
        :aria-hidden="isMobile && !leftDrawerOpen ? 'true' : undefined"
      >
        <div class="flex flex-1 overflow-hidden">
          <ServerRail
            :on-create-guild="() => openServerModal('choose')"
            :on-join-guild="() => openServerModal('choose')"
          />
          <!-- Sidebar: ChannelPanel (guild) | HomeSidebar (home/dm) — route'tan gelir -->
          <RouterView name="sidebar" />
        </div>
        <UserCard @logout="logout" @open-settings="openUserSettings" />
      </div>

      <!-- Backdrop: yalnız mobil + drawer açık -->
      <Transition name="kv-fade">
        <div
          v-if="isMobile && leftDrawerOpen"
          class="absolute inset-0 z-20"
          style="background-color: rgba(0,0,0,0.6);"
          aria-hidden="true"
          @click="closeLeftDrawer"
        />
      </Transition>

      <!-- ANA İÇERİK: HomeView | GuildChannelView | DmView -->
      <RouterView />
    </div>

    <ServerModal v-if="showServerModal" :initial-step="serverModalStep" @close="closeServerModal" />
    <FriendAddModal v-if="showAddFriendModal" @close="closeAddFriend" />
    <!-- Birleşik kullanıcı ayarları modalı -->
    <UserSettingsView v-if="showUserSettings" :initial-section="userSettingsSection" @close="showUserSettings = false" />
    <!-- Gelen DM sesli arama (global) -->
    <IncomingCallModal />
  </div>
</template>

<style scoped>
.kv-fade-enter-active,
.kv-fade-leave-active {
  transition: opacity 0.25s ease;
}
.kv-fade-enter-from,
.kv-fade-leave-to {
  opacity: 0;
}
</style>
