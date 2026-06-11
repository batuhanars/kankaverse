<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useSocket } from '@/composables/useSocket'
import ServerRail from '@/components/layout/ServerRail.vue'
import ChannelPanel from '@/components/layout/ChannelPanel.vue'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import MessageArea from './components/MessageArea.vue'
import CreateGuildModal from './components/CreateGuildModal.vue'
import JoinGuildModal from './components/JoinGuildModal.vue'
import EmailVerificationBanner from '@/components/shared/EmailVerificationBanner.vue'
import HomeView from '@/views/home/HomeView.vue'

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const { connect, disconnect } = useSocket()

const showMemberPanel = ref(true)
const showCreateGuild = ref(false)
const showJoinGuild = ref(false)

onMounted(async () => {
  const token = sessionStorage.getItem('kv_access_token')
  if (token) connect()
  await guildsStore.fetchGuilds()

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
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Doğrulama bandı — emailVerified false iken tüm genişlikte üst şerit -->
    <EmailVerificationBanner v-if="authStore.user && !authStore.user.emailVerified" />

    <div class="flex flex-1 overflow-hidden" style="background-color: var(--kv-bg-content);">
    <ServerRail
      :on-create-guild="() => (showCreateGuild = true)"
      :on-join-guild="() => (showJoinGuild = true)"
    />

    <ChannelPanel v-if="guildsStore.activeGuildId" />

    <!-- Home ekranı: guild seçilmemişse (DM + Arkadaşlar) -->
    <HomeView v-if="!guildsStore.activeGuildId" />

    <!-- Kanal seçilmişse -->
    <template v-if="guildsStore.activeGuildId">
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar
          :show-member-panel="showMemberPanel"
          @toggle-members="showMemberPanel = !showMemberPanel"
          @logout="logout"
        />
        <MessageArea />
      </div>
      <MemberPanel v-if="showMemberPanel" class="hidden xl:flex" />
    </template>
    </div>
  </div>

  <CreateGuildModal v-if="showCreateGuild" @close="showCreateGuild = false" />
  <JoinGuildModal v-if="showJoinGuild" @close="showJoinGuild = false" />
</template>
