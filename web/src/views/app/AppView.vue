<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import ServerRail from '@/components/layout/ServerRail.vue'
import ChannelPanel from '@/components/layout/ChannelPanel.vue'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import UserCard from '@/components/layout/UserCard.vue'
import VoiceConnectedBar from '@/components/layout/VoiceConnectedBar.vue'
import MessageArea from './components/MessageArea.vue'
import VoiceRoomView from './components/VoiceRoomView.vue'
import ServerModal from './components/ServerModal.vue'
import EmailVerificationBanner from '@/components/shared/EmailVerificationBanner.vue'
import HomeSidebar from '@/views/home/components/HomeSidebar.vue'
import HomeDashboard from '@/views/home/components/HomeDashboard.vue'
import FriendsRightPanel from '@/views/home/components/FriendsRightPanel.vue'
import FriendAddModal from '@/views/home/components/FriendAddModal.vue'
import DmConversation from '@/views/home/components/DmConversation.vue'
import DmProfilePanel from '@/views/home/components/DmProfilePanel.vue'
import HomeTopBar from '../home/components/HomeTopBar.vue'
import GuildTopBar from './components/GuildTopBar.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { connect, disconnect, joinChannel, leaveChannel } = useSocket()

// Aktif kanal ses kanalı mı? → merkez alanda sohbet yerine VoiceRoomView göster
const activeChannelIsVoice = computed(() => channelsStore.activeChannel()?.type === 'GUILD_VOICE')

/** Guild'in tüm kanallarından hesaplanan unread sayacını güncelle */
function recheckGuildUnread(guildId: string) {
  const total = channelsStore.totalUnreadForGuild(guildId)
  guildsStore.setGuildUnreadCount(guildId, total)
}

function onRecheckUnread(e: Event) {
  const { guildId } = (e as CustomEvent<{ guildId: string }>).detail
  recheckGuildUnread(guildId)
}

const showMemberPanel = ref(true)
const showServerModal = ref(false)
const serverModalStep = ref<'choose' | 'create' | 'join'>('choose')
const showAddFriendModal = ref(false)

function openServerModal(step: 'choose' | 'create' | 'join') {
  serverModalStep.value = step
  showServerModal.value = true
}
const homeView = ref<'friends' | 'message-requests' | 'dm'>('friends')

// Route → store senkronizasyonu
async function syncFromRoute() {
  const name = route.name as string | null | undefined

  if (name === 'channel') {
    const guildId = route.params.guildId as string
    const channelId = route.params.channelId as string

    // Geçersiz parametre koruması
    if (!guildId || !channelId) {
      await router.replace({ name: 'app' })
      return
    }

    guildsStore.setActiveGuild(guildId)
    // Kanallar yüklü değilse fetch et (kategorilerle birlikte)
    if (!channelsStore.channelsForGuild(guildId).length) {
      try {
        await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id)
      } catch {
        // Erişim hatası — home'a düş
        await router.replace({ name: 'app' })
        return
      }
    }

    // Kanal geçerli mi?
    const channels = channelsStore.channelsForGuild(guildId)
    const exists = channels.some((c) => c.id === channelId)
    if (!exists && channels.length > 0) {
      // Geçersiz channelId — ilk kanala yönlendir
      await router.replace({ name: 'channel', params: { guildId, channelId: channels[0].id } })
      return
    }

    const prev = channelsStore.activeChannelId
    if (prev && prev !== channelId) leaveChannel(prev)
    channelsStore.setActiveChannel(channelId)
    await joinChannel(channelId)
    // Kanal açılınca okundu işaretle → unread badge temizle (guildId ile otoritatif tazele)
    await channelsStore.markChannelRead(channelId, guildId)
    recheckGuildUnread(guildId)
    dmStore.setActiveChannel(null)
    homeView.value = 'friends'

  } else if (name === 'dm') {
    const channelId = route.params.channelId as string

    if (!channelId) {
      await router.replace({ name: 'app' })
      return
    }

    // DM kanalı listede yoksa tazele
    if (!dmStore.channels.find((c) => c.id === channelId)) {
      try {
        await dmStore.fetchChannels()
      } catch {
        await router.replace({ name: 'app' })
        return
      }
    }

    // Hâlâ bulunamadıysa home'a düş
    if (!dmStore.channels.find((c) => c.id === channelId)) {
      await router.replace({ name: 'app' })
      return
    }

    guildsStore.setActiveGuild(null)
    const prev = channelsStore.activeChannelId
    if (prev) leaveChannel(prev)
    channelsStore.setActiveChannel(null)
    dmStore.setActiveChannel(channelId)
    homeView.value = 'dm'

  } else {
    // app (/)
    guildsStore.setActiveGuild(null)
    const prev = channelsStore.activeChannelId
    if (prev) leaveChannel(prev)
    channelsStore.setActiveChannel(null)
    dmStore.setActiveChannel(null)
    homeView.value = 'friends'
  }
}

onMounted(async () => {
  const token = sessionStorage.getItem('kv_access_token')
  if (token) connect()
  await guildsStore.fetchGuilds()
  await dmStore.fetchChannels()
  // Veriler yüklendikten sonra route'u senkronize et (derin-link + yenileme)
  await syncFromRoute()
  window.addEventListener('kv:auth:expired', onAuthExpired)
  window.addEventListener('kv:guild:recheck-unread', onRecheckUnread)
})

onUnmounted(() => {
  disconnect()
  window.removeEventListener('kv:auth:expired', onAuthExpired)
  window.removeEventListener('kv:guild:recheck-unread', onRecheckUnread)
})

