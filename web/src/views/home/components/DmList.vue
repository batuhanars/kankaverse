<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDmStore } from '@/stores/dm'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useTyping } from '@/composables/useTyping'
import { useResponsive } from '@/composables/useResponsive'
import { useDmMenuActions } from '@/composables/useDmMenuActions'
import { usersApi } from '@/api/users'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import ContextMenuShell from '@/components/shared/ContextMenuShell.vue'
import MuteDurationFlyout from '@/components/shared/MuteDurationFlyout.vue'
import NotifLevelFlyout from '@/components/shared/NotifLevelFlyout.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import FullProfileModal from '@/components/shared/FullProfileModal.vue'
import { formatMentionsPlain } from '@/utils/mentions'
import type { DmChannelDto, UserProfileCardDto } from '@/types'

const props = defineProps<{ activeChannelId: string | null }>()
const emit = defineEmits<{ select: [channelId: string] }>()

const { t } = useI18n()
const router = useRouter()
const dmStore = useDmStore()
const prefsStore = useNotificationPrefsStore()
const presenceStore = usePresenceStore()
const authStore = useAuthStore()
const toast = useToastStore()
const { isMobile } = useResponsive()
const { typingUsersForChannel } = useTyping(() => null)

// C9: bekleyen mesaj isteği kanalları normal DM listesinde GÖRÜNMEZ (istek kutusuna gider).
// Gönderenin giden PENDING isteği optimistik eklenmiş olabilir → burada elenir.
const visibleChannels = computed(() =>
  dmStore.channels.filter((ch) => !(ch.type === 'DM' && ch.requestStatus === 'PENDING')),
)

function truncate(text: string, max = 40) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/**
 * Sprint WEB-PARITE §2.3 — susturulmuş (veya seviyesi `NONE`) DM'in görsel dili: rozet çizilmez,
 * ad kalınlaşmaz, satır sönük durur. Sohbet listeden GİZLENMEZ (kayıp sohbet hissi yaratma).
 *
 * Süzgeç sunucu ham `unread` döndürdüğü için çizimde de gerekli (yenilemeden sonra doğru davranış).
 * Tek kaynak `channelBadgeEffect`; `countMention` yanlış olan hâller tam olarak "mute veya NONE"dur
 * (`MENTIONS` DM'de bahsetme sayacı olmadığı için normal görünür — ikinci bir mute mantığı yazmıyoruz).
 */
function dmSilenced(ch: DmChannelDto): boolean {
  return !prefsStore.channelBadgeEffect(ch.id).countMention
}

/** Rozet + kalın ad yalnız okunmamış VE susturulmamışken. */
function dmShowUnread(ch: DmChannelDto): boolean {
  return ch.unread && !dmSilenced(ch)
}

// Son-mesaj önizlemesi için mention resolver: kanalın bilinen katılımcıları + giriş yapan kullanıcı
function lastMsgResolver(ch: DmChannelDto) {
  return (id: string): string | undefined => {
    if (id === authStore.user?.id) return authStore.user.username
    if (ch.type === 'DM') {
      if (id === ch.otherUser.id) return ch.otherUser.username
    } else {
      const member = ch.members.find((m) => m.id === id)
      if (member) return member.username
    }
    return undefined
  }
}

function formatLastMessage(ch: DmChannelDto, content: string): string {
  return truncate(formatMentionsPlain(content, lastMsgResolver(ch), t('mention.unknown')))
}

// Grup için görüntü adı: ad varsa onu, yoksa üye adlarını birleştir
function groupDisplayName(ch: Extract<DmChannelDto, { type: 'GROUP_DM' }>): string {
  if (ch.name) return ch.name
  const names = ch.members.map((m) => m.username)
  if (names.length <= 3) return names.join(', ')
  return names.slice(0, 2).join(', ') + ` +${names.length - 2}`
}

// ── DM satırı context menüsü (SPRINT_DM_MENU §3) ──
// Hedef, aktif DM değil **menünün açıldığı** satırdır (ChannelPanel `contextChannel` deseni).
const menuChannel = ref<DmChannelDto | null>(null)
const menuX = ref(0)
const menuY = ref(0)
const menuDm = computed(() => (menuChannel.value?.type === 'DM' ? menuChannel.value : null))

function closeMenu() {
  menuChannel.value = null
}

// Satıra sağ-tık → imleç konumunda menü
function onRowContext(e: MouseEvent, ch: DmChannelDto) {
  e.preventDefault()
  e.stopPropagation()
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuChannel.value = ch
}

