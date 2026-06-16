<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { invitesApi } from '@/api/invites'
import KvButton from '@/components/ui/KvButton.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'
import type { InvitePreviewDto } from '@/types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()

const code = String(route.params.code ?? '')

const preview = ref<InvitePreviewDto | null>(null)
const previewError = ref(false)
const loadingPreview = ref(true)
const joining = ref(false)
const joinError = ref('')

function guildInitial(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}

onMounted(async () => {
  if (!code) {
    previewError.value = true
    loadingPreview.value = false
    return
  }
  try {
    const res = await invitesApi.preview(code)
    preview.value = res.data
    if (!res.data.valid) previewError.value = true
  } catch {
    previewError.value = true
  } finally {
    loadingPreview.value = false
  }
})

// JoinGuildModal.submit() ile aynı akış: store.joinByInvite → kanalları çek → ilk kanala yönlen.
// Modal in-place kapanırken bu view router ile ilk kanala (channel rotası) push eder.
async function join() {
  if (joining.value) return
  joining.value = true
  joinError.value = ''
  try {
    const guild = await guildsStore.joinByInvite(code)
    if (!channelsStore.channelsForGuild(guild.id).length) {
      await channelsStore.fetchChannelsAndCategories(guild.id, authStore.user?.id)
    }
    const channels = channelsStore.channelsForGuild(guild.id)
    if (channels.length > 0) {
      await router.replace({ name: 'channel', params: { guildId: guild.id, channelId: channels[0].id } })
    } else {
      guildsStore.setActiveGuild(guild.id)
      channelsStore.setActiveChannel(null)
      await router.replace({ name: 'app' })
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const errCode = err.response?.data?.error
    joinError.value =
      (errCode && t(`invite.errors.${errCode}`, '')) || err.response?.data?.message || t('common.error')
  } finally {
    joining.value = false
  }
}

function goHome() {
  router.replace({ name: 'app' })
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center px-4"
    style="background-color: var(--kv-bg-rail);"
  >
    <div
      class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8 text-center"
      style="background-color: var(--kv-bg-sidebar); border: 1px solid var(--kv-border-subtle); border-top: 3px solid var(--kv-accent-500);"
    >
      <img
        :src="logoDikey"
        :alt="t('brand.name')"
        class="mx-auto mb-6"
        style="width: 130px; height: auto;"
      />

      <!-- Yükleniyor -->
      <p v-if="loadingPreview" class="text-[14px]" style="color: var(--kv-text-muted);">
        {{ t('inviteAccept.loading') }}
      </p>

      <!-- Geçersiz / süresi dolmuş davet -->
      <template v-else-if="previewError">
        <h1 class="text-[18px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('inviteAccept.invalidTitle') }}
        </h1>
        <p class="text-[13px] mb-6" style="color: var(--kv-text-muted);">
          {{ t('inviteAccept.invalidDesc') }}
        </p>
        <KvButton class="w-full" @click="goHome">{{ t('inviteAccept.goHome') }}</KvButton>
      </template>

      <!-- Geçerli davet — önizleme + katıl -->
      <template v-else-if="preview">
        <p class="text-[13px] mb-4" style="color: var(--kv-text-muted);">
          {{ t('inviteAccept.youInvited') }}
        </p>

        <div
          class="mx-auto mb-3 flex items-center justify-center text-[18px] font-semibold"
          style="
            width: 64px;
            height: 64px;
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            background-color: var(--kv-bg-elevated);
            color: var(--kv-text-secondary);
          "
        >
          {{ guildInitial(preview.guildName) }}
        </div>

        <div class="flex items-center justify-center gap-2 mb-6">
          <h1 class="text-[18px] font-semibold truncate" style="color: var(--kv-text-primary);">
            {{ preview.guildName }}
          </h1>
          <span
            v-if="preview.adultsOnly"
            class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-[var(--kv-radius-sm)]"
            style="background-color: var(--kv-danger); color: #fff;"
          >
            {{ t('invite.adultsOnlyBadge') }}
          </span>
        </div>

        <p v-if="joinError" class="text-[13px] mb-4" style="color: var(--kv-danger);">
          {{ joinError }}
        </p>

        <KvButton class="w-full" :loading="joining" @click="join">
          {{ t('inviteAccept.join') }}
        </KvButton>
        <button
          class="mt-4 text-[12px] cursor-pointer"
          style="color: var(--kv-text-muted);"
          @click="goHome"
        >
          {{ t('inviteAccept.goHome') }}
        </button>
      </template>
    </div>
  </div>
</template>
