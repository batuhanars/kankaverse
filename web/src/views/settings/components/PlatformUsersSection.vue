<script setup lang="ts">
/**
 * PlatformUsersSection — Admin kullanıcı genel-bakış tablosu (geçici; tam yönetim paneli gelene kadar).
 * Yalnız isModerator kullanıcıya UserSettingsView admin sekmesinden erişilir; dışarıdan guard'lanır.
 * Amaç: "kayıt olan var mı, kim, ne zaman" sorusunu UI'dan görebilmek (DB'ye girmeden).
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
</script>

<template>
  <div class="flex flex-col gap-4 max-w-4xl">
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
      <!-- Başlık satırı -->
      <div
        class="hidden md:flex items-center gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
        style="color: var(--kv-text-muted); background-color: var(--kv-bg-elevated);"
      >
        <span class="flex-1 min-w-0">{{ t('admin.users.colUser') }}</span>
        <span class="w-[180px] shrink-0">{{ t('admin.users.colEmail') }}</span>
        <span class="w-[120px] shrink-0">{{ t('admin.users.colInvite') }}</span>
        <span class="w-[110px] shrink-0">{{ t('admin.users.colJoined') }}</span>
      </div>

      <!-- Satırlar -->
      <div
        v-for="u in users"
        :key="u.id"
        class="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-3"
      >
        <!-- Kullanıcı + rozetler -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
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
        <div class="w-full md:w-[180px] shrink-0 min-w-0">
          <span class="text-[12px] truncate block" :title="u.email" style="color: var(--kv-text-muted);">
            {{ u.email }}
          </span>
        </div>

        <!-- Davet kodu -->
        <div class="w-full md:w-[120px] shrink-0 min-w-0">
          <span v-if="u.invitedViaCode" class="text-[12px] font-mono truncate block" style="color: var(--kv-text-muted);">
            {{ u.invitedViaCode }}
          </span>
          <span v-else class="text-[12px]" style="color: var(--kv-text-muted);">—</span>
        </div>

        <!-- Kayıt tarihi -->
        <div class="w-full md:w-[110px] shrink-0">
          <span class="text-[12px]" style="color: var(--kv-text-muted);">{{ formatDate(u.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
