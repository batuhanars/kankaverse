<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import GuildSettingsModal from '@/views/app/components/GuildSettingsModal.vue'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { ChannelDto, CategoryDto } from '@/types'

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()

const showSettings = ref(false)

// Kategori + kanal yönetimi: OWNER veya ADMIN
const isAdmin = computed(() => {
  if (!authStore.user) return false
  return guildsStore.isAdminInActiveGuild(authStore.user.id)
})

// Ortam ayarları (ad, ikon, vb.): yalnız OWNER (önceki davranış korunur)
const isOwner = computed(() => {
  const guild = guildsStore.activeGuild()
  if (!guild || !authStore.user) return false
  return guild.ownerId === authStore.user.id
})

// ── Katlama state (localStorage) ──
function collapseKey(guildId: string, categoryId: string) {
  return `kv:cat-collapsed:${guildId}:${categoryId}`
}

function isCategoryCollapsed(guildId: string, categoryId: string): boolean {
  return localStorage.getItem(collapseKey(guildId, categoryId)) === '1'
}

function toggleCollapse(guildId: string, categoryId: string) {
  const key = collapseKey(guildId, categoryId)
  if (localStorage.getItem(key) === '1') {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, '1')
  }
  // Reaktiflik için sayacı tetikle
  collapseToggleTick.value++
}

// localStorage reaktif değil — toggle sonrası computed yeniden hesaplanması için tick
const collapseToggleTick = ref(0)

// ── Gruplanmış kanal listesi ──
const activeGuildId = computed(() => guildsStore.activeGuildId ?? '')

const uncategorizedChannels = computed(() => {
  void collapseToggleTick.value
  return channelsStore.channelsForGuild(activeGuildId.value)
    .filter((c) => !c.categoryId)
    .sort((a, b) => a.position - b.position)
})

const sortedCategories = computed(() => {
  return channelsStore.categoriesForGuild(activeGuildId.value)
    .slice()
    .sort((a, b) => a.position - b.position)
})

function channelsForCategory(categoryId: string): ChannelDto[] {
  return channelsStore.channelsForGuild(activeGuildId.value)
    .filter((c) => c.categoryId === categoryId)
    .sort((a, b) => a.position - b.position)
}

function categoryIsCollapsed(categoryId: string): boolean {
  void collapseToggleTick.value
  return isCategoryCollapsed(activeGuildId.value, categoryId)
}

// ── Kanal seçme ──
function selectChannel(channel: ChannelDto) {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  router.push({ name: 'channel', params: { guildId, channelId: channel.id } })
}

// ── Kanal oluştur ──
const showCreate = ref(false)
const createName = ref('')
const createAgeGated = ref(false)
const createIsPrivate = ref(false)
const createCategoryId = ref<string | null>(null)
const creating = ref(false)
const createError = ref('')

function openCreate(categoryId?: string | null) {
  createName.value = ''
  createAgeGated.value = false
  createIsPrivate.value = false
  createCategoryId.value = categoryId ?? null
  createError.value = ''
  showCreate.value = true
}

async function submitCreate() {
  const name = createName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  creating.value = true
  createError.value = ''
  try {
    await channelsStore.createChannel(guildId, {
      name,
      ageGated: createAgeGated.value,
      isPrivate: createIsPrivate.value,
      categoryId: createCategoryId.value,
    })
    showCreate.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    creating.value = false
  }
}

// ── Kanal ayarları (yeniden adlandır + yavaş mod + kategori) ──
const settingsTarget = ref<ChannelDto | null>(null)
const settingsName = ref('')
const settingsSlowMode = ref(0)
const settingsCategoryId = ref<string | null>(null)
const settingsSaving = ref(false)
const settingsError = ref('')

