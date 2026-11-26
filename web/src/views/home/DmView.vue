<script setup lang="ts">
/**
 * DmView — 1-1 ve grup DM ekranı (/dm/:channelId). Kendi route param'ını okur.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { forgetChannel, saveDm } from '@/lib/resumeLastScreen'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { isWide } from '@/composables/useResponsive'
import HomeTopBar from './components/HomeTopBar.vue'
import DmConversation from './components/DmConversation.vue'
import DmProfilePanel from './components/DmProfilePanel.vue'

const props = defineProps<{ channelId: string }>()

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { leaveChannel } = useSocket()
// Sprint WEB-PARITE §4 — DM profil paneli <1280'de overlay. Sağ panel state'i ortam
// görünümüyle AYNI singleton (`rightPanelOpen`): paralel state yok, ESC kapatması
// `AppShell`'de zaten kurulu (`!isWide && rightPanelVisible → closeRightPanel`),
// route değişiminde null'a döner → ≥1280 inline davranışı bozulmaz.
const { rightPanelVisible, toggleRightPanel, closeRightPanel } = useAppShellNav()

const activeDmChannel = computed(() => dmStore.activeChannel())

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
    if (authStore.user) forgetChannel(authStore.user.id, channelId) // C38 — erişilemeyen DM kaydı silinir
    await router.replace({ name: 'app' })
    return
  }
  if (authStore.user) saveDm(authStore.user.id, channelId) // C38

  guildsStore.setActiveGuild(null)
  const prev = channelsStore.activeChannelId
  if (prev) leaveChannel(prev)
  channelsStore.setActiveChannel(null)
  dmStore.setActiveChannel(channelId)
  // C75 §3.1: bekleyen giden istekte kabul gönderene ayrı olayla gelmez; sohbeti açınca durum tazelenir
  // (kabul edildiyse kutunun kilidi kalkar). Başarısızlık sessiz: yerel durum kalır.
  const cur = dmStore.activeChannel()
  if (cur?.type === 'DM' && cur.requestStatus === 'PENDING' && cur.requestOutgoing === true) {
    void dmStore.fetchChannels().catch(() => {})
  }
}

watch(() => props.channelId, (id) => sync(id), { immediate: true })
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <HomeTopBar @select-dm="(id: string) => router.push({ name: 'dm', params: { channelId: id } })" />
    <div v-if="activeDmChannel" class="flex flex-1 min-w-0 overflow-hidden gap-4 relative">
      <!-- `cleared` KALKTI: sohbeti temizleme DM satırı menüsüne taşındı (SPRINT_DM_MENU §4),
           aktif DM temizlenince ana sayfaya dönüşü `DmList` yapıyor. Aynı desen `left` için de
           geçerli (İş 2, 2026-08-03): gruptan ayrılma artık DM satırı menüsünden tetikleniyor,
           dönüşü de o yapıyor — `DmConversation` bu emit'i artık hiç üretmiyor. -->
      <DmConversation
        :channel="activeDmChannel"
        :profile-panel-open="rightPanelVisible"
        @toggle-profile="toggleRightPanel"
      />
      <!-- Profil paneli yalnızca 1-1 DM için.
           ≥1280: bugünkü inline davranış aynen (koşulsuz açık).
           `hidden xl:flex` DEĞİL: bazı tarayıcı eklentileri her sayfaya katmansız
           `.hidden{display:none}` enjekte ediyor ve Tailwind'in katmanlı varyantını
           eziyor → panel geniş ekranda da gizli kalıyordu. `hidden` sınıf adını hiç
           kullanmayan bu kalıp aynı işi yapar ve dış CSS'e bağışıklıdır. -->
      <template v-if="activeDmChannel.type === 'DM'">
        <div v-if="isWide" class="flex">
          <DmProfilePanel :other-user="activeDmChannel.otherUser" />
        </div>

        <!-- <1280: sağdan overlay drawer (üye paneli deseni — TextChannelView §A ikizi) -->
        <template v-else>
          <Transition name="kv-fade">
            <div
              v-if="rightPanelVisible"
              class="absolute inset-0 z-20"
              style="background-color: rgba(0,0,0,0.6);"
              aria-hidden="true"
              @click="closeRightPanel"
            />
          </Transition>

          <Transition name="kv-slide-right">
            <div
              v-if="rightPanelVisible"
              class="absolute right-0 inset-y-0 z-30 flex overflow-hidden"
              role="dialog"
              :aria-label="t('dm.profilePanel')"
            >
              <DmProfilePanel :other-user="activeDmChannel.otherUser" />
            </div>
          </Transition>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Üye paneli overlay'iyle aynı geçişler (TextChannelView) — yeni animasyon dili uydurulmadı. */
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
