<script setup lang="ts">
import GameLine from '@/components/shared/GameLine.vue'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import ContextMenuShell from '@/components/shared/ContextMenuShell.vue'
import { canMentionUser } from '@/composables/useComposerMentionBridge'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import type { GuildMemberDto, RoleDto } from '@/types'
import type { PresenceStatus } from '@/stores/presence'

const { t } = useI18n()

const props = defineProps<{
  member: GuildMemberDto
  presenceStatus: PresenceStatus
  /** C31b: oynanan oyunun adı (sunucudan); yoksa satır çizilmez. */
  gameName?: string | null
  isOffline: boolean
  openMenuUserId: string | null
  roleLoading: string | null
  canManageRolesFn: (m: GuildMemberDto) => boolean
  canKickFn: (m: GuildMemberDto) => boolean
  canBanFn: (m: GuildMemberDto) => boolean
  canTransferFn: (m: GuildMemberDto) => boolean
  shouldShowMenuFn: (m: GuildMemberDto) => boolean
  // C10: bu satır benim mi (Mesaj Gönder gizle; kendine mesaj yok)
  isSelf?: boolean
  // R1: atanabilir roller (ortamın rolleri, @everyone hariç) — rol-seçici alt-menüsü için
  assignableRoles?: RoleDto[]
  // R1: bu üyenin hangi rol-seçici alt-menüsü açık (member.userId eşleşirse açık)
  roleSubmenuUserId?: string | null
  roleColor?: string | null
  // R8/R13: başka bir üyenin overlay'i (menü/kart) açık → bu satırın hover'ı bastırılsın
  hoverSuppressed?: boolean
  // R8/R13: bu satırın kendi overlay'i (menü/kart) açık → ⋯ butonu görünür/tıklanabilir kalsın
  ownerActive?: boolean
}>()

const emit = defineEmits<{
  toggleMenu: [userId: string]
  // C10: sağ-tık → imleç konumunda menü aç (toggle değil, doğrudan aç)
  openMenu: [userId: string]
  closeMenu: []
  openKick: [member: GuildMemberDto]
  openBan: [member: GuildMemberDto]
  openTransfer: [member: GuildMemberDto]
  // R1: "Rolleri Yönet" alt-menüsünü aç/kapat
  toggleRoleSubmenu: [userId: string]
  // R1: bir rolü üyede aç/kapat (atanmışsa kaldır, değilse ata)
  toggleRole: [member: GuildMemberDto, role: RoleDto]
  // C5 follow-up: üye satırına sol-tık → kullanıcı kartı popover (mesaj-yazarı deseni)
  selectMember: [userId: string, x: number, y: number]
  // C10: menüden Mesaj Gönder / Kullanıcı ID kopyala
  messageMember: [member: GuildMemberDto]
  copyMemberId: [userId: string]
  // D95: menüden Bahset
  mentionMember: [member: GuildMemberDto]
}>()

// C10: menü konumu (⋯ butonundan veya sağ-tık imlecinden); kabuk (ContextMenuShell) kenara sıkıştırır.
const menuX = ref(0)
const menuY = ref(0)

// Menüde moderasyon bölümü var mı (ayraç kararı)
const hasModeration = computed(
  () =>
    props.canManageRolesFn(props.member) ||
    props.canKickFn(props.member) ||
    props.canBanFn(props.member) ||
    props.canTransferFn(props.member),
)

// ⋯ butonu → butonun altına konumla + toggle
function onButtonClick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuX.value = r.right - 4
  menuY.value = r.bottom + 4
  emit('toggleMenu', props.member.userId)
}

// Satıra sağ-tık → imleç konumunda menü (tarayıcı menüsünü bastır)
// stopPropagation şart: olay document'a çıkarsa kabuk menüyü anında kapatır (C60 dersi).
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  menuX.value = e.clientX
  menuY.value = e.clientY
  emit('openMenu', props.member.userId)
}

// R1: üyede bu rol atalı mı? (rol-seçici işaret durumu)
function memberHasRole(roleId: string): boolean {
  return (props.member.roles ?? []).some((r) => r.id === roleId)
}

function avatarInitial(username: string) {
  return username.charAt(0).toUpperCase()
}

