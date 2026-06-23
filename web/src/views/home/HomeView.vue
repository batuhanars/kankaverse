<script setup lang="ts">
/**
 * HomeView — ana ekran (/). Arkadaşlar/dashboard + arkadaş istekleri (query ?tab=pending).
 * Guild/kanal/DM aktif state'ini temizler; modalları useAppModals üzerinden açar.
 *
 * Sağ panel (FriendsRightPanel):
 *   ≥1280 (isWide): inline — TextChannelView/MemberPanel ile aynı desen.
 *   <1280:          overlay drawer (sağdan) — useAppShellNav.rightPanelOpen ile kontrol.
 */
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import { useAppModals } from '@/composables/useAppModals'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { isWide } from '@/composables/useResponsive'
import HomeTopBar from './components/HomeTopBar.vue'
import HomeDashboard from './components/HomeDashboard.vue'
import FriendsRightPanel from './components/FriendsRightPanel.vue'

const { t } = useI18n()
const { rightPanelVisible, closeRightPanel } = useAppShellNav()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { leaveChannel } = useSocket()
const { openServerModal, openAddFriend } = useAppModals()

const initialTab = computed<'all' | 'pending'>(() => (route.query.tab === 'pending' ? 'pending' : 'all'))

function clearActive() {
  guildsStore.setActiveGuild(null)
  const prev = channelsStore.activeChannelId
  if (prev) leaveChannel(prev)
  channelsStore.setActiveChannel(null)
  dmStore.setActiveChannel(null)
}
watch(() => route.name, () => { if (route.name === 'app') clearActive() }, { immediate: true })

function selectDm(channelId: string) {
  router.push({ name: 'dm', params: { channelId } })
}

async function openGuild(guildId: string) {
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
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <HomeTopBar @select-dm="selectDm" />
    <div class="flex flex-1 min-w-0 overflow-hidden gap-4 relative">
      <HomeDashboard
        @add-friend="openAddFriend"
        @create-ortam="openServerModal('create')"
        @join-ortam="openServerModal('join')"
        @import-ortam="openServerModal('import')"
        @open-guild="openGuild"
      />

      <!-- ≥1280: inline sağ sütun (mevcut görünüm birebir korunur) -->
      <template v-if="isWide">
        <FriendsRightPanel
          :key="initialTab"
          :initial-tab="initialTab"
          @add-friend="openAddFriend"
          @open-dm="selectDm"
        />
      </template>

      <!-- <1280: sağdan overlay drawer (default kapalı: null ?? false) -->
      <template v-else>
        <!-- Backdrop -->
        <Transition name="kv-fade">
          <div
            v-if="rightPanelVisible"
            class="absolute inset-0 z-20"
            style="background-color: rgba(0,0,0,0.6);"
            aria-hidden="true"
            @click="closeRightPanel"
          />
        </Transition>

        <!-- Panel overlay -->
        <Transition name="kv-slide-right">
          <div
            v-if="rightPanelVisible"
            class="absolute right-0 inset-y-0 z-30 flex overflow-hidden"
            role="dialog"
            :aria-label="t('nav.toggleFriends')"
          >
            <FriendsRightPanel
              :key="initialTab"
              :initial-tab="initialTab"
              class="flex"
              @add-friend="openAddFriend"
              @open-dm="selectDm"
            />
          </div>
        </Transition>
      </template>
    </div>
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
.kv-slide-right-enter-active,
.kv-slide-right-leave-active {
  transition: transform 0.3s ease;
}
.kv-slide-right-enter-from,
.kv-slide-right-leave-to {
  transform: translateX(100%);
}
</style>