// ⋯ butonu → butonun altına konumla + toggle (GuildMemberRow deseni: iki giriş, tek menü)
function onDotsClick(e: MouseEvent, ch: DmChannelDto) {
  if (menuChannel.value?.id === ch.id) {
    closeMenu()
    return
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuX.value = r.right - 4
  menuY.value = r.bottom + 4
  menuChannel.value = ch
}

const {
  markDmRead,
  isDmMuted,
  dmMutedUntil,
  muteDmFor,
  unmuteDm,
  dmLevel,
  setDmLevel,
  clearDm,
  canAddFriend,
  addFriendFromDm,
} = useDmMenuActions(() => menuChannel.value)

// Profil → tam profil modalı (kartı istek anında çeker; liste kart verisi taşımıyor)
const profileCard = ref<UserProfileCardDto | null>(null)

async function openProfile() {
  const ch = menuDm.value
  closeMenu()
  if (!ch) return
  try {
    const { data } = await usersApi.getCard(ch.otherUser.id)
    profileCard.value = data
  } catch {
    // erişim kapısı 404 → kart yok; sessiz kalmak yerine kullanıcıya söylenir
    toast.error(t('common.error'))
  }
}

function doMarkRead() {
  markDmRead()
  closeMenu()
}

function doAddFriend() {
  addFriendFromDm()
  closeMenu()
}

// Sohbeti temizle — onay diyaloğu (aktif DM temizlenirse ana sayfaya dönülür: DmView'ın
// bugünkü `cleared` davranışının aynısı, kanal listeden düşünce ekran boş kalmasın).
const clearTarget = ref<DmChannelDto | null>(null)
const clearing = ref(false)

function askClear() {
  clearTarget.value = menuChannel.value
  closeMenu()
}

async function confirmClear() {
  const ch = clearTarget.value
  if (!ch) return
  clearing.value = true
  try {
    await clearDm(ch.id)
    if (props.activeChannelId === ch.id) router.push({ name: 'app' })
  } catch {
    toast.error(t('common.error'))
  } finally {
    clearing.value = false
    clearTarget.value = null
  }
}

// Şikâyet — hedef kullanıcı (grup DM'de gösterilmez: şikâyet hedefi tek kullanıcı)
const reportUserId = ref<string | null>(null)

function openReport() {
  const ch = menuDm.value
  closeMenu()
  if (ch) reportUserId.value = ch.otherUser.id
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-2 pt-2 pb-20">

    <p v-if="!visibleChannels.length" class="px-2 py-3 text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('dm.noDms') }}
    </p>

    <!-- Satır sarmalayıcı: ⋯ butonu satır butonunun İÇİNE konamaz (iç içe <button> geçersiz),
         bu yüzden ikisi kardeş; sarmalayıcı hover (`group`) ve konum çapası. -->
    <div
      v-for="ch in visibleChannels"
      :key="ch.id"
      class="group relative"
      @contextmenu="onRowContext($event, ch)"
    >
      <button
        class="w-full flex items-center gap-3 pl-2 pr-9 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer text-left"
        :style="activeChannelId === ch.id
          ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); box-shadow: inset 2px 0 0 var(--kv-accent-500);'
          : dmSilenced(ch)
            ? 'color: var(--kv-text-muted);'
            : 'color: var(--kv-text-secondary);'"
        @click="emit('select', ch.id)"
      >
        <!-- Avatar alanı -->
        <div class="relative shrink-0">
          <!-- 1-1 DM: tekil avatar + presence -->
          <template v-if="ch.type === 'DM'">
            <div class="w-8 h-8 rounded-full overflow-hidden" style="background-color: var(--kv-bg-content);">
              <img
                v-if="ch.otherUser.avatarUrl"
                :src="ch.otherUser.avatarUrl"
                :alt="ch.otherUser.username"
                class="w-full h-full object-cover"
              />
              <span v-else class="w-full h-full flex items-center justify-center text-[12px] font-semibold" style="color: var(--kv-text-secondary);">
                {{ ch.otherUser.username[0].toUpperCase() }}
              </span>
            </div>
            <!-- Okunmamış rozet — susturulmuş DM'de çizilmez (§2.3) -->
            <span
              v-if="dmShowUnread(ch)"
              class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-sidebar);"
            />
            <!-- Presence noktası (okunmamış rozet yoksa) -->
            <PresenceDot
              v-else
              :status="presenceStore.getStatus(ch.otherUser.id)"
              border-color="var(--kv-bg-sidebar)"
              class="absolute bottom-0 right-0 w-2.5 h-2.5"
            />
          </template>

          <!-- GROUP_DM: çoklu-avatar (ilk 2-3 üye dairesel istif) -->
          <template v-else>
            <div class="relative w-9 h-8">
              <!-- İlk avatar (arka) -->
              <div
                v-if="ch.members[1]"
                class="absolute bottom-0 right-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
                style="background-color: var(--kv-bg-content); border-color: var(--kv-bg-sidebar);"
              >
                <img
                  v-if="ch.members[1].avatarUrl"
                  :src="ch.members[1].avatarUrl"
                  :alt="ch.members[1].username"
                  class="w-full h-full object-cover"
                />
                <span v-else style="background-color: var(--kv-accent-500); width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                  {{ ch.members[1].username[0].toUpperCase() }}
                </span>
              </div>
              <!-- İkinci avatar (öne) -->
              <div
                class="absolute top-0 left-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
                style="background-color: var(--kv-bg-content); border-color: var(--kv-bg-sidebar);"
              >
                <img
                  v-if="ch.members[0]?.avatarUrl"
                  :src="ch.members[0].avatarUrl"
                  :alt="ch.members[0].username"
                  class="w-full h-full object-cover"
                />
                <span v-else style="background-color: var(--kv-accent-500); width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                  {{ (ch.members[0]?.username ?? '?')[0].toUpperCase() }}
                </span>
              </div>
            </div>
            <!-- Okunmamış rozet — susturulmuş grup DM'de çizilmez (§2.3) -->
            <span
              v-if="dmShowUnread(ch)"
              class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-sidebar);"
            />
          </template>
        </div>

        <!-- İsim + son mesaj -->
        <div class="flex-1 min-w-0">
          <p
            class="text-[13px] font-medium truncate"
            :style="dmShowUnread(ch) ? 'color: var(--kv-text-primary); font-weight: 600;' : ''"
          >
            <template v-if="ch.type === 'DM'">{{ ch.otherUser.username }}</template>
            <template v-else>{{ groupDisplayName(ch) }}</template>
          </p>
          <p
            v-if="typingUsersForChannel(ch.id).length > 0"
            class="text-[12px] truncate italic"
            style="color: var(--kv-accent-500);"
          >
            {{ t('typing.simple') }}
          </p>
          <p v-else-if="ch.lastMessage" class="text-[12px] truncate" style="color: var(--kv-text-muted);">
            {{ formatLastMessage(ch, ch.lastMessage.content) }}
          </p>
        </div>
      </button>

      <!-- ⋯ menü butonu. Dokunmatikte hover yok → <768'de kalıcı görünür (sözleşme §5).
           Görünürlük Tailwind `max-md:` varyantıyla değil composable ile kuruluyor:
           varyant sırasına güvenmek gerekmesin. -->
      <button
        class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-opacity hover:bg-[var(--kv-bg-rail)]"
        :class="menuChannel?.id === ch.id || isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        style="width: 24px; height: 24px; color: var(--kv-text-muted);"
        :title="t('dm.menuTitle')"
        :aria-label="t('dm.menuTitle')"
        @click.stop="onDotsClick($event, ch)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" fill="currentColor"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- DM menüsü — paylaşılan kabuk (öğe sırası sözleşme §3.1/§3.2 ile bağlayıcı) -->
  <ContextMenuShell
    v-if="menuChannel"
    :x="menuX"
    :y="menuY"
    menu-id="dm-row"
    @close="closeMenu"
  >
    <!-- 1. Profil (yalnız 1-1) -->
    <button v-if="menuDm" class="kv-ctx__item" role="menuitem" @click="openProfile">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>{{ t('member.actions.profile') }}</span>
    </button>

    <!-- 2. Kanka Ekle (yalnız 1-1 ve kanka değilse) -->
    <button v-if="menuDm && canAddFriend" class="kv-ctx__item" role="menuitem" @click="doAddFriend">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
      <span>{{ t('friends.add') }}</span>
    </button>

    <!-- 3. Okunmuş Olarak İşaretle -->
    <button class="kv-ctx__item" role="menuitem" @click="doMarkRead">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M20 6 9 17l-5-5"/></svg>
      <span>{{ t('guildMenu.markRead') }}</span>
    </button>

    <!-- 4. Sustur / Susturmayı Kaldır (hedef: CHANNEL + DM kanal id) -->
    <MuteDurationFlyout
      :muted="isDmMuted"
      :muted-until="dmMutedUntil"
      :label="t('dm.mute')"
      :unmute-label="t('dm.unmute')"
      @mute="muteDmFor"
      @unmute="unmuteDm"
    />

    <!-- 5. Bildirim Ayarları -->
    <NotifLevelFlyout :level="dmLevel" @select="setDmLevel" />

    <div class="kv-ctx__divider" />

    <!-- 6. Sohbeti Temizle -->
    <button class="kv-ctx__item" role="menuitem" @click="askClear">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      <span>{{ t('dm.clearConversation') }}</span>
    </button>

    <!-- 7. Şikâyet Et (yalnız 1-1; hedef tek kullanıcı) -->
    <button v-if="menuDm" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="openReport">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
      <span>{{ t('report.reportUser') }}</span>
    </button>
  </ContextMenuShell>

  <!-- Sohbeti temizle onayı (mevcut metin/akış) -->
  <ConfirmDialog
    v-if="clearTarget"
    :message="t('dm.clearConfirmMsg')"
    :confirm-label="t('dm.clearButton')"
    :loading="clearing"
    @confirm="confirmClear"
    @cancel="clearTarget = null"
  />

  <!-- Şikâyet modalı (kullanıcı) -->
  <ReportModal
    v-if="reportUserId"
    target-type="USER"
    :target-id="reportUserId"
    @close="reportUserId = null"
  />

  <!-- Tam profil modalı -->
  <FullProfileModal
    v-if="profileCard"
    :card="profileCard"
    @close="profileCard = null"
    @open-dm="(id: string) => { profileCard = null; emit('select', id) }"
  />
</template>
