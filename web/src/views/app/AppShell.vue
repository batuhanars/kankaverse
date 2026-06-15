<script setup lang="ts">
/**
 * AppShell — uygulama layout/kabuğu (kalıcı çerçeve). Standart: stack/frontend/component-organization §Routing.
 * Sorumluluk: app lifecycle (socket bağlantısı, ilk veri yükü, global listener'lar, logout) + kalıcı UI
 * (ServerRail + sidebar router-view + UserCard + modallar). Değişen ekranlar <RouterView/> ile gelir.
 * Üst-seviye ekran state'i URL'dedir; burada v-if ile ekran değiştirme YOK.
 */
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import { useIdlePresence } from '@/composables/useIdlePresence'
import { useAppModals } from '@/composables/useAppModals'
import ServerRail from '@/components/layout/ServerRail.vue'
import UserCard from '@/components/layout/UserCard.vue'
import EmailVerificationBanner from '@/components/shared/EmailVerificationBanner.vue'
import ServerModal from './components/ServerModal.vue'
import FriendAddModal from '@/views/home/components/FriendAddModal.vue'
import IncomingCallModal from '@/components/shared/IncomingCallModal.vue'

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { connect, disconnect } = useSocket()
const { showServerModal, serverModalStep, showAddFriendModal, openServerModal, closeServerModal, closeAddFriend } =
  useAppModals()

// Socket'i setup'ta bağla (child view'lar mount olup joinChannel çağırmadan ÖNCE soket var olsun).
// Child mounted, parent mounted'tan önce koşar; bu yüzden connect()'i onMounted'a bırakamayız.
if (sessionStorage.getItem('kv_access_token')) connect()

// Auto-boşta: hareketsizlikte 'away', etkileşimde 'online' (manuel DND/away'a saygılı)
useIdlePresence()

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
  window.addEventListener('kv:auth:expired', onAuthExpired)
  window.addEventListener('kv:guild:recheck-unread', onRecheckUnread)
})

onUnmounted(() => {
  disconnect()
  window.removeEventListener('kv:auth:expired', onAuthExpired)
  window.removeEventListener('kv:guild:recheck-unread', onRecheckUnread)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--kv-bg-rail);">
    <EmailVerificationBanner v-if="authStore.user && !authStore.user.emailVerified" />

    <div class="flex flex-1 gap-4 overflow-hidden">
      <!-- SOL KOLON: ServerRail + sidebar (route'a göre) + UserCard -->
      <div class="flex flex-col shrink-0 h-full relative">
        <div class="flex flex-1 overflow-hidden">
          <ServerRail
            :on-create-guild="() => openServerModal('choose')"
            :on-join-guild="() => openServerModal('choose')"
          />
          <!-- Sidebar: ChannelPanel (guild) | HomeSidebar (home/dm) — route'tan gelir -->
          <RouterView name="sidebar" />
        </div>
        <UserCard @logout="logout" />
      </div>

      <!-- ANA İÇERİK: HomeView | GuildChannelView | DmView -->
      <RouterView />
    </div>

    <ServerModal v-if="showServerModal" :initial-step="serverModalStep" @close="closeServerModal" />
    <FriendAddModal v-if="showAddFriendModal" @close="closeAddFriend" />
    <!-- Gelen DM sesli arama (global) -->
    <IncomingCallModal />
  </div>
</template>
