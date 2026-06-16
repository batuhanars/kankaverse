<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useChannelsStore } from '@/stores/channels'
import { useEventsStore } from '@/stores/events'
import { useEventDateFormat } from '@/composables/useEventDateFormat'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import type { EventDto } from '@/types'
import type { CreateEventPayload, UpdateEventPayload } from '@/api/events'

const props = defineProps<{
  guildId: string
  // Düzenleme modu: verilirse alanlar dolu açılır, submit PATCH yapar.
  event?: EventDto | null
}>()
const emit = defineEmits<{ close: []; created: [event: EventDto] }>()

const { t } = useI18n()
const channelsStore = useChannelsStore()
const eventsStore = useEventsStore()
const { formatEventDate } = useEventDateFormat()

const isEdit = computed(() => !!props.event)

// ── Adım state ──
const step = ref(1) // 1: Konum · 2: Bilgi · 3: İncele · 4: Başarı

// ── Form alanları ──
// Oluştur modunda hiçbir konum türü ön-seçili değil (kullanıcı bilinçli seçer).
const locationType = ref<'' | 'VOICE_CHANNEL' | 'EXTERNAL'>(props.event?.locationType ?? '')
const channelId = ref<string>(props.event?.channelId ?? '')
const externalLocation = ref<string>(props.event?.externalLocation ?? '')
const name = ref<string>(props.event?.name ?? '')
const description = ref<string>(props.event?.description ?? '')

// startAt → tarih + saat ayrı inputlar
function splitIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
// Oluştur modunda varsayılan başlangıç: bugün, şu anın 1 saat sonrası (geçmiş-tarih
// hatasına düşmeyen makul varsayılan; gece-yarısı taşması Date ile doğru ilerler).
function nowPlusOneHourIso(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}
const initialStart = splitIso(props.event?.startAt ?? nowPlusOneHourIso())
const startDate = ref<string>(initialStart.date)
const startTime = ref<string>(initialStart.time)
const recurrence = ref<'NONE'>('NONE') // MVP yalnız NONE etkin

// Bu guild'in ses kanalları (wizard select)
const voiceChannels = computed(() =>
  channelsStore
    .channelsForGuild(props.guildId)
    .filter((c) => c.type === 'GUILD_VOICE')
    .sort((a, b) => a.position - b.position),
)

// Ses Kanalı'nı seç + ilk sıradaki kanalı varsayılan ata (henüz seçim yoksa).
function chooseVoice() {
  locationType.value = 'VOICE_CHANNEL'
  if (!channelId.value && voiceChannels.value.length) {
    channelId.value = voiceChannels.value[0].id
  }
}

// ── Doğrulama + hata ──
const errorMsg = ref('')
const submitting = ref(false)

function startAtIso(): string | null {
  if (!startDate.value || !startTime.value) return null
  const composed = new Date(`${startDate.value}T${startTime.value}`)
  if (Number.isNaN(composed.getTime())) return null
  return composed.toISOString()
}

function validateStep1(): boolean {
  errorMsg.value = ''
  if (!locationType.value) {
    errorMsg.value = t('event.wizard.errLocationType')
    return false
  }
  if (locationType.value === 'VOICE_CHANNEL' && !channelId.value) {
    errorMsg.value = t('event.wizard.errVoiceChannel')
    return false
  }
  if (locationType.value === 'EXTERNAL' && !externalLocation.value.trim()) {
    errorMsg.value = t('event.wizard.errExternalLocation')
    return false
  }
  return true
}

function validateStep2(): boolean {
  errorMsg.value = ''
  if (!name.value.trim()) {
    errorMsg.value = t('event.wizard.errName')
    return false
  }
  const iso = startAtIso()
  if (!iso) {
    errorMsg.value = t('event.wizard.errStartRequired')
    return false
  }
  if (new Date(iso).getTime() <= Date.now()) {
    errorMsg.value = t('event.wizard.errStartPast')
    return false
  }
  return true
}

function goNext() {
  if (step.value === 1 && !validateStep1()) return
  if (step.value === 2 && !validateStep2()) return
  step.value++
}
function goBack() {
  errorMsg.value = ''
  step.value--
}

// ── Önizleme yardımcıları ──
const previewLocation = computed(() => {
  if (locationType.value === 'VOICE_CHANNEL') {
    const ch = voiceChannels.value.find((c) => c.id === channelId.value)
    return ch ? `🔊 ${ch.name ?? ''}` : ''
  }
  return `📍 ${externalLocation.value.trim()}`
})
const previewDate = computed(() => {
  const iso = startAtIso()
  return iso ? formatEventDate(iso) : ''
})