// Satıra sol-tık → kullanıcı kartı (⋯ menü butonu @click.stop ile çakışmaz)
function onRowClick(e: MouseEvent) {
  emit('selectMember', props.member.userId, e.clientX, e.clientY)
}

// Hover-vurgu: başka üyenin overlay'i açıkken bastır; kendi overlay'i açıkken sabit kal.
// Sprint C16 — hareketli avatar yalnız satır hover'dayken
const rowHovered = ref(false)
const avatarSrc = computed(() => hoverAvatarSrc(props.member, rowHovered.value))

function onRowEnter(e: MouseEvent) {
  rowHovered.value = true
  if (props.hoverSuppressed) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'
}

function onRowLeave(e: MouseEvent) {
  rowHovered.value = false
  // Kendi overlay'i açıkken vurgu kalsın (kart/menü bu satıra çapalı).
  if (props.ownerActive) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
}
</script>

<template>
  <div
    class="group relative flex items-center gap-3 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-pointer"
    :class="{
      'opacity-50': props.isOffline && props.openMenuUserId !== props.member.userId,
      'z-30': props.openMenuUserId === props.member.userId,
    }"
    :style="`transition: background-color 0.1s; background-color: ${props.ownerActive ? 'var(--kv-bg-elevated)' : 'transparent'};`"
    @mouseenter="onRowEnter"
    @mouseleave="onRowLeave"
    @click.stop="onRowClick"
    @contextmenu="onContextMenu"
  >
    <!-- Avatar + presence dot -->
    <div class="relative shrink-0">
      <div
        class="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-semibold overflow-hidden"
        :style="props.isOffline
          ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);'
          : props.roleColor
            ? `background-color: ${props.roleColor}33; color: ${props.roleColor};`
            : 'background-color: var(--kv-accent-500); color: #fff;'"
      >
        <img
          v-if="avatarSrc"
          :src="avatarSrc"
          :alt="member.username"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ avatarInitial(member.username) }}</span>
      </div>
      <PresenceDot
        :status="props.presenceStatus"
        border-color="var(--kv-bg-sidebar)"
        class="absolute -bottom-0.5 -right-0.5 w-3 h-3"
      />
    </div>

    <!-- Kullanıcı adı -->
    <div class="flex-1 min-w-0">
      <span
        class="block text-[15px] font-medium truncate"
        :style="props.isOffline ? 'color: var(--kv-text-muted);' : 'color: var(--kv-text-primary);'"
      >
        {{ member.username }}<span v-if="member.roleEmoji" class="ml-1">{{ member.roleEmoji }}</span>
      </span>
      <GameLine
        v-if="props.gameName && !props.isOffline"
        class="text-[11px] leading-tight"
        :name="props.gameName"
      />
    </div>

    <!-- Taç: sahip -->
    <span
      v-if="member.role === 'OWNER'"
      class="shrink-0 text-[10px] px-1 py-0.5 rounded"
      style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
      :title="t('member.role.OWNER')"
    >
      👑
    </span>

    <!-- ⋯ İşlem menüsü butonu (moderasyon yetkisi olanlarda hover ile görünür; menü sağ-tıkla herkeste açılır).
         - ownerActive (kendi menü/kart açık) → görünür ve tıklanabilir kalır (Bug 1).
         - hoverSuppressed (başka satırın overlay'i açık) → gizli ve tıklanamaz. -->
    <div
      v-if="shouldShowMenuFn(member)"
      class="relative shrink-0 transition-opacity"
      :class="props.ownerActive
        ? 'opacity-100'
        : props.hoverSuppressed
          ? 'opacity-0 pointer-events-none'
          : 'opacity-0 group-hover:opacity-100'"
    >
      <button
        class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
        style="width: 20px; height: 20px; color: var(--kv-text-muted);"
        :disabled="roleLoading === member.userId"
        @click.stop="onButtonClick"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="1" fill="currentColor"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>
    </div>

    <!-- Kullanıcı işlem menüsü (⋯ veya sağ-tık ile). C61: ortak ContextMenuShell + kv-ctx__* (C60 görünümü).
         Kabuk teleport/kenar sıkıştırma/dışarı-tık/ESC/scroll kapanışını yönetir. -->
    <ContextMenuShell
      v-if="openMenuUserId === member.userId"
      :x="menuX"
      :y="menuY"
      menu-id="guild-member"
      @close="emit('closeMenu')"
    >
      <!-- Profil (kullanıcı kartını aç) -->
      <button class="kv-ctx__item" role="menuitem" @click="emit('selectMember', member.userId, menuX, menuY)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>{{ t('member.actions.profile') }}</span>
      </button>
      <!-- Mesaj Gönder (kendim değilsem) -->
      <button v-if="!isSelf" class="kv-ctx__item" role="menuitem" @click="emit('messageMember', member)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>{{ t('member.actions.sendMessage') }}</span>
      </button>
      <!-- D95: Bahset (aktif yazma kutusu varsa; kendim/engelli/salt okunurda yok) -->
      <button v-if="canMentionUser(member.userId)" class="kv-ctx__item" role="menuitem" @click="emit('mentionMember', member)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
        <span>{{ t('member.actions.mention') }}</span>
      </button>
      <!-- Kullanıcı ID kopyala (her zaman) -->
      <button class="kv-ctx__item" role="menuitem" @click="emit('copyMemberId', member.userId)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>{{ t('member.actions.copyId') }}</span>
      </button>

      <!-- Moderasyon bölümü ayracı -->
      <div v-if="hasModeration" class="kv-ctx__divider" />

      <!-- R1: Rolleri Yönet (MANAGE_ROLES) — satır içi açılan rol-seçici (kabuk tıkı yutar → menü açık kalır) -->
      <template v-if="canManageRolesFn(member)">
        <button class="kv-ctx__item" role="menuitem" @click="emit('toggleRoleSubmenu', member.userId)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span class="kv-ctx__label">{{ t('member.actions.manageRoles') }}</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            class="kv-ctx__icon transition-transform" :class="roleSubmenuUserId === member.userId ? 'rotate-90' : ''"
          >
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>

        <!-- Rol-seçici listesi (açıkken) -->
        <div
          v-if="roleSubmenuUserId === member.userId"
          class="max-h-56 overflow-y-auto"
        >
          <p
            v-if="!assignableRoles || assignableRoles.length === 0"
            class="px-3 py-2 text-[12px]"
            style="color: var(--kv-text-muted);"
          >
            {{ t('member.actions.noAssignableRoles') }}
          </p>
          <button
            v-for="role in assignableRoles"
            :key="role.id"
            class="kv-ctx__item"
            role="menuitemcheckbox"
            :aria-checked="memberHasRole(role.id)"
            :disabled="roleLoading === member.userId"
            @click="emit('toggleRole', member, role)"
          >
            <!-- Onay kutusu: atanmışsa dolu -->
            <span
              class="shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center"
              :style="memberHasRole(role.id)
                ? 'background-color: var(--kv-accent-500); border-color: var(--kv-accent-500);'
                : 'border-color: var(--kv-border-strong);'"
            >
              <svg
                v-if="memberHasRole(role.id)"
                width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff"
                stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
              >
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </span>
            <!-- Rol renk noktası -->
            <span class="shrink-0 w-2 h-2 rounded-full" :style="`background-color: ${role.color};`" />
            <span class="kv-ctx__label truncate">{{ role.name }}</span>
          </button>
        </div>
      </template>
      <!-- At (kick) -->
      <button v-if="canKickFn(member)" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="emit('openKick', member)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>{{ t('member.actions.kick') }}</span>
      </button>
      <!-- Yasakla (ban) -->
      <button v-if="canBanFn(member)" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="emit('openBan', member)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        <span>{{ t('member.actions.ban') }}</span>
      </button>
      <!-- Sahiplik devri (bugünkü gibi tehlike renginde değil) -->
      <button v-if="canTransferFn(member)" class="kv-ctx__item" role="menuitem" @click="emit('openTransfer', member)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M2 20h20"/><path d="M4 20 2 7l5 4 5-7 5 7 5-4-2 13"/></svg>
        <span>{{ t('member.actions.transferOwnership') }}</span>
      </button>
    </ContextMenuShell>
  </div>
</template>
