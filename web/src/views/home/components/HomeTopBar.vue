<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import GlobalSearch from '@/components/shared/GlobalSearch.vue'
import { useNotificationsStore } from '@/stores/notifications'

const emit = defineEmits<{ selectDm: [channelId: string] }>()
const { t } = useI18n()

const notificationsStore = useNotificationsStore()

const showSearch = ref(false)
const showNotifications = ref(false)
const bellRef = ref<HTMLElement | null>(null)

onClickOutside(bellRef, () => { showNotifications.value = false })

function onSelectDm(channelId: string) {
  showSearch.value = false
  emit('selectDm', channelId)
}

function openNotifications() {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    notificationsStore.markAllRead()
  }
}
</script>

<template>
  <div class="h-16 shrink-0 flex items-center">
    <!-- Rail spacer (aligns search with sidebar area) -->

    <!-- Search pill — flex-1, centered -->
    <div class="flex-1 flex items-center px-6">
      <button
        class="flex items-center gap-2.5 h-9 px-4 rounded-full text-[13px] cursor-pointer w-full transition-all"
        style="max-width: 440px; background-color: var(--kv-bg-elevated); color: var(--kv-text-muted); border: 1px solid var(--kv-border-subtle);"
        @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-strong)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-subtle)'"
        @click="showSearch = true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="flex-1 text-left truncate">{{ t('search.topbarPlaceholder') }}</span>
        <kbd
          class="hidden sm:block text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0"
          style="background-color: var(--kv-bg-content); color: var(--kv-text-muted);"
        >Ctrl K</kbd>
      </button>
    </div>

    <!-- Notification bell -->
    <div ref="bellRef" class="relative mr-4 shrink-0">
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
        <!-- Okunmamış rozet -->
        <span
          v-if="notificationsStore.unreadCount > 0"
          class="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white pointer-events-none"
          style="background-color: var(--kv-danger); line-height: 1;"
        >
          {{ notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount }}
        </span>
      </button>

      <!-- Bildirim paneli -->
      <div
        v-if="showNotifications"
        class="absolute top-full right-0 mt-2 w-[320px] rounded-[var(--kv-radius-lg)] overflow-hidden"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 50;"
      >
        <div class="px-4 py-3 border-b" style="border-color: var(--kv-border-subtle);">
          <p class="text-[14px] font-bold" style="color: var(--kv-text-primary);">
            {{ t('notifications.title') }}
          </p>
        </div>

        <!-- Boş durum -->
        <div v-if="!notificationsStore.items.length" class="py-10 text-center">
          <p class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('notifications.empty') }}</p>
        </div>

        <!-- Bildirim listesi -->
        <div v-else class="overflow-y-auto" style="max-height: 360px;">
          <div
            v-for="item in notificationsStore.items"
            :key="item.id"
            class="flex items-start gap-3 px-4 py-3 border-b last:border-0"
            :style="`border-color: var(--kv-border-subtle); background-color: ${item.read ? 'transparent' : 'var(--kv-accent-subtle)'};`"
          >
            <!-- Kullanıcı avatarı (varsa) -->
            <div
              v-if="item.user"
              class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[13px] font-semibold text-white overflow-hidden"
              style="background-color: var(--kv-accent-500);"
            >
              <img v-if="item.user.avatarUrl" :src="item.user.avatarUrl" :alt="item.user.username" class="w-full h-full object-cover" />
              <span v-else>{{ item.user.username[0].toUpperCase() }}</span>
            </div>
            <!-- Tip ikonu (kullanıcı yoksa) -->
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

            <p class="text-[13px] leading-snug flex-1" style="color: var(--kv-text-body);">
              {{ item.type === 'friend_request'
                  ? t('notifications.friend_request', { username: item.user?.username ?? '?' })
                  : item.type === 'friend_accept'
                    ? t('notifications.friend_accept', { username: item.user?.username ?? '?' })
                    : t('notifications.friend_remove') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Global search modal -->
  <GlobalSearch
    v-if="showSearch"
    @close="showSearch = false"
    @select-dm="onSelectDm"
  />
</template>