// ── Submit ──
const createdEvent = ref<EventDto | null>(null)

async function submit() {
  if (!validateStep1() || !validateStep2()) {
    // Hatalı adıma dön
    const step1Errors = [t('event.wizard.errLocationType'), t('event.wizard.errVoiceChannel'), t('event.wizard.errExternalLocation')]
    step.value = step1Errors.includes(errorMsg.value) ? 1 : 2
    return
  }
  submitting.value = true
  errorMsg.value = ''
  const iso = startAtIso()!
  // validateStep1 sonrası locationType boş olamaz — daralt.
  const locType = locationType.value as 'VOICE_CHANNEL' | 'EXTERNAL'
  try {
    if (isEdit.value && props.event) {
      const payload: UpdateEventPayload = {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        locationType: locType,
        channelId: locType === 'VOICE_CHANNEL' ? channelId.value : undefined,
        externalLocation: locType === 'EXTERNAL' ? externalLocation.value.trim() : undefined,
        startAt: iso,
        recurrence: 'NONE',
      }
      const updated = await eventsStore.updateEvent(props.event.id, payload)
      emit('created', updated)
      emit('close')
      return
    }
    const payload: CreateEventPayload = {
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      locationType: locType,
      channelId: locType === 'VOICE_CHANNEL' ? channelId.value : undefined,
      externalLocation: locType === 'EXTERNAL' ? externalLocation.value.trim() : undefined,
      startAt: iso,
      recurrence: 'NONE',
    }
    const created = await eventsStore.createEvent(props.guildId, payload)
    createdEvent.value = created
    emit('created', created)
    step.value = 4 // başarı ekranı
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    const known = ['EVENT_NOT_FOUND', 'INVALID_EVENT_CHANNEL', 'EVENT_LOCATION_REQUIRED', 'EVENT_START_IN_PAST', 'AGE_RESTRICTED', 'FORBIDDEN']
    errorMsg.value = code && known.includes(code)
      ? t(`event.errors.${code}`)
      : (err.response?.data?.message ?? t('common.error'))
  } finally {
    submitting.value = false
  }
}

// ── Paylaş bağlantısı (uygulama-içi derin link) ──
const shareLink = computed(() => {
  const id = createdEvent.value?.id ?? props.event?.id ?? ''
  return `${window.location.origin}${window.location.pathname}?event=${id}`
})
const { copy, copied } = useClipboard({ source: shareLink })

