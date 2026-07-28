<script setup lang="ts">
/**
 * DmView — 1-1 ve grup DM ekranı (/dm/:channelId). Kendi route param'ını okur.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import HomeTopBar from './components/HomeTopBar.vue'
import DmConversation from './components/DmConversation.vue'
import DmProfilePanel from './components/DmProfilePanel.vue'

const props = defineProps<{ channelId: string }>()

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { leaveChannel } = useSocket()

const activeDmChannel = computed(() => dmStore.activeChannel())

// C9 — gönderen tarafı: giden mesaj isteği kabul bekliyor (tek mesaj bilgisi bandı)
const outgoingPending = computed(
  () =>
    activeDmChannel.value?.type === 'DM' &&
    activeDmChannel.value.requestStatus === 'PENDING' &&
    activeDmChannel.value.requestOutgoing === true,
)

async function sync(channelId: string) {
  if (!channelId) {
    await router.replace({ name: 'app' })
    return
  }
  // DM listede yoksa tazele; hâlâ yoksa home'a düş
  if (!dmStore.channels.find((c) => c.id === channelId)) {
    try {
      await dmStore.fetchChannels()
    } catch {
      await router.replace({ name: 'app' })
      return
    }
  }
  if (!dmStore.channels.find((c) => c.id === channelId)) {
    await router.replace({ name: 'app' })
    return
  }

  guildsStore.setActiveGuild(null)
  const prev = channelsStore.activeChannelId
  if (prev) leaveChannel(prev)
  channelsStore.setActiveChannel(null)
  dmStore.setActiveChannel(channelId)
}

function toHome() {
  router.push({ name: 'app' })
}

watch(() => props.channelId, (id) => sync(id), { immediate: true })
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <HomeTopBar @select-dm="(id: string) => router.push({ name: 'dm', params: { channelId: id } })" />
    <!-- C9 — giden istek kabul bekliyor bandı -->
    <div
      v-if="outgoingPending"
      class="shrink-0 mx-4 mt-2 px-4 py-2.5 rounded-[var(--kv-radius-md)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
    >
      {{ t('messageRequests.sentBanner') }}
    </div>
    <div v-if="activeDmChannel" class="flex flex-1 min-w-0 overflow-hidden gap-4">
      <DmConversation
        :channel="activeDmChannel"
        @cleared="toHome"
        @left="toHome"
        @deleted="toHome"
      />
      <!-- Profil paneli yalnızca 1-1 DM için.
           `hidden xl:flex` DEĞİL: bazı tarayıcı eklentileri her sayfaya katmansız
           `.hidden{display:none}` enjekte ediyor ve Tailwind'in katmanlı varyantını
           eziyor → panel geniş ekranda da gizli kalıyordu. `hidden` sınıf adını hiç
           kullanmayan bu kalıp aynı işi yapar ve dış CSS'e bağışıklıdır. -->
      <div v-if="activeDmChannel.type === 'DM'" class="flex max-xl:hidden">
        <DmProfilePanel :other-user="activeDmChannel.otherUser" />
      </div>
    </div>
  </div>
</template>
