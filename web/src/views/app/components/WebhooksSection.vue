<script setup lang="ts">
/**
 * WebhooksSection - C35 §5.3: Ortam ayarlari "Webhook'lar" sekmesi (MANAGE_WEBHOOKS).
 * Liste, olustur, ad/kanal degistir, token yenile (onayli), sil (onayli).
 * Adres (token icerir) YALNIZ olusturma ve yenileme cevabinda gelir; burada bir kez gosterilir,
 * sekme degisince/kapatinca bellekten silinir. Sunucu listede token dondurmez.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { webhookSchema } from '@/lib/validation/webhook'
import { webhooksApi } from '@/api/webhooks'
import { useChannelsStore } from '@/stores/channels'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvModal from '@/components/ui/KvModal.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { WebhookDto } from '@/types'

const props = defineProps<{ guildId: string }>()

const i18n = useI18n()
const { t } = i18n
const channelsStore = useChannelsStore()
const toast = useToastStore()

const webhooks = ref<WebhookDto[]>([])
const loading = ref(false)
const loadError = ref(false)

const textChannels = computed(() =>
  channelsStore.channelsForGuild(props.guildId).filter((c) => c.type === 'GUILD_TEXT'),
)
const channelName = (id: string) => textChannels.value.find((c) => c.id === id)?.name ?? '?'

// Bir kez gosterilen adres
const revealed = ref<{ name: string; url: string } | null>(null)
const revealedUrl = computed(() => revealed.value?.url ?? '')
const { copy, copied } = useClipboard({ source: revealedUrl })

function apiMessage(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } } }
  return err.response?.data?.message ?? t('common.error')
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    webhooks.value = (await webhooksApi.list(props.guildId)).data
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function fieldError(errors: Record<string, string | undefined>, field: string): string | undefined {
  const msg = errors[field]
  if (!msg) return undefined
  return i18n.te(msg) ? t(msg) : msg
}

// ── Olustur (vee-validate + zod) ──────────────────────────────────────────
const creating = ref(false)
const createError = ref('')
const createForm = useForm({ validationSchema: toTypedSchema(webhookSchema) })
const [newName, newNameAttrs] = createForm.defineField('name')
const [newChannelId, newChannelAttrs] = createForm.defineField('channelId')

const create = createForm.handleSubmit(async (values) => {
  creating.value = true
  createError.value = ''
  try {
    const { data } = await webhooksApi.create(props.guildId, {
      channelId: values.channelId,
      name: values.name,
    })
    revealed.value = { name: data.name, url: data.url ?? '' }
    createForm.resetForm()
    await load()
  } catch (e: unknown) {
    createError.value = apiMessage(e)
  } finally {
    creating.value = false
  }
})

// ── Ad / kanal degistir ───────────────────────────────────────────────────
const editing = ref<WebhookDto | null>(null)
const editForm = useForm({ validationSchema: toTypedSchema(webhookSchema) })
const [editName, editNameAttrs] = editForm.defineField('name')
const [editChannelId, editChannelAttrs] = editForm.defineField('channelId')
const saving = ref(false)
const editError = ref('')

function startEdit(w: WebhookDto) {
  editing.value = w
  editForm.resetForm({ values: { name: w.name, channelId: w.channelId } })
  editError.value = ''
}

const saveEdit = editForm.handleSubmit(async (values) => {
  if (!editing.value) return
  saving.value = true
  editError.value = ''
  try {
    await webhooksApi.update(props.guildId, editing.value.id, values)
    editing.value = null
    toast.success(t('webhooks.saved'))
    await load()
  } catch (e: unknown) {
    editError.value = apiMessage(e)
  } finally {
    saving.value = false
  }
})

// ── Token yenile / sil (onayli) ───────────────────────────────────────────
const resetTarget = ref<WebhookDto | null>(null)
const deleteTarget = ref<WebhookDto | null>(null)
const busy = ref(false)

async function confirmReset() {
  if (!resetTarget.value) return
  busy.value = true
  try {
    const { data } = await webhooksApi.resetToken(props.guildId, resetTarget.value.id)
    revealed.value = { name: data.name, url: data.url ?? '' }
    await load()
  } catch (e: unknown) {
    toast.error(apiMessage(e))
  } finally {
    busy.value = false
    resetTarget.value = null
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  busy.value = true
  try {
    await webhooksApi.remove(props.guildId, deleteTarget.value.id)
    await load()
  } catch (e: unknown) {
    toast.error(apiMessage(e))
  } finally {
    busy.value = false
    deleteTarget.value = null
  }
}

function formatLastUsed(iso: string | null): string {
  if (!iso) return t('webhooks.neverUsed')
  const d = new Date(iso)
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  return t('webhooks.lastUsed', { when: `${date} ${time}` })
}

const selectClass =
  'w-full px-3 py-2 text-[14px] bg-[var(--kv-bg-elevated)] text-[var(--kv-text-primary)] rounded-[var(--kv-radius-md)] border border-[var(--kv-border-strong)] outline-none focus:border-[var(--kv-accent-500)]'

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6 max-w-xl">
    <section class="flex flex-col gap-2">
      <p class="text-[14px]" style="color: var(--kv-text-secondary);">{{ t('webhooks.intro') }}</p>
      <details class="text-[13px]" style="color: var(--kv-text-muted);">
        <summary class="cursor-pointer select-none" style="color: var(--kv-text-secondary);">
          {{ t('webhooks.howToTitle') }}
        </summary>
        <p class="mt-2">{{ t('webhooks.howTo') }}</p>
      </details>
    </section>

    <!-- Bir kez gosterilen adres -->
    <section
      v-if="revealed"
      class="flex flex-col gap-2 p-4 rounded-[var(--kv-radius-md)] border"
      style="background-color: var(--kv-bg-elevated); border-color: var(--kv-accent-500);"
    >
      <p class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
        {{ t('webhooks.revealTitle', { name: revealed.name }) }}
      </p>
      <p class="text-[13px]" style="color: var(--kv-danger);">{{ t('webhooks.revealWarning') }}</p>
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          :value="revealed.url"
          readonly
          class="flex-1 min-w-0 px-3 py-2 text-[13px] font-mono rounded-[var(--kv-radius-md)] border outline-none"
          style="background-color: var(--kv-bg-sidebar); color: var(--kv-text-primary); border-color: var(--kv-border-strong);"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <KvButton size="sm" @click="copy()">{{ copied ? t('webhooks.copied') : t('webhooks.copy') }}</KvButton>
      </div>
      <KvButton variant="ghost" size="sm" class="self-start" @click="revealed = null">
        {{ t('webhooks.hideUrl') }}
      </KvButton>
    </section>

    <!-- Olustur -->
    <section class="flex flex-col gap-3">
      <h3 class="text-[12px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('webhooks.createTitle') }}
      </h3>
      <form class="flex flex-col gap-3" @submit.prevent="create">
        <KvInput
          v-model="newName"
          v-bind="newNameAttrs"
          :label="t('webhooks.nameLabel')"
          :placeholder="t('webhooks.namePlaceholder')"
          :error="fieldError(createForm.errors.value, 'name')"
          :required="true"
        />
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
            {{ t('webhooks.channelLabel') }}
          </label>
          <select v-model="newChannelId" v-bind="newChannelAttrs" :class="selectClass">
            <option :value="undefined" disabled>{{ t('webhooks.channelPlaceholder') }}</option>
            <option v-for="c in textChannels" :key="c.id" :value="c.id">#{{ c.name }}</option>
          </select>
          <p v-if="fieldError(createForm.errors.value, 'channelId')" class="text-[12px]" style="color: var(--kv-danger);">
            {{ fieldError(createForm.errors.value, 'channelId') }}
          </p>
        </div>
        <p v-if="createError" class="text-[13px]" style="color: var(--kv-danger);">{{ createError }}</p>
        <KvButton type="submit" class="self-start" :loading="creating">
          {{ t('webhooks.createButton') }}
        </KvButton>
      </form>
    </section>

    <!-- Liste -->
    <section class="flex flex-col gap-2">
      <h3 class="text-[12px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('webhooks.listTitle') }}
      </h3>
      <p v-if="loading" class="text-[14px]" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
      <p v-else-if="loadError" class="text-[14px]" style="color: var(--kv-danger);">
        {{ t('common.error') }}
        <button type="button" class="underline cursor-pointer" @click="load">{{ t('common.retry') }}</button>
      </p>
      <p v-else-if="webhooks.length === 0" class="text-[14px]" style="color: var(--kv-text-muted);">
        {{ t('webhooks.empty') }}
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="w in webhooks"
          :key="w.id"
          class="flex flex-col gap-2 p-3 rounded-[var(--kv-radius-md)] border min-w-0"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span class="text-[15px] font-semibold break-words min-w-0" style="color: var(--kv-text-primary);">{{ w.name }}</span>
            <span
              v-if="w.disabled"
              class="px-1.5 rounded-[var(--kv-radius-sm)] text-[10px] font-bold uppercase leading-4"
              style="background-color: var(--kv-danger); color: #fff;"
            >{{ t('webhooks.disabled') }}</span>
          </div>
          <p class="text-[12px] break-words" style="color: var(--kv-text-muted);">
            #{{ channelName(w.channelId) }} · {{ t('webhooks.createdBy', { name: w.createdBy.username }) }} · {{ formatLastUsed(w.lastUsedAt) }}
          </p>
          <p v-if="w.disabled" class="text-[12px]" style="color: var(--kv-danger);">{{ t('webhooks.disabledHint') }}</p>
          <div class="flex flex-wrap gap-2">
            <KvButton variant="ghost" size="sm" @click="startEdit(w)">{{ t('webhooks.edit') }}</KvButton>
            <KvButton variant="ghost" size="sm" @click="resetTarget = w">{{ t('webhooks.resetToken') }}</KvButton>
            <KvButton variant="ghost" size="sm" @click="deleteTarget = w">
              <span style="color: var(--kv-danger);">{{ t('webhooks.delete') }}</span>
            </KvButton>
          </div>
        </li>
      </ul>
    </section>

    <KvModal v-if="editing" :title="t('webhooks.editTitle')" @close="editing = null">
      <form class="flex flex-col gap-4" @submit.prevent="saveEdit">
        <KvInput
          v-model="editName"
          v-bind="editNameAttrs"
          :label="t('webhooks.nameLabel')"
          :error="fieldError(editForm.errors.value, 'name')"
          :required="true"
        />
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
            {{ t('webhooks.channelLabel') }}
          </label>
          <select v-model="editChannelId" v-bind="editChannelAttrs" :class="selectClass">
            <option v-for="c in textChannels" :key="c.id" :value="c.id">#{{ c.name }}</option>
          </select>
        </div>
        <p v-if="editError" class="text-[13px]" style="color: var(--kv-danger);">{{ editError }}</p>
        <div class="flex gap-3 justify-end">
          <KvButton variant="ghost" @click="editing = null">{{ t('common.cancel') }}</KvButton>
          <KvButton type="submit" :loading="saving">{{ t('common.save') }}</KvButton>
        </div>
      </form>
    </KvModal>

    <ConfirmDialog
      v-if="resetTarget"
      :title="t('webhooks.resetTitle')"
      :message="t('webhooks.resetMessage', { name: resetTarget.name })"
      :confirm-label="t('webhooks.resetToken')"
      :loading="busy"
      @confirm="confirmReset"
      @cancel="resetTarget = null"
    />
    <ConfirmDialog
      v-if="deleteTarget"
      :title="t('webhooks.deleteTitle')"
      :message="t('webhooks.deleteMessage', { name: deleteTarget.name })"
      :confirm-label="t('webhooks.delete')"
      :loading="busy"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
