<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import ModerationQueue from '@/components/moderation/ModerationQueue.vue'

// Sprint 4B — moderasyon sayfası. Kuyruk `ModerationQueue`da (Ayarlar > Admin > Moderasyon ile ortak).
const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

onMounted(() => {
  // isModerator kontrolü (asıl kapı sunucuda: ModeratorGuard)
  if (!authStore.user?.isModerator) void router.replace({ name: 'app' })
})
</script>

<template>
  <div class="min-h-screen p-6" style="background-color: var(--kv-bg-content); color: var(--kv-text-primary);">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-[22px] font-semibold">{{ t('moderation.title') }}</h1>
        <button
          class="text-[13px] cursor-pointer hover:underline"
          style="color: var(--kv-text-muted);"
          @click="router.push({ name: 'app' })"
        >
          {{ t('moderation.backToApp') }}
        </button>
      </div>
      <ModerationQueue v-if="authStore.user?.isModerator" />
    </div>
  </div>
</template>