const SLOW_MODE_OPTIONS = [
  { label: t('channel.slowModeOff'), value: 0 },
  { label: t('channel.slowMode5s'), value: 5 },
  { label: t('channel.slowMode10s'), value: 10 },
  { label: t('channel.slowMode30s'), value: 30 },
  { label: t('channel.slowMode1m'), value: 60 },
  { label: t('channel.slowMode5m'), value: 300 },
  { label: t('channel.slowMode15m'), value: 900 },
]

function openSettings(channel: ChannelDto) {
  settingsTarget.value = channel
  settingsName.value = channel.name ?? ''
  settingsSlowMode.value = channel.slowModeSeconds ?? 0
  settingsCategoryId.value = channel.categoryId ?? null
  settingsError.value = ''
}

async function submitSettings() {
  const target = settingsTarget.value
  if (!target) return
  const name = settingsName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  settingsSaving.value = true
  settingsError.value = ''
  try {
    const payload: { name?: string; slowModeSeconds?: number; categoryId?: string | null } = {}
    if (name !== target.name) payload.name = name
    if (settingsSlowMode.value !== (target.slowModeSeconds ?? 0)) payload.slowModeSeconds = settingsSlowMode.value
    if (settingsCategoryId.value !== (target.categoryId ?? null)) payload.categoryId = settingsCategoryId.value
    if (Object.keys(payload).length > 0) {
      await channelsStore.updateChannel(target.id, guildId, payload)
    }
    settingsTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    settingsError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    settingsSaving.value = false
  }
}

// ── Kanal sil ──
const deleteTarget = ref<ChannelDto | null>(null)
const deleting = ref(false)
const deleteError = ref('')

function openDelete(channel: ChannelDto) {
  deleteTarget.value = channel
  deleteError.value = ''
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  deleting.value = true
  deleteError.value = ''
  try {
    await channelsStore.deleteChannel(target.id, guildId)
    deleteTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    deleteError.value = code === 'LAST_CHANNEL'
      ? t('channel.errors.LAST_CHANNEL')
      : (err.response?.data?.message ?? t('common.error'))
  } finally {
    deleting.value = false
  }
}

// ── Kategori oluştur ──
const showCreateCategory = ref(false)
const createCategoryName = ref('')
const creatingCategory = ref(false)
const createCategoryError = ref('')

function openCreateCategory() {
  createCategoryName.value = ''
  createCategoryError.value = ''
  showCreateCategory.value = true
}

async function submitCreateCategory() {
  const name = createCategoryName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  creatingCategory.value = true
  createCategoryError.value = ''
  try {
    await channelsStore.createCategory(guildId, name)
    showCreateCategory.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createCategoryError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    creatingCategory.value = false
  }
}

// ── Kategori yeniden adlandır ──
const renameTarget = ref<CategoryDto | null>(null)
const renameName = ref('')
const renaming = ref(false)
const renameError = ref('')

function openRenameCategory(cat: CategoryDto) {
  renameTarget.value = cat
  renameName.value = cat.name
  renameError.value = ''
}

async function submitRenameCategory() {
  const target = renameTarget.value
  if (!target) return
  const name = renameName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  renaming.value = true
  renameError.value = ''
  try {
    await channelsStore.renameCategory(target.id, guildId, name)
    renameTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    renameError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    renaming.value = false
  }
}

// ── Kategori sil ──
const deleteCategoryTarget = ref<CategoryDto | null>(null)
const deletingCategory = ref(false)
const deleteCategoryError = ref('')

function openDeleteCategory(cat: CategoryDto) {
  deleteCategoryTarget.value = cat
  deleteCategoryError.value = ''
}

async function confirmDeleteCategory() {
  const target = deleteCategoryTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  deletingCategory.value = true
  deleteCategoryError.value = ''
  try {
    await channelsStore.deleteCategory(target.id, guildId)
    deleteCategoryTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    deleteCategoryError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    deletingCategory.value = false
  }
}

// Kategori menüsü görünürlüğü
const openCategoryMenuId = ref<string | null>(null)

function toggleCategoryMenu(categoryId: string) {
  openCategoryMenuId.value = openCategoryMenuId.value === categoryId ? null : categoryId
}

