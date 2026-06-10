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

const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const { connect, disconnect } = useSocket()

const showMemberPanel = ref(true)
const showCreateGuild = ref(false)
const showJoinGuild = ref(false)

onMounted(async () => {
  const token = sessionStorage.getItem('kv_access_token')
  if (token) connect(token)
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
  <div class="flex h-full overflow-hidden" style="background-color: var(--kv-bg-content);">
    <ServerRail
      :on-create-guild="() => (showCreateGuild = true)"
      :on-join-guild="() => (showJoinGuild = true)"
    />

    <ChannelPanel v-if="guildsStore.activeGuildId" />

    <!-- Boş durum: guild seçilmemişse -->
    <div
      v-if="!guildsStore.activeGuildId"
      class="flex-1 flex flex-col items-center justify-center gap-4"
      style="background-color: var(--kv-bg-content);"
    >
      <p class="text-[var(--kv-text-muted)] text-[16px]">Bir sunucu seç veya oluştur</p>
      <div class="flex gap-3">
        <button
          class="px-4 py-2 rounded-[var(--kv-radius-md)] bg-[var(--kv-accent-500)] text-white text-[14px] font-medium hover:bg-[var(--kv-accent-400)] cursor-pointer"
          @click="showCreateGuild = true"
        >
          Sunucu Oluştur
        </button>
        <button
          class="px-4 py-2 rounded-[var(--kv-radius-md)] bg-[var(--kv-bg-elevated)] text-[var(--kv-text-secondary)] text-[14px] font-medium hover:bg-[var(--kv-border-strong)] cursor-pointer"
          @click="showJoinGuild = true"
        >
          Sunucuya Katıl
        </button>
      </div>
    </div>

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

  <CreateGuildModal v-if="showCreateGuild" @close="showCreateGuild = false" />
  <JoinGuildModal v-if="showJoinGuild" @close="showJoinGuild = false" />
</template>
