<script setup lang="ts">
/**
 * StreamAnnounceCard - C36 §4.4: Ortam ayarları > Webhook'lar sekmesinin üstünde "Yayın duyuruları" kartı
 * (MANAGE_WEBHOOKS). Kanal seçici, isteğe bağlı rol seçici, aç/kapa. Duyuru yalnız yayınlarının duyurulmasını
 * KENDİSİ açan üyeler için yapılır (çift rıza); bu kart yalnız ortam tarafını yönetir.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { streamAnnounceSchema } from '@/lib/validation/streamAnnounce'
import { streamAnnounceApi } from '@/api/integrations'
import { useChannelsStore } from '@/stores/channels'
import { useRolesStore } from '@/stores/roles'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import KvSwitch from '@/components/ui/KvSwitch.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const props = defineProps<{ guildId: string }>()

const i18n = useI18n()
const { t } = i18n
const channelsStore = useChannelsStore()
const rolesStore = useRolesStore()
const toast = useToastStore()

const loading = ref(true)
const configured = ref(false)
const saving = ref(false)
const saveError = ref('')
const removeOpen = ref(false)
const removing = ref(false)

const textChannels = computed(() =>
  channelsStore.channelsForGuild(props.guildId).filter((c) => c.type === 'GUILD_TEXT'),
)
// @everyone rolü bu ayarla seçilemez (sunucu da reddeder)
const roles = computed(() => rolesStore.rolesFor(props.guildId).filter((r) => !r.isEveryone))

const form = useForm({
  validationSchema: toTypedSchema(streamAnnounceSchema),
  initialValues: { channelId: '', mentionRoleId: null, enabled: true },
})
const [channelId, channelAttrs] = form.defineField('channelId')
const [mentionRoleId] = form.defineField('mentionRoleId')
const [enabled] = form.defineField('enabled')

function apiMessage(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } } }
  return err.response?.data?.message ?? t('common.error')
}

function fieldError(field: string): string | undefined {
  const msg = (form.errors.value as Record<string, string | undefined>)[field]
  if (!msg) return undefined
  return i18n.te(msg) ? t(msg) : msg
}

async function load() {
  loading.value = true
  try {
    rolesStore.fetchRoles(props.guildId).catch(() => {})
    const { data } = await streamAnnounceApi.get(props.guildId)
    if (data) {
      configured.value = true
      form.resetForm({
        values: { channelId: data.channelId, mentionRoleId: data.mentionRoleId, enabled: data.enabled },
      })
    }
  } catch (e: unknown) {
    saveError.value = apiMessage(e)
  } finally {
    loading.value = false
  }
}

const save = form.handleSubmit(async (values) => {
  saving.value = true
  saveError.value = ''
  try {
    await streamAnnounceApi.put(props.guildId, {
      channelId: values.channelId,
      mentionRoleId: values.mentionRoleId ?? null,
      enabled: values.enabled,
    })
    configured.value = true
    toast.success(t('streamAnnounce.saved'))
  } catch (e: unknown) {
    saveError.value = apiMessage(e)
  } finally {
    saving.value = false
  }
})

async function confirmRemove() {
  removing.value = true
  try {
    await streamAnnounceApi.remove(props.guildId)
    configured.value = false
    form.resetForm({ values: { channelId: '', mentionRoleId: null, enabled: true } })
  } catch (e: unknown) {
    toast.error(apiMessage(e))
  } finally {
    removing.value = false
    removeOpen.value = false
  }
}

const selectClass =
  'w-full px-3 py-2 text-[14px] bg-[var(--kv-bg-elevated)] text-[var(--kv-text-primary)] rounded-[var(--kv-radius-md)] border border-[var(--kv-border-strong)] outline-none focus:border-[var(--kv-accent-500)]'

onMounted(load)
</script>

<template>
  <section
    class="flex flex-col gap-3 p-4 rounded-[var(--kv-radius-md)] border max-w-xl min-w-0"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
  >
    <h3 class="text-[12px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
      {{ t('streamAnnounce.title') }}
    </h3>
    <p class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('streamAnnounce.info') }}</p>

    <p v-if="loading" class="text-[14px]" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
    <form v-else class="flex flex-col gap-3" @submit.prevent="save">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[14px]" style="color: var(--kv-text-primary);">{{ t('streamAnnounce.enabled') }}</span>
        <KvSwitch :model-value="enabled ?? true" @update:model-value="enabled = $event" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
          {{ t('streamAnnounce.channelLabel') }}
        </label>
        <select v-model="channelId" v-bind="channelAttrs" :class="selectClass">
          <option value="" disabled>{{ t('streamAnnounce.channelPlaceholder') }}</option>
          <option v-for="c in textChannels" :key="c.id" :value="c.id">#{{ c.name }}</option>
        </select>
        <p v-if="fieldError('channelId')" class="text-[12px]" style="color: var(--kv-danger);">{{ fieldError('channelId') }}</p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
          {{ t('streamAnnounce.roleLabel') }}
        </label>
        <select v-model="mentionRoleId" :class="selectClass">
          <option :value="null">{{ t('streamAnnounce.roleNone') }}</option>
          <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <p v-if="saveError" class="text-[13px]" style="color: var(--kv-danger);">{{ saveError }}</p>
      <div class="flex flex-wrap gap-2">
        <KvButton type="submit" :loading="saving">{{ t('streamAnnounce.save') }}</KvButton>
        <KvButton v-if="configured" variant="ghost" @click="removeOpen = true">
          <span style="color: var(--kv-danger);">{{ t('streamAnnounce.remove') }}</span>
        </KvButton>
      </div>
    </form>

    <ConfirmDialog
      v-if="removeOpen"
      :title="t('streamAnnounce.removeTitle')"
      :message="t('streamAnnounce.removeMessage')"
      :confirm-label="t('streamAnnounce.remove')"
      :loading="removing"
      @confirm="confirmRemove"
      @cancel="removeOpen = false"
    />
  </section>
</template>
