<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { useNotificationsStore } from '@/stores/notifications'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'
import { useMessageJump } from '@/composables/useMessageJump'
import { reactionEmoji, reactionPreviewText } from '@/utils/reactionNotification'
import type { NotificationDto } from '@/types'

const { t } = useI18n()
const router = useRouter()
const notificationsStore = useNotificationsStore()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()
const { requestJump } = useMessageJump()

// C9 — bekleyen mesaj istekleri çanda da görünür (rozete dahil + panelde üstte satır).
const requestCount = computed(() => dmStore.requestCount)
const bellBadge = computed(() => notificationsStore.unreadCount + requestCount.value)

function openRequests() {
  showNotifications.value = false
  router.push({ name: 'dm-requests' })
}

// "Tümünü okundu işaretle" — çan bildirimleri OKUNDU + ortam/kanal kırmızı rozetleri varsa aktif.
// (Çan, açılışta kendi bildirimlerini okur; bu yüzden buton guild/kanal rozetlerini de gözetir.)
const hasAnyUnread = computed(
  () =>
    notificationsStore.unreadCount > 0 ||
    guildsStore.guilds.some((g) => g.unreadCount > 0 || g.unreadMentionCount > 0),
)

// Tıkla → hem çan bildirimlerini hem TÜM ortam/kanal okunmamışlarını okundu işaretle.
async function markEverythingRead() {
  await Promise.allSettled([notificationsStore.markAllRead(), channelsStore.markAllRead()])
}

const showNotifications = ref(false)
const bellRef = ref<HTMLElement | null>(null)

onClickOutside(bellRef, () => { showNotifications.value = false })

function openNotifications() {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    // Panel ilk açılışta REST'ten tam ilk sayfayı çek (snapshot yalnız okunmamışları taşır)
    void notificationsStore.loadMore()
    void notificationsStore.markAllRead()
  }
}

// Panel scroll sonu → bir sonraki sayfayı yükle
function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    void notificationsStore.loadMore()
  }
}

// Bildirim metni — actor null ise jenerik ("Biri")
function notificationText(n: NotificationDto): string {
  const actor = n.actor?.username ?? t('notification.someone')
  switch (n.type) {
    case 'MENTION':
      return t('notification.mention', { actor })
    case 'FRIEND_REQUEST':
      return t('notification.friendRequest', { actor })
    case 'FRIEND_ACCEPT':
      return t('notification.friendAccept', { actor })
    case 'GUILD_INVITE':
      return t('notification.guildInvite', { actor, guild: n.guildName ?? t('invite.unknownGuild') })
    case 'EVENT_CREATED':
      // R14 — metin mobille BİREBİR (tek kaynak tr.json)
      return t('notification.eventCreated', { actor, event: n.preview ?? '' })
    case 'REACTION':
      return t('notification.reaction', { actor, emoji: reactionEmoji(n.preview) })
    default:
      return actor
  }
}

// Satırın alt metni: REACTION'da önizleme emojiyi taşır (metne gitti), kalanı gösterilir
function notificationPreview(n: NotificationDto): string {
  return n.type === 'REACTION' ? reactionPreviewText(n.preview) : (n.preview ?? '')
}

// Türk yereli görece zaman ("5 dk önce")
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return t('notification.now')
  const min = Math.floor(sec / 60)
  if (min < 60) return t('notification.minutesAgo', { n: min })
  const hour = Math.floor(min / 60)
  if (hour < 24) return t('notification.hoursAgo', { n: hour })
  const day = Math.floor(hour / 24)
  if (day < 7) return t('notification.daysAgo', { n: day })
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

/**
 * R14 — ortamın etkinlikler yüzeyini aç. Etkinlikler modalı `ChannelPanel`'de yaşıyor
 * (ortam sidebar'ı) → önce ortamın bir kanalına gidilir, sonra `?events=1` modalı açtırır.
 * Kanal seçimi `ServerRail.selectGuild` deseni: yüklü değilse fetch, ilk kanal.
 */
async function openGuildEvents(guildId: string) {
  if (!channelsStore.channelsForGuild(guildId).length) {
    await channelsStore.fetchChannelsAndCategories(guildId).catch(() => {})
  }
  const channels = channelsStore.channelsForGuild(guildId)
  if (!channels.length) return // kanalsız ortam → kırık navigasyon vaat etme
  router.push({
    name: 'channel',
    params: { guildId, channelId: channels[0].id },
    query: { events: '1' },
  })
}

// Tıkla → ilgili yere git + okundu işaretle
async function onItemClick(n: NotificationDto) {
  showNotifications.value = false
  void notificationsStore.markRead(n.id)

  if ((n.type === 'MENTION' || n.type === 'REACTION') && n.channelId) {
    // Guild kanalı → channel route; DM (guildId null) → dm route. Sonra mesaja zıpla.
    if (n.guildId) {
      router.push({ name: 'channel', params: { guildId: n.guildId, channelId: n.channelId } })
    } else {
      router.push({ name: 'dm', params: { channelId: n.channelId } })
    }
    if (n.messageId) requestJump(n.channelId, n.messageId)
  } else if (n.type === 'FRIEND_REQUEST') {
    // Arkadaş istekleri görünümü (HomeView ?tab=pending)
    router.push({ name: 'app', query: { tab: 'pending' } })
  } else if (n.type === 'FRIEND_ACCEPT') {
    // Arkadaşlar görünümü
    router.push({ name: 'app' })
  } else if (n.type === 'GUILD_INVITE' && n.preview) {
    // preview = davet kodu → kabul/reddet görünümü
    router.push(`/invite/${n.preview}`)
  } else if (n.type === 'EVENT_CREATED' && n.guildId) {
    // R14 — ortamın etkinlikler yüzeyi. Bildirimde etkinlik ID'si yok (preview = ad),
    // o yüzden kart vurgusu yapılmaz; `?events=1` yalnız modalı açar (ChannelPanel yakalar).
    await openGuildEvents(n.guildId)
  }
}
</script>