function closeCategoryMenu() {
  openCategoryMenuId.value = null
}
</script>

<template>
  <!-- F: 4 köşe radius — HomeSidebar ile tutarlı -->
  <aside
    class="flex flex-col h-full shrink-0 rounded-[var(--kv-radius-lg)] overflow-hidden mt-4"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
    @click="closeCategoryMenu"
  >
    <!-- Ortam adı başlığı -->
    <div
      class="flex items-center px-4 shrink-0 border-b font-semibold text-[15px] gap-2"
      style="height: var(--kv-header-height); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
    >
      <span class="flex-1 truncate">{{ guildsStore.activeGuild()?.name ?? '' }}</span>

      <!-- Kategori oluştur — OWNER veya ADMIN -->
      <button
        v-if="isAdmin"
        class="shrink-0 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
        style="width: var(--kv-control); height: var(--kv-control); color: var(--kv-text-muted);"
        :title="t('category.createCategory')"
        @click.stop="openCreateCategory"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <line x1="17" y1="14" x2="17" y2="20"/>
          <line x1="14" y1="17" x2="20" y2="17"/>
        </svg>
      </button>

      <!-- Ayarlar dişlisi — yalnız OWNER -->
      <button
        v-if="isOwner"
        class="shrink-0 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
        style="width: var(--kv-control); height: var(--kv-control); color: var(--kv-text-muted);"
        :title="t('common.settings')"
        @click="showSettings = true"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>

    <!-- Kanal listesi -->
    <div class="flex-1 overflow-y-auto pt-4 pb-20 px-2">

      <!-- ── (1) Kategorisiz kanallar — en üstte; ADMIN için üst-seviye "+" (D/E) ── -->
      <!-- E: Sabit "METİN KANALLARI" başlığı KALDIRILDI. Yalnız üst-seviye "+" kalır (ADMIN). -->
      <div v-if="isAdmin" class="mb-1 px-2 flex items-center justify-end">
        <button
          class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
          style="width: var(--kv-control); height: var(--kv-control); color: var(--kv-text-muted);"
          :title="t('channel.addUncategorized')"
          @click.stop="openCreate(null)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <div
        v-for="channel in uncategorizedChannels"
        :key="channel.id"
        class="group relative w-full flex items-center gap-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] text-left transition-colors"
        :class="[
          channelsStore.activeChannelId === channel.id
            ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
            : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-accent-subtle)] hover:text-[var(--kv-text-primary)]',
        ]"
      >
        <button
          class="flex-1 flex items-center gap-2 min-w-0 cursor-pointer pl-2 pr-2"
          @click="selectChannel(channel)"
        >
          <!-- C: kanal türü ikonu (şimdi hep #; ileride genişletilebilir) -->
          <span style="color: var(--kv-text-muted);">#</span>
          <span
            class="truncate"
            :class="[
              channel.unreadCount > 0 && channelsStore.activeChannelId !== channel.id
                ? 'font-semibold text-[var(--kv-text-primary)]'
                : '',
            ]"
          >{{ channel.name }}</span>
          <!-- C: isPrivate kilit rozeti -->
          <span
            v-if="channel.isPrivate"
            class="shrink-0"
            :title="t('channel.privateLabel')"
            style="color: var(--kv-text-muted);"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <span
            v-if="channel.ageGated"
            class="shrink-0 text-[10px] font-bold px-1 rounded"
            style="color: var(--kv-danger); border: 1px solid var(--kv-danger); line-height: 1.4;"
          >{{ t('channel.ageGatedBadge') }}</span>
          <span
            v-if="channel.slowModeSeconds > 0"
            class="shrink-0"
            :title="t('channel.slowModeLabel')"
            style="color: var(--kv-text-muted);"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </span>
        </button>

        <span
          v-if="channel.unreadCount > 0 && channelsStore.activeChannelId !== channel.id"
          class="shrink-0 channel-unread-badge"
        >
          {{ channel.unreadCount > 99 ? '99+' : channel.unreadCount }}
        </span>

        <div
          v-if="isAdmin"
          class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2"
        >
          <button
            class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
            style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
            :title="t('channel.settingsTitle')"
            @click.stop="openSettings(channel)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
            style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
            :title="t('channel.delete')"
            @click.stop="openDelete(channel)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- ── (2) Kategoriler — position asc; E: başlıklar DB'den gelir ── -->
      <template v-for="cat in sortedCategories" :key="cat.id">
        <!-- Kategori başlığı -->
        <div class="group/cat mt-3 mb-0.5 px-1 flex items-center gap-1">
          <!-- Katla/aç butonu + ad -->
          <button
            class="flex-1 flex items-center gap-1 min-w-0 cursor-pointer"
            :aria-label="categoryIsCollapsed(cat.id) ? cat.name + ' — aç' : cat.name + ' — katla'"
            @click="toggleCollapse(activeGuildId, cat.id)"
          >
            <!-- Ok ikonu -->
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              :class="categoryIsCollapsed(cat.id) ? '' : 'rotate-90'"
              class="shrink-0 transition-transform"
              style="color: var(--kv-text-muted);"
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span
              class="text-[11px] font-semibold uppercase tracking-widest truncate"
              style="color: var(--kv-text-muted);"
            >{{ cat.name }}</span>
          </button>

          <!-- ADMIN: kategori menü butonu + kanal ekle -->
          <div v-if="isAdmin" class="shrink-0 flex items-center gap-0.5">
            <!-- Bu kategoriye kanal ekle (D: per-kategori "+", categoryId geçirir) -->
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
              style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
              :title="t('category.addChannel')"
              @click.stop="openCreate(cat.id)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>

            <!-- Üç nokta menü -->
            <div class="relative">
              <button
                class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
                style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
                :title="t('common.settings')"
                @click.stop="toggleCategoryMenu(cat.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="5" r="1" fill="currentColor"/>
                  <circle cx="12" cy="12" r="1" fill="currentColor"/>
                  <circle cx="12" cy="19" r="1" fill="currentColor"/>
                </svg>
              </button>

              <!-- Menü paneli -->
              <div
                v-if="openCategoryMenuId === cat.id"
                class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
                style="min-width: 148px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
                @click.stop
              >
                <button
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="closeCategoryMenu(); openRenameCategory(cat)"
                >
                  {{ t('category.rename') }}
                </button>
                <button
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-danger);"
                  @click="closeCategoryMenu(); openDeleteCategory(cat)"
                >
                  {{ t('category.delete') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Kategorinin kanalları (katlanmışsa gizli) -->
        <template v-if="!categoryIsCollapsed(cat.id)">
          <div
            v-for="channel in channelsForCategory(cat.id)"
            :key="channel.id"
            class="group relative w-full flex items-center gap-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] text-left transition-colors"
            :class="[
              channelsStore.activeChannelId === channel.id
                ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
                : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-accent-subtle)] hover:text-[var(--kv-text-primary)]',
            ]"
          >
            <button
              class="flex-1 flex items-center gap-2 min-w-0 cursor-pointer pl-4 pr-2"
              @click="selectChannel(channel)"
            >
              <!-- C: kanal türü ikonu -->
              <span style="color: var(--kv-text-muted);">#</span>
              <span
                class="truncate"
                :class="[
                  channel.unreadCount > 0 && channelsStore.activeChannelId !== channel.id
                    ? 'font-semibold text-[var(--kv-text-primary)]'
                    : '',
                ]"
              >{{ channel.name }}</span>
              <!-- C: isPrivate kilit rozeti -->
              <span
                v-if="channel.isPrivate"
                class="shrink-0"
                :title="t('channel.privateLabel')"
                style="color: var(--kv-text-muted);"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <span
                v-if="channel.ageGated"
                class="shrink-0 text-[10px] font-bold px-1 rounded"
                style="color: var(--kv-danger); border: 1px solid var(--kv-danger); line-height: 1.4;"
              >{{ t('channel.ageGatedBadge') }}</span>
              <span
                v-if="channel.slowModeSeconds > 0"
                class="shrink-0"
                :title="t('channel.slowModeLabel')"
                style="color: var(--kv-text-muted);"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
            </button>

            <span
              v-if="channel.unreadCount > 0 && channelsStore.activeChannelId !== channel.id"
              class="shrink-0 channel-unread-badge"
            >
              {{ channel.unreadCount > 99 ? '99+' : channel.unreadCount }}
            </span>

            <div
              v-if="isAdmin"
              class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2"
            >
              <button
                class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
                style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
                :title="t('channel.settingsTitle')"
                @click.stop="openSettings(channel)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
                style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
                :title="t('channel.delete')"
                @click.stop="openDelete(channel)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
          </div>
        </template>
      </template>

      <p
        v-if="!uncategorizedChannels.length && !sortedCategories.length"
        class="px-2 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('channel.noChannels') }}
      </p>
    </div>
  </aside>

  <!-- Ortam Ayarları Modalı -->
  <GuildSettingsModal
    v-if="showSettings && guildsStore.activeGuild()"
    :guild="guildsStore.activeGuild()!"
    @close="showSettings = false"
    @updated="showSettings = false"
  />

  <!-- Kanal oluştur modalı -->
  <KvModal
    v-if="showCreate"
    :title="t('channel.createTitle')"
    @close="showCreate = false"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitCreate">
      <KvInput
        v-model="createName"
        :label="t('channel.nameLabel')"
        :placeholder="t('channel.namePlaceholder')"
        :error="createError"
        autofocus
      />

      <!-- C: Kanal türü seçici (yalnız görsel) -->
      <div class="flex flex-col gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('channel.channelTypeLabel') }}
        </p>
        <div class="flex gap-2">
          <!-- Metin — etkin/seçili -->
          <div
            class="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-[var(--kv-radius-md)] border-2 cursor-default"
            style="border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);"
          >
            <span class="text-[18px] font-bold leading-none" style="color: var(--kv-accent-500);">#</span>
            <span class="text-[12px] font-medium" style="color: var(--kv-text-primary);">{{ t('channel.channelTypeText') }}</span>
          </div>
          <!-- Ses — devre dışı -->
          <div
            class="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-[var(--kv-radius-md)] border cursor-not-allowed opacity-50"
            style="border-color: var(--kv-border-subtle);"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            <span class="text-[12px] font-medium" style="color: var(--kv-text-muted);">{{ t('channel.channelTypeVoice') }}</span>
            <span
              class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
            >{{ t('channel.channelTypeSoon') }}</span>
          </div>
          <!-- Forum — devre dışı -->
          <div
            class="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-[var(--kv-radius-md)] border cursor-not-allowed opacity-50"
            style="border-color: var(--kv-border-subtle);"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="text-[12px] font-medium" style="color: var(--kv-text-muted);">{{ t('channel.channelTypeForum') }}</span>
            <span
              class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
            >{{ t('channel.channelTypeSoon') }}</span>
          </div>
        </div>
      </div>

      <!-- D: isPrivate toggle -->
      <div
        class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
            {{ t('channel.privateLabel') }}
          </p>
          <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('channel.privateDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :style="createIsPrivate ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
          @click="createIsPrivate = !createIsPrivate"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
            :class="createIsPrivate ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- 18+ yaş-kapılı toggle (aynen durur) -->
      <div
        class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
            {{ t('channel.ageGatedLabel') }}
          </p>
          <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('channel.ageGatedDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :style="createAgeGated ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
          @click="createAgeGated = !createAgeGated"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
            :class="createAgeGated ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- D: Kategori dropdown KALDIRILDI -->

      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="showCreate = false">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="creating" :disabled="!createName.trim()">
          {{ t('channel.createButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kanal ayarları modalı (yeniden adlandır + yavaş mod + kategori) -->
  <KvModal
    v-if="settingsTarget"
    :title="t('channel.settingsTitle')"
    @close="settingsTarget = null"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitSettings">
      <KvInput
        v-model="settingsName"
        :label="t('channel.nameLabel')"
        :placeholder="t('channel.namePlaceholder')"
        :error="settingsError"
        autofocus
      />

      <!-- Yavaş mod seçimi -->
      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('channel.slowModeLabel') }}
        </label>
        <p class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('channel.slowModeDesc') }}
        </p>
        <select
          v-model.number="settingsSlowMode"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border cursor-pointer"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
        >
          <option
            v-for="opt in SLOW_MODE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <!-- Kategori seçimi (settings modalında kategori değiştirme korunur) -->
      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('channel.categoryLabel') }}
        </label>
        <select
          v-model="settingsCategoryId"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border cursor-pointer"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
        >
          <option :value="null">{{ t('channel.categoryNone') }}</option>
          <option
            v-for="cat in sortedCategories"
            :key="cat.id"
            :value="cat.id"
          >{{ cat.name }}</option>
        </select>
      </div>

      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="settingsTarget = null">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="settingsSaving" :disabled="!settingsName.trim()">
          {{ t('channel.settingsButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kanal sil onay diyaloğu -->
  <KvModal
    v-if="deleteTarget && deleteError"
    :title="t('channel.deleteTitle')"
    @close="deleteTarget = null; deleteError = ''"
  >
    <p class="text-[14px] mb-4" style="color: var(--kv-danger);">{{ deleteError }}</p>
    <div class="flex justify-end">
      <KvButton variant="ghost" @click="deleteTarget = null; deleteError = ''">
        {{ t('common.close') }}
      </KvButton>
    </div>
  </KvModal>

  <ConfirmDialog
    v-else-if="deleteTarget"
    :title="t('channel.deleteTitle')"
    :message="t('channel.deleteConfirm', { name: deleteTarget.name ?? '' })"
    :confirm-label="t('channel.deleteButton')"
    :loading="deleting"
    @confirm="confirmDelete"
    @cancel="deleteTarget = null"
  />

  <!-- Kategori oluştur modalı -->
  <KvModal
    v-if="showCreateCategory"
    :title="t('category.createTitle')"
    @close="showCreateCategory = false"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitCreateCategory">
      <KvInput
        v-model="createCategoryName"
        :label="t('category.nameLabel')"
        :placeholder="t('category.namePlaceholder')"
        :error="createCategoryError"
        autofocus
      />
      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="showCreateCategory = false">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="creatingCategory" :disabled="!createCategoryName.trim()">
          {{ t('category.createButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kategori yeniden adlandır modalı -->
  <KvModal
    v-if="renameTarget"
    :title="t('category.renameTitle')"
    @close="renameTarget = null"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitRenameCategory">
      <KvInput
        v-model="renameName"
        :label="t('category.nameLabel')"
        :placeholder="t('category.namePlaceholder')"
        :error="renameError"
        autofocus
      />
      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="renameTarget = null">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="renaming" :disabled="!renameName.trim()">
          {{ t('category.renameButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kategori sil onay diyaloğu -->
  <ConfirmDialog
    v-if="deleteCategoryTarget"
    :title="t('category.deleteTitle')"
    :message="t('category.deleteConfirm', { name: deleteCategoryTarget.name })"
    :confirm-label="t('category.deleteButton')"
    :loading="deletingCategory"
    @confirm="confirmDeleteCategory"
    @cancel="deleteCategoryTarget = null"
  />
</template>

<style scoped>
/* Kırmızı okunmamış sayaç rozeti — kanal satırı sağında */
.channel-unread-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background-color: var(--kv-danger);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  margin-right: 6px;
  flex-shrink: 0;
}
</style>
