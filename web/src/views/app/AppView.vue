<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import ServerRail from '@/components/layout/ServerRail.vue'
import ChannelPanel from '@/components/layout/ChannelPanel.vue'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import UserCard from '@/components/layout/UserCard.vue'
import MessageArea from './components/MessageArea.vue'
import ServerModal from './components/ServerModal.vue'
import EmailVerificationBanner from '@/components/shared/EmailVerificationBanner.vue'
import HomeSidebar from '@/views/home/components/HomeSidebar.vue'
import HomeDashboard from '@/views/home/components/HomeDashboard.vue'
import FriendsRightPanel from '@/views/home/components/FriendsRightPanel.vue'
import FriendAddModal from '@/views/home/components/FriendAddModal.vue'
import DmConversation from '@/views/home/components/DmConversation.vue'
import DmProfilePanel from '@/views/home/components/DmProfilePanel.vue'
import HomeTopBar from '../home/components/HomeTopBar.vue'

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const dmStore = useDmStore()
const { connect, disconnect } = useSocket()

const showMemberPanel = ref(true)
const showServerModal = ref(false)
const showAddFriendModal = ref(false)
const homeView = ref<'friends' | 'message-requests' | 'dm'>('friends')

onMounted(async () => {
  const token = sessionStorage.getItem('kv_access_token')
  if (token) connect()
  await guildsStore.fetchGuilds()
  dmStore.fetchChannels()
  window.addEventListener('kv:auth:expired', onAuthExpired)
})

onUnmounted(() => {
  disconnect()
  window.removeEventListener('kv:auth:expired', onAuthExpired)
})

async function onAuthExpired() {
  await router.push({ name: 'login' })
}

async function logout() {
  await authStore.logout()
  disconnect()
  await router.push({ name: 'login' })
}

function selectFriends() {
  homeView.value = 'friends'
  dmStore.setActiveChannel(null)
}

function selectMessageRequests() {
  homeView.value = 'message-requests'
  dmStore.setActiveChannel(null)
}

function selectDm(channelId: string) {
  homeView.value = 'dm'
  dmStore.setActiveChannel(channelId)
}

function openDm(channelId: string) {
  homeView.value = 'dm'
  dmStore.setActiveChannel(channelId)
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
            :on-create-guild="() => (showServerModal = true)"
            :on-join-guild="() => (showServerModal = true)"
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
        <!-- UserCard: ServerRail + sidebar genişliğini kaplar -->
        <UserCard @logout="logout" />
      </div>

      
      
      <!-- ANA İÇERİK ALANI -->
      <template v-if="guildsStore.activeGuildId">
        <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar
            :show-member-panel="showMemberPanel"
            @toggle-members="showMemberPanel = !showMemberPanel"
          />
          <MessageArea />
        </div>
        <MemberPanel v-if="showMemberPanel" class="hidden xl:flex" />
      </template>

      <template v-else>
        <div class="flex flex-col w-full h-full overflow-hidden">
          <HomeTopBar v-if="!guildsStore.activeGuildId" @select-dm="selectDm" />
        <template v-if="homeView !== 'dm'">
         <div class="flex flex-1 min-w-0 overflow-hidden gap-4">
           <HomeDashboard
            @add-friend="showAddFriendModal = true"
            @create-ortam="showServerModal = true"
            @join-ortam="showServerModal = true"
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
            :channel-id="activeDmChannel.id"
            :other-user="activeDmChannel.otherUser"
          />
          <div class="hidden xl:flex">
            <DmProfilePanel :other-user="activeDmChannel.otherUser" />
          </div>
        </div>
        </div>
      </template>
    </div>
  </div>

  <ServerModal v-if="showServerModal" @close="showServerModal = false" />
  <FriendAddModal v-if="showAddFriendModal" @close="showAddFriendModal = false" />
</template>
