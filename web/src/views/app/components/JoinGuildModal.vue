<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import KvModal from '@/components/ui/KvModal.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()

const guildId = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (!guildId.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const guild = await guildsStore.joinGuild(guildId.value.trim())
    guildsStore.setActiveGuild(guild.id)
    await channelsStore.fetchChannels(guild.id)
    const channels = channelsStore.channelsForGuild(guild.id)
    if (channels.length) channelsStore.setActiveChannel(channels[0].id)
    emit('close')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const code = err.response?.data?.error
    error.value =
      (code && t(`guild.errors.${code}`, '')) || err.response?.data?.message || t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <KvModal :title="t('guild.joinTitle')" @close="emit('close')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <KvInput
        v-model="guildId"
        :label="t('guild.idLabel')"
        :placeholder="t('guild.idPlaceholder')"
        :error="error"
        :required="true"
      />
      <div class="flex gap-3 justify-end">
        <KvButton variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="loading">{{ t('guild.joinButton') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