const stepperLabels = computed(() => [
  t('event.wizard.stepLocation'),
  t('event.wizard.stepInfo'),
  t('event.wizard.stepReview'),
])
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--kv-bg-overlay)]"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-lg max-h-[88vh] flex flex-col rounded-[var(--kv-radius-lg)] bg-[var(--kv-bg-sidebar)] border border-[var(--kv-border-subtle)]"
        role="dialog"
        aria-modal="true"
      >
        <!-- Başlık -->
        <div class="px-6 pt-5 pb-4 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
          <h2 class="text-[20px] font-semibold" style="color: var(--kv-text-primary);">
            {{ isEdit ? t('event.wizard.editTitle') : t('event.wizard.createTitle') }}
          </h2>

          <!-- Stepper (başarı ekranında gizli) -->
          <div v-if="step <= 3" class="flex items-center gap-2 mt-4">
            <template v-for="(label, i) in stepperLabels" :key="i">
              <div class="flex items-center gap-2">
                <span
                  class="flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-bold shrink-0"
                  :style="step >= i + 1
                    ? 'background-color: var(--kv-accent-500); color: #fff;'
                    : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);'"
                >{{ i + 1 }}</span>
                <span
                  class="text-[12px] font-medium whitespace-nowrap"
                  :style="step >= i + 1 ? 'color: var(--kv-text-primary);' : 'color: var(--kv-text-muted);'"
                >{{ label }}</span>
              </div>
              <div
                v-if="i < stepperLabels.length - 1"
                class="flex-1 h-px"
                style="background-color: var(--kv-border-subtle);"
              />
            </template>
          </div>
        </div>

        <!-- Gövde -->
        <div class="overflow-y-auto flex-1 min-h-0 px-6 py-5">
          <!-- ── Adım 1: Konum ── -->
          <div v-if="step === 1" class="flex flex-col gap-4">
            <p class="text-[15px] font-medium" style="color: var(--kv-text-primary);">
              {{ t('event.wizard.locationQuestion') }}
            </p>

            <!-- Ses Kanalı -->
            <button
              type="button"
              class="flex items-start gap-3 px-4 py-3 rounded-[var(--kv-radius-md)] text-left transition-colors cursor-pointer"
              :class="locationType === 'VOICE_CHANNEL' ? 'border-2' : 'border'"
              :style="locationType === 'VOICE_CHANNEL'
                ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);'
                : 'border-color: var(--kv-border-subtle);'"
              @click="chooseVoice"
            >
              <span class="text-[18px] leading-none mt-0.5">🔊</span>
              <span class="flex-1 min-w-0">
                <span class="block text-[14px] font-medium" style="color: var(--kv-text-primary);">{{ t('event.wizard.locationVoice') }}</span>
                <span class="block text-[12px] mt-0.5" style="color: var(--kv-text-muted);">{{ t('event.wizard.locationVoiceDesc') }}</span>
              </span>
            </button>

            <!-- Ses kanalı seçimi -->
            <div v-if="locationType === 'VOICE_CHANNEL'" class="flex flex-col gap-1.5 pl-2">
              <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
                {{ t('event.wizard.voiceChannelLabel') }}<span class="ml-0.5" style="color: var(--kv-danger);">*</span>
              </label>
              <p v-if="!voiceChannels.length" class="text-[13px]" style="color: var(--kv-text-muted);">
                {{ t('event.wizard.noVoiceChannels') }}
              </p>
              <select
                v-else
                v-model="channelId"
                class="px-3 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none"
                style="background-color: var(--kv-bg-input, var(--kv-bg-elevated)); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
              >
                <option value="" disabled>{{ t('event.wizard.voiceChannelPlaceholder') }}</option>
                <option v-for="ch in voiceChannels" :key="ch.id" :value="ch.id">{{ ch.name }}</option>
              </select>
            </div>

            <!-- Başka Bir Yer -->
            <button
              type="button"
              class="flex items-start gap-3 px-4 py-3 rounded-[var(--kv-radius-md)] text-left transition-colors cursor-pointer"
              :class="locationType === 'EXTERNAL' ? 'border-2' : 'border'"
              :style="locationType === 'EXTERNAL'
                ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);'
                : 'border-color: var(--kv-border-subtle);'"
              @click="locationType = 'EXTERNAL'"
            >
              <span class="text-[18px] leading-none mt-0.5">📍</span>
              <span class="flex-1 min-w-0">
                <span class="block text-[14px] font-medium" style="color: var(--kv-text-primary);">{{ t('event.wizard.locationExternal') }}</span>
                <span class="block text-[12px] mt-0.5" style="color: var(--kv-text-muted);">{{ t('event.wizard.locationExternalDesc') }}</span>
              </span>
            </button>

            <div v-if="locationType === 'EXTERNAL'" class="pl-2">
              <KvInput
                v-model="externalLocation"
                :label="t('event.wizard.externalLabel')"
                :placeholder="t('event.wizard.externalPlaceholder')"
                required
              />
            </div>
          </div>

          <!-- ── Adım 2: Etkinlik Bilgisi ── -->
          <div v-else-if="step === 2" class="flex flex-col gap-4">
            <KvInput
              v-model="name"
              :label="t('event.wizard.nameLabel')"
              :placeholder="t('event.wizard.namePlaceholder')"
              required
              autofocus
            />

            <div class="flex gap-3">
              <div class="flex-1 flex flex-col gap-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
                  {{ t('event.wizard.startDateLabel') }}<span class="ml-0.5" style="color: var(--kv-danger);">*</span>
                </label>
                <input
                  v-model="startDate"
                  type="date"
                  class="px-3 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none"
                  style="background-color: var(--kv-bg-input, var(--kv-bg-elevated)); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
                />
              </div>
              <div class="flex-1 flex flex-col gap-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
                  {{ t('event.wizard.startTimeLabel') }}<span class="ml-0.5" style="color: var(--kv-danger);">*</span>
                </label>
                <input
                  v-model="startTime"
                  type="time"
                  class="px-3 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none"
                  style="background-color: var(--kv-bg-input, var(--kv-bg-elevated)); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
                />
              </div>
            </div>

            <!-- Etkinlik Sıklığı (MVP: yalnız Tekrarlanmaz etkin) -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
                {{ t('event.wizard.recurrenceLabel') }}<span class="ml-0.5" style="color: var(--kv-danger);">*</span>
              </label>
              <select
                v-model="recurrence"
                class="px-3 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none"
                style="background-color: var(--kv-bg-input, var(--kv-bg-elevated)); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
              >
                <option value="NONE">{{ t('event.wizard.recurrenceNone') }}</option>
                <option value="DAILY" disabled>{{ t('event.wizard.recurrenceDaily') }} — {{ t('event.wizard.recurrenceSoon') }}</option>
                <option value="WEEKLY" disabled>{{ t('event.wizard.recurrenceWeekly') }} — {{ t('event.wizard.recurrenceSoon') }}</option>
                <option value="MONTHLY" disabled>{{ t('event.wizard.recurrenceMonthly') }} — {{ t('event.wizard.recurrenceSoon') }}</option>
              </select>
            </div>

            <!-- Açıklama (markdown) -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
                {{ t('event.wizard.descriptionLabel') }}
              </label>
              <textarea
                v-model="description"
                rows="4"
                maxlength="1000"
                :placeholder="t('event.wizard.descriptionPlaceholder')"
                class="px-3 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none resize-none placeholder:text-[var(--kv-text-muted)]"
                style="background-color: var(--kv-bg-input, var(--kv-bg-elevated)); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
              />
              <span class="text-[11px]" style="color: var(--kv-text-muted);">{{ t('event.wizard.descriptionHint') }}</span>
            </div>
          </div>

          <!-- ── Adım 3: İncele ── -->
          <div v-else-if="step === 3" class="flex flex-col gap-4">
            <p class="text-[15px] font-medium" style="color: var(--kv-text-primary);">
              {{ t('event.wizard.reviewTitle') }}
            </p>
            <div
              class="rounded-[var(--kv-radius-md)] border p-4 flex flex-col gap-2"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <p class="text-[12px] font-semibold uppercase tracking-wide" style="color: var(--kv-accent-500);">{{ previewDate }}</p>
              <p class="text-[16px] font-semibold" style="color: var(--kv-text-primary);">{{ name }}</p>
              <p class="text-[13px]" style="color: var(--kv-text-secondary);">{{ previewLocation }}</p>
              <p class="text-[12px] mt-1" style="color: var(--kv-text-muted);">{{ t('event.wizard.reviewInterested') }}</p>
            </div>
          </div>

          <!-- ── Adım 4: Başarı ── -->
          <div v-else-if="step === 4" class="flex flex-col items-center text-center gap-4 py-4">
            <div
              class="flex items-center justify-center w-14 h-14 rounded-full"
              style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 class="text-[18px] font-semibold" style="color: var(--kv-text-primary);">{{ t('event.wizard.successTitle') }}</h3>
            <p class="text-[13px] max-w-xs" style="color: var(--kv-text-muted);">{{ t('event.wizard.successBody') }}</p>
            <div
              class="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-md)] border"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <span class="flex-1 truncate text-[12px] text-left" style="color: var(--kv-text-secondary);">{{ shareLink }}</span>
              <KvButton size="sm" @click="copy(shareLink)">
                {{ copied ? t('event.wizard.successCopied') : t('event.wizard.successCopy') }}
              </KvButton>
            </div>
          </div>

          <p v-if="errorMsg && step <= 3" class="mt-3 text-[13px]" style="color: var(--kv-danger);">{{ errorMsg }}</p>
        </div>

        <!-- Alt aksiyon çubuğu -->
        <div class="px-6 py-4 shrink-0 border-t flex justify-between gap-3" style="border-color: var(--kv-border-subtle);">
          <template v-if="step === 1">
            <KvButton variant="ghost" @click="emit('close')">{{ t('event.wizard.cancel') }}</KvButton>
            <KvButton @click="goNext">{{ t('event.wizard.next') }}</KvButton>
          </template>
          <template v-else-if="step === 2">
            <KvButton variant="ghost" @click="goBack">{{ t('event.wizard.back') }}</KvButton>
            <KvButton @click="goNext">{{ t('event.wizard.next') }}</KvButton>
          </template>
          <template v-else-if="step === 3">
            <KvButton variant="ghost" @click="goBack">{{ t('event.wizard.back') }}</KvButton>
            <div class="flex gap-3">
              <KvButton variant="ghost" @click="emit('close')">{{ t('event.wizard.cancel') }}</KvButton>
              <KvButton :loading="submitting" @click="submit">
                {{ isEdit ? t('event.wizard.save') : t('event.wizard.submit') }}
              </KvButton>
            </div>
          </template>
          <template v-else>
            <span />
            <KvButton @click="emit('close')">{{ t('event.wizard.successDone') }}</KvButton>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