<template>
  <div ref="bellRef" class="relative shrink-0">
    <button
      class="relative w-9 h-9 rounded-[var(--kv-radius-md)] flex items-center justify-center cursor-pointer transition-colors"
      :style="showNotifications
        ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);'
        : 'color: var(--kv-text-muted);'"
      :class="!showNotifications ? 'hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]' : ''"
      @click="openNotifications"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <!-- Okunmamış rozet (bildirim + bekleyen mesaj isteği) -->
      <span
        v-if="bellBadge > 0"
        class="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white pointer-events-none"
        style="background-color: var(--kv-danger); line-height: 1;"
      >
        {{ bellBadge > 99 ? '99+' : bellBadge }}
      </span>
    </button>

    <!-- Bildirim paneli -->
    <div
      v-if="showNotifications"
      class="absolute top-full right-0 mt-2 w-[320px] rounded-[var(--kv-radius-lg)] overflow-hidden"
      style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 50;"
    >
      <div class="px-4 py-3 border-b flex items-center justify-between gap-2" style="border-color: var(--kv-border-subtle);">
        <p class="text-[14px] font-bold" style="color: var(--kv-text-primary);">
          {{ t('notification.title') }}
        </p>
        <button
          type="button"
          class="text-[12px] font-medium shrink-0 transition-colors disabled:opacity-40 disabled:cursor-default cursor-pointer hover:underline"
          :style="`color: var(--kv-accent-500);`"
          :disabled="!hasAnyUnread"
          @click="markEverythingRead()"
        >
          {{ t('notification.markAllRead') }}
        </button>
      </div>

      <!-- C9 — Mesaj isteği satırı (bildirim listesinin üstünde sabit; varsa) -->
      <button
        v-if="requestCount > 0"
        type="button"
        class="w-full text-left flex items-center gap-3 px-4 py-3 border-b cursor-pointer transition-colors hover:brightness-110"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-accent-subtle);"
        @click="openRequests"
      >
        <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center" style="background-color: var(--kv-accent-500);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-medium leading-snug" style="color: var(--kv-text-primary);">
            {{ t('notification.messageRequests', { n: requestCount }) }}
          </p>
        </div>
        <span class="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0" style="background-color: var(--kv-accent-500);">{{ requestCount }}</span>
      </button>

      <!-- Boş durum (bildirim yok VE bekleyen istek yok) -->
      <div v-if="!notificationsStore.items.length && requestCount === 0" class="py-10 text-center">
        <p class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('notification.empty') }}</p>
      </div>

      <!-- Bildirim listesi -->
      <div v-else class="overflow-y-auto" style="max-height: 360px;" @scroll="onScroll">
        <button
          v-for="item in notificationsStore.items"
          :key="item.id"
          type="button"
          class="w-full text-left flex items-start gap-3 px-4 py-3 border-b last:border-0 cursor-pointer transition-colors hover:brightness-110"
          :style="`border-color: var(--kv-border-subtle); background-color: ${item.readAt ? 'transparent' : 'var(--kv-accent-subtle)'};`"
          @click="onItemClick(item)"
        >
          <!-- Aktör avatarı (varsa) -->
          <div
            v-if="item.actor"
            class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[13px] font-semibold text-white overflow-hidden"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="item.actor.avatarUrl" :src="item.actor.avatarUrl" :alt="item.actor.username" class="w-full h-full object-cover" />
            <span v-else>{{ item.actor.username[0].toUpperCase() }}</span>
          </div>
          <!-- Aktör yoksa jenerik ikon -->
          <div
            v-else
            class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
            style="background-color: var(--kv-bg-content);"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-[13px] leading-snug" style="color: var(--kv-text-body);">
              {{ notificationText(item) }}
            </p>
            <!-- Mention önizlemesi (varsa) — GUILD_INVITE'ta preview davet kodudur, gösterilmez;
                 EVENT_CREATED'ta preview etkinlik adı ve zaten metnin içinde geçiyor (tekrar etmesin) -->
            <p
              v-if="notificationPreview(item) && item.type !== 'GUILD_INVITE' && item.type !== 'EVENT_CREATED'"
              class="text-[12px] leading-snug mt-0.5 truncate"
              style="color: var(--kv-text-muted);"
            >
              {{ notificationPreview(item) }}
            </p>
            <p class="text-[11px] mt-1" style="color: var(--kv-text-muted);">
              {{ relativeTime(item.createdAt) }}
            </p>
          </div>

          <!-- Okunmamış aksan noktası (Kor) -->
          <span
            v-if="!item.readAt"
            class="w-2 h-2 rounded-full shrink-0 mt-1.5"
            style="background-color: var(--kv-accent-500);"
          />
        </button>

        <!-- Daha fazla yükleniyor -->
        <div v-if="notificationsStore.loadingMore" class="py-3 text-center">
          <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('notification.loadMore') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
