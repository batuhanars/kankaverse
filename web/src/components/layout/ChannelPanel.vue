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
import type { ChannelDto } from '@/types'

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()

const showSettings = ref(false)

const isOwner = computed(() => {
  const guild = guildsStore.activeGuild()
  if (!guild || !authStore.user) return false
  return guild.ownerId === authStore.user.id
})

function selectChannel(channel: ChannelDto) {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  // AppView'daki syncFromRoute join/leave socket işlemlerini yapar
  router.push({ name: 'channel', params: { guildId, channelId: channel.id } })
}

// ── Kanal oluştur ──
const showCreate = ref(false)
const createName = ref('')
const createAgeGated = ref(false)
const creating = ref(false)
const createError = ref('')

function openCreate() {
  createName.value = ''
  createAgeGated.value = false
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
    await channelsStore.createChannel(guildId, { name, ageGated: createAgeGated.value })
    showCreate.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    creating.value = false
  }
}

// ── Kanal yeniden adlandır ──
const renameTarget = ref<ChannelDto | null>(null)
const renameName = ref('')
const renaming = ref(false)
const renameError = ref('')

function openRename(channel: ChannelDto) {
  renameTarget.value = channel
  renameName.value = channel.name ?? ''
  renameError.value = ''
}

async function submitRename() {
  const target = renameTarget.value
  if (!target) return
  const name = renameName.value.trim()
  if (!name || name === target.name) {
    renameTarget.value = null
    return
  }
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  renaming.value = true
  renameError.value = ''
  try {
    await channelsStore.updateChannel(target.id, guildId, { name })
    renameTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    renameError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    renaming.value = false
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
    // Hata varsa diyaloğu kapatma — kullanıcı mesajı görsün
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <aside
    class="flex flex-col h-full shrink-0 rounded-r-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 264px; background-color: var(--kv-bg-sidebar);"
  >
    <!-- Ortam adı başlığı: 64px -->
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b font-semibold text-[15px] gap-2"
      style="border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
    >
      <span class="flex-1 truncate">{{ guildsStore.activeGuild()?.name ?? '' }}</span>

      <!-- Ayarlar dişlisi — yalnız OWNER -->
      <button
        v-if="isOwner"
        class="shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
        style="color: var(--kv-text-muted);"
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
      <!-- Başlık satırı: "METİN KANALLARI" + "+" butonu (OWNER) -->
      <div class="mb-1 px-2 flex items-center justify-between">
        <span
          class="text-[11px] font-semibold uppercase tracking-widest"
          style="color: var(--kv-text-muted);"
        >
          {{ t('channel.textChannels') }}
        </span>
        <button
          v-if="isOwner"
          class="w-5 h-5 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-text-muted);"
          :title="t('channel.createTitle')"
          @click="openCreate"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <!-- Kanal satırları -->
      <div
        v-for="channel in channelsStore.channelsForGuild(guildsStore.activeGuildId ?? '')"
        :key="channel.id"
        class="group relative w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] text-left transition-colors"
        :class="[
          channelsStore.activeChannelId === channel.id
            ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
            : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-accent-subtle)] hover:text-[var(--kv-text-primary)]',
        ]"
      >
        <!-- Kanal adına tıklama -->
        <button
          class="flex-1 flex items-center gap-2 min-w-0 cursor-pointer"
          @click="selectChannel(channel)"
        >
          <span style="color: var(--kv-text-muted);">#</span>
          <span class="truncate">{{ channel.name }}</span>
          <!-- 18+ rozet -->
          <span
            v-if="channel.ageGated"
            class="shrink-0 text-[10px] font-bold px-1 rounded"
            style="color: var(--kv-danger); border: 1px solid var(--kv-danger); line-height: 1.4;"
          >
            {{ t('channel.ageGatedBadge') }}
          </span>
        </button>

        <!-- OWNER: yönetim ikonları (hover'da görünür) -->
        <div
          v-if="isOwner"
          class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <!-- Yeniden adlandır -->
          <button
            class="w-5 h-5 flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
            style="color: var(--kv-text-muted);"
            :title="t('channel.rename')"
            @click.stop="openRename(channel)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <!-- Sil -->
          <button
            class="w-5 h-5 flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
            style="color: var(--kv-text-muted);"
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

      <p
        v-if="!channelsStore.channelsForGuild(guildsStore.activeGuildId ?? '').length"
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

      <!-- 18+ yaş-kapılı toggle -->
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

  <!-- Kanal yeniden adlandır modalı -->
  <KvModal
    v-if="renameTarget"
    :title="t('channel.renameTitle')"
    @close="renameTarget = null"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitRename">
      <KvInput
        v-model="renameName"
        :label="t('channel.nameLabel')"
        :placeholder="t('channel.namePlaceholder')"
        :error="renameError"
        autofocus
      />
      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="renameTarget = null">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="renaming" :disabled="!renameName.trim() || renameName.trim() === renameTarget.name">
          {{ t('channel.renameButton') }}
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
</template>
