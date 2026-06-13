<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { invitesApi } from '@/api/invites'
import KvModal from '@/components/ui/KvModal.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import type { InvitePreviewDto } from '@/types'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()

const inviteCode = ref('')
const error = ref('')
const loading = ref(false)
const preview = ref<InvitePreviewDto | null>(null)
let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(inviteCode, (val) => {
  preview.value = null
  error.value = ''
  if (previewTimer) clearTimeout(previewTimer)
  const code = val.trim()
  if (!code) return
  previewTimer = setTimeout(async () => {
    try {
      const res = await invitesApi.preview(code)
      preview.value = res.data
    } catch {
      preview.value = null
    }
  }, 500)
})

async function submit() {
  const code = inviteCode.value.trim()
  if (!code) return
  loading.value = true
  error.value = ''
  try {
    const guild = await guildsStore.joinByInvite(code)
    guildsStore.setActiveGuild(guild.id)
    await channelsStore.fetchChannels(guild.id)
    const channels = channelsStore.channelsForGuild(guild.id)
    if (channels.length) channelsStore.setActiveChannel(channels[0].id)
    emit('close')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const code = err.response?.data?.error
    error.value =
      (code && t(`invite.errors.${code}`, '')) || err.response?.data?.message || t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <KvModal :title="t('guild.joinTitle')" @close="emit('close')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <KvInput
        v-model="inviteCode"
        :label="t('invite.codeLabel')"
        :placeholder="t('invite.codePlaceholder')"
        :error="error"
        :required="true"
      />

      <!-- Önizleme -->
      <div
        v-if="preview"
        class="flex items-center gap-3 px-3 py-2.5 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium truncate" style="color: var(--kv-text-primary);">
            {{ preview.guildName }}
          </p>
          <p v-if="!preview.valid" class="text-[12px]" style="color: var(--kv-danger);">
            {{ t('invite.errors.INVITE_INVALID') }}
          </p>
        </div>
        <span
          v-if="preview.adultsOnly"
          class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-[var(--kv-radius-sm)]"
          style="background-color: var(--kv-danger); color: #fff;"
        >
          {{ t('invite.adultsOnlyBadge') }}
        </span>
      </div>

      <div class="flex gap-3 justify-end">
        <KvButton variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="loading">{{ t('guild.joinButton') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
