<script setup lang="ts">
/**
 * PlatformUsersSection — Admin kullanıcı genel-bakış tablosu (geçici; tam yönetim paneli gelene kadar).
 * Yalnız isModerator kullanıcıya UserSettingsView admin sekmesinden erişilir; dışarıdan guard'lanır.
 * Amaç: "kim kayıt oldu, çevrimiçi mi, ortam açmış mı, ne kadar aktif" sorularını UI'dan görmek (DB'ye girmeden).
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'
import type { AdminUserDto } from '@/api/admin'

const { t } = useI18n()

const users = ref<AdminUserDto[]>([])
const loading = ref(false)
const loadError = ref('')

async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await adminApi.listUsers()
    users.value = res.data
  } catch {
    loadError.value = t('admin.users.loadError')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadUsers()
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Çevrimiçi durumu → renk (tasarım token'larıyla; presence renkleri brief'te sabit)
function presenceColor(p: AdminUserDto['presence']): string {
  if (p === 'online') return '#3DB46E'
  if (p === 'away') return '#E8A33D'
  if (p === 'dnd') return '#F23B4B'
  return 'var(--kv-text-muted)'
}

function presenceLabel(p: AdminUserDto['presence']): string {
  return t(`admin.users.presence.${p}`)
}

// Son görülme: çevrimiçiyse "Çevrimiçi", değilse son oturum tarihi
function lastSeen(u: AdminUserDto): string {
  if (u.presence !== 'offline') return t('admin.users.presence.online')
  return u.lastActiveAt ? formatDate(u.lastActiveAt) : '—'
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h3 class="text-[13px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('admin.users.title') }}
      </h3>
      <div class="flex items-center gap-3">
        <span v-if="!loading && !loadError" class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('admin.users.count', { count: users.length }) }}
        </span>
        <button
          class="text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-accent-500);"
          :disabled="loading"
          @click="loadUsers"
        >
          {{ t('admin.users.refresh') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('common.loading') }}
    </div>
    <p v-else-if="loadError" class="text-[13px]" style="color: var(--kv-danger);">{{ loadError }}</p>
    <p v-else-if="users.length === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('admin.users.empty') }}
    </p>

    <div
      v-else
      class="rounded-[var(--kv-radius-lg)] overflow-hidden divide-y divide-[color:var(--kv-border-subtle)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <!-- Başlık satırı (yalnız masaüstü) -->
      <div
        class="hidden md:flex items-center gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
        style="color: var(--kv-text-muted); background-color: var(--kv-bg-elevated);"
      >
        <span class="flex-1 min-w-0">{{ t('admin.users.colUser') }}</span>
        <span class="w-[160px] shrink-0">{{ t('admin.users.colEmail') }}</span>
        <span class="w-[120px] shrink-0">{{ t('admin.users.colGuilds') }}</span>
        <span class="w-[70px] shrink-0 text-right">{{ t('admin.users.colMessages') }}</span>
        <span class="w-[120px] shrink-0">{{ t('admin.users.colLastSeen') }}</span>
        <span class="w-[100px] shrink-0">{{ t('admin.users.colJoined') }}</span>
      </div>

      <!-- Satırlar -->
      <div
        v-for="u in users"
        :key="u.id"
        class="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-3"
      >
        <!-- Kullanıcı: presence noktası + ad + rozetler -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span
              class="shrink-0 w-2.5 h-2.5 rounded-full"
              :style="`background-color: ${presenceColor(u.presence)};`"
              :title="presenceLabel(u.presence)"
            />
            <span class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
              {{ u.username }}
            </span>
            <span
              v-if="u.isModerator"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
              style="color: var(--kv-accent-500); background-color: var(--kv-bg-elevated);"
            >{{ t('admin.users.badgeAdmin') }}</span>
            <span
              v-if="u.isMinor"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
              style="color: var(--kv-danger); background-color: var(--kv-bg-elevated);"
            >{{ t('admin.users.badgeMinor') }}</span>
            <span
              class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
              :style="`color: ${u.emailVerified ? 'var(--kv-online, #3DB46E)' : 'var(--kv-text-muted)'}; background-color: var(--kv-bg-elevated);`"
            >{{ u.emailVerified ? t('admin.users.badgeVerified') : t('admin.users.badgeUnverified') }}</span>
          </div>
        </div>

        <!-- E-posta -->
        <div class="w-full md:w-[160px] shrink-0 min-w-0">
          <span class="text-[12px] truncate block" :title="u.email" style="color: var(--kv-text-muted);">
            {{ u.email }}
          </span>
        </div>

        <!-- Ortam: açtığı + üye olduğu -->
        <div class="w-full md:w-[120px] shrink-0 text-[12px]" style="color: var(--kv-text-muted);">
          <span :style="u.ownedGuildCount > 0 ? 'color: var(--kv-text-primary); font-weight: 600;' : ''">
            {{ t('admin.users.guildsOwned', { count: u.ownedGuildCount }) }}
          </span>
          <span class="mx-1 opacity-50">·</span>
          <span>{{ t('admin.users.guildsMember', { count: u.membershipCount }) }}</span>
        </div>

        <!-- Mesaj sayısı -->
        <div class="w-full md:w-[70px] shrink-0 md:text-right text-[12px]" style="color: var(--kv-text-muted);">
          {{ u.messageCount }}
        </div>

        <!-- Son görülme -->
        <div class="w-full md:w-[120px] shrink-0 text-[12px]">
          <span :style="u.presence !== 'offline' ? `color: ${presenceColor(u.presence)}; font-weight: 600;` : 'color: var(--kv-text-muted);'">
            {{ lastSeen(u) }}
          </span>
        </div>

        <!-- Kayıt tarihi -->
        <div class="w-full md:w-[100px] shrink-0">
          <span class="text-[12px]" style="color: var(--kv-text-muted);">{{ formatDate(u.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