// Sonraki gezinmelerde route değişince store'u senkronize et
watch(() => route.fullPath, syncFromRoute)

async function onAuthExpired() {
  await router.push({ name: 'login' })
}

async function logout() {
  await authStore.logout()
  disconnect()
  await router.push({ name: 'login' })
}

async function selectGuild(guildId: string) {
  if (!channelsStore.channelsForGuild(guildId).length) {
    await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id)
  }
  const channels = channelsStore.channelsForGuild(guildId)
  if (channels.length > 0) {
    router.push({ name: 'channel', params: { guildId, channelId: channels[0].id } })
  } else {
    guildsStore.setActiveGuild(guildId)
    channelsStore.setActiveChannel(null)
  }
}

function selectFriends() {
  router.push({ name: 'app' })
}

function selectMessageRequests() {
  // message-requests için ayrı route yok — homeView'ı doğrudan set et
  // Eğer guild/DM view'ındaysak önce home'a geç
  if (route.name !== 'app') {
    // syncFromRoute homeView'ı 'friends' yapacak; ondan sonra set et
    router.push({ name: 'app' }).then(() => {
      homeView.value = 'message-requests'
    })
  } else {
    homeView.value = 'message-requests'
  }
  dmStore.setActiveChannel(null)
  guildsStore.setActiveGuild(null)
}

function selectDm(channelId: string) {
  router.push({ name: 'dm', params: { channelId } })
}

function openDm(channelId: string) {
  router.push({ name: 'dm', params: { channelId } })
}

const activeDmChannel = computed(() => dmStore.activeChannel())
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--kv-bg-rail);">
    <EmailVerificationBanner v-if="authStore.user && !authStore.user.emailVerified" />

    <div class="flex flex-1 gap-4 overflow-hidden">

      <!-- SOL KOLON: ServerRail + (ChannelPanel | HomeSidebar) + UserCard (tam genişlik) -->
      <div class="flex flex-col shrink-0 h-full relative">
        <div class="flex flex-1 overflow-hidden">
          <ServerRail
            :on-create-guild="() => openServerModal('choose')"
            :on-join-guild="() => openServerModal('choose')"
          />
          <ChannelPanel v-if="guildsStore.activeGuildId" />
          <HomeSidebar
            v-if="!guildsStore.activeGuildId"
            :active-view="homeView"
            :active-dm-channel-id="dmStore.activeDmChannelId"
            @select-friends="selectFriends"
            @select-message-requests="selectMessageRequests"
            @select-dm="selectDm"
          />
        </div>
        <!-- Aktif ses oturumu barı (UserCard üstünde; kanal değişse de sürer) -->
        <VoiceConnectedBar />
        <!-- UserCard: ServerRail + sidebar genişliğini kaplar -->
        <UserCard @logout="logout" />
      </div>

      
      
      <!-- ANA İÇERİK ALANI -->
      <template v-if="guildsStore.activeGuildId">
        <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
          <!-- Tam genişlik üst header (sunucu adı + bildirim çanı) -->
          <GuildTopBar />
          <!-- Kanal bar + mesaj alanı + üye paneli yan yana (ses kanalında merkez = VoiceRoomView) -->
          <div class="flex flex-1 min-w-0 overflow-hidden gap-4 mb-4">
            <VoiceRoomView
              v-if="activeChannelIsVoice && channelsStore.activeChannelId"
              :channel-id="channelsStore.activeChannelId"
              class="flex-1 min-w-0"
            />
            <template v-else>
              <div class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)]">
                <TopBar
                  :show-member-panel="showMemberPanel"
                  @toggle-members="showMemberPanel = !showMemberPanel"
                />
                <MessageArea class="flex-1 min-h-0" />
              </div>
              <MemberPanel v-if="showMemberPanel" class="hidden xl:flex" />
            </template>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="flex flex-col w-full h-full overflow-hidden">
          <HomeTopBar v-if="!guildsStore.activeGuildId" @select-dm="selectDm" />
        <template v-if="homeView !== 'dm'">
         <div class="flex flex-1 min-w-0 overflow-hidden gap-4">
           <HomeDashboard
            @add-friend="showAddFriendModal = true"
            @create-ortam="openServerModal('create')"
            @join-ortam="openServerModal('join')"
            @open-guild="selectGuild"
          />
          <FriendsRightPanel
            :key="homeView === 'message-requests' ? 'pending' : 'all'"
            :initial-tab="homeView === 'message-requests' ? 'pending' : 'all'"
            @add-friend="showAddFriendModal = true"
            @open-dm="openDm"
          />
         </div>
        </template>
        <div v-else-if="homeView === 'dm' && activeDmChannel" class="flex flex-1 min-w-0 overflow-hidden gap-4">
          <DmConversation
            :channel="activeDmChannel"
            @cleared="selectFriends"
            @left="selectFriends"
            @deleted="selectFriends"
          />
          <!-- Profil paneli yalnızca 1-1 DM için gösterilir -->
          <div v-if="activeDmChannel.type === 'DM'" class="hidden xl:flex">
            <DmProfilePanel :other-user="activeDmChannel.otherUser" />
          </div>
        </div>
        </div>
      </template>
    </div>
  </div>

  <ServerModal v-if="showServerModal" :initial-step="serverModalStep" @close="showServerModal = false" />
  <FriendAddModal v-if="showAddFriendModal" @close="showAddFriendModal = false" />
</template>
