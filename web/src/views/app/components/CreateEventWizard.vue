<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useChannelsStore } from '@/stores/channels'
import { useEventsStore } from '@/stores/events'
import { useEventDateFormat } from '@/composables/useEventDateFormat'
import { attachmentsApi } from '@/api/attachments'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import type { EventDto, EventRecurrence } from '@/types'
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
// Motor fazı: 4 sıklık etkin (backend computed occurrence ile çözer).
const recurrence = ref<EventRecurrence>(props.event?.recurrence ?? 'NONE')

// ── Kapak görseli (Sprint V3 §5) ──
// Mevcut attachment akışını tekrar kullan (presign + uploadToS3, AttachmentComposeModal deseni).
// coverImageId semantiği submit'te: undefined → değişmez · null → kaldır · string → yeni kapak.
const fileInputEl = ref<HTMLInputElement | null>(null)
// Yeni seçilen kapağın attachment id'si (presign sonrası). Boş = bu oturumda yeni seçim yapılmadı.
const coverImageId = ref<string>('')
// Edit modunda mevcut kapak kaldırıldı mı? (null gönderilmesi gerekir)
const coverRemoved = ref(false)
const coverUploading = ref(false)
const coverProgress = ref(0)
const coverError = ref('')
// Yükleme kapalıysa (presign UPLOADS_DISABLED 403) alanı gizle — mesaj composer'ın reaktif
// gating deseniyle aynı sinyal: ayrı feature-flag store yok, presign 403'ü otorite.
const coverUploadsDisabled = ref(false)
// Yeni seçilen dosyanın anlık önizlemesi (createObjectURL).
const coverObjectUrl = ref<string | null>(null)
// Edit modunda backend'den gelen mevcut kapak URL'i (yeni seçim/kaldırma yoksa gösterilir).
const existingCoverUrl = props.event?.coverImageUrl ?? null

// Gösterilecek önizleme: yeni seçim varsa onu, yoksa (kaldırılmadıysa) mevcut kapağı.
const coverPreviewUrl = computed(() => {
  if (coverObjectUrl.value) return coverObjectUrl.value
  if (!coverRemoved.value && existingCoverUrl) return existingCoverUrl
  return null
})

onUnmounted(() => {
  if (coverObjectUrl.value) URL.revokeObjectURL(coverObjectUrl.value)
})

function openCoverPicker() {
  if (coverUploading.value) return
  fileInputEl.value?.click()
}

async function onCoverSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // aynı dosyayı tekrar seçmeye izin ver
  if (!file) return

  coverError.value = ''
  // Eski object URL'i temizle
  if (coverObjectUrl.value) {
    URL.revokeObjectURL(coverObjectUrl.value)
    coverObjectUrl.value = null
  }
  coverObjectUrl.value = URL.createObjectURL(file)
  coverRemoved.value = false
  coverUploading.value = true
  coverProgress.value = 0

  try {
    const { data: presigned } = await attachmentsApi.presign({
      filename: file.name,
      contentType: file.type,
      size: file.size,
    })
    await attachmentsApi.uploadToS3(presigned.uploadUrl, file, (pct) => {
      coverProgress.value = pct
    })
    coverImageId.value = presigned.attachmentId
    coverUploading.value = false
  } catch (err: unknown) {
    const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error
    // Yükleme kapalıysa alanı tamamen gizle (composer gating deseni).
    if (code === 'UPLOADS_DISABLED') {
      coverUploadsDisabled.value = true
    }
    coverImageId.value = ''
    coverUploading.value = false
    if (coverObjectUrl.value) {
      URL.revokeObjectURL(coverObjectUrl.value)
      coverObjectUrl.value = null
    }
    const known = ['UNSUPPORTED_TYPE', 'FILE_TOO_LARGE', 'UPLOADS_DISABLED', 'INVALID_COVER_IMAGE', 'INVALID_COVER_TYPE']
    coverError.value = code && known.includes(code)
      ? t(`event.wizard.coverErrors.${code}`)
      : t('event.wizard.coverErrors.default')
  }
}

function removeCover() {
  if (coverObjectUrl.value) {
    URL.revokeObjectURL(coverObjectUrl.value)
    coverObjectUrl.value = null
  }
  coverImageId.value = ''
  coverError.value = ''
  // Edit modunda mevcut kapağı kaldır → submit'te null gönderilir.
  coverRemoved.value = true
}

// Submit'e eklenecek coverImageId değeri: undefined (gönderme) | null (kaldır) | string (yeni).
function resolveCoverPayload(): string | null | undefined {
  if (coverImageId.value) return coverImageId.value // yeni yüklendi
  if (coverRemoved.value) return null // mevcut kapak kaldırıldı
  return undefined // değişmez (yeni seçim yok)
}

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
// Tekrar etiketi anahtarı (event.recurrence.daily/weekly/monthly).
const recurrenceKey = computed(() => recurrence.value.toLowerCase())

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
  const cover = resolveCoverPayload()
  try {
    if (isEdit.value && props.event) {
      const payload: UpdateEventPayload = {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        locationType: locType,
        channelId: locType === 'VOICE_CHANNEL' ? channelId.value : undefined,
        externalLocation: locType === 'EXTERNAL' ? externalLocation.value.trim() : undefined,
        startAt: iso,
        recurrence: recurrence.value,
      }
      // undefined → kapağa dokunma; null → kaldır; string → yeni kapak.
      if (cover !== undefined) payload.coverImageId = cover
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
      recurrence: recurrence.value,
    }
    // Create: yalnız yeni kapak yüklendiyse gönder (string). undefined/null → alan yok.
    if (cover) payload.coverImageId = cover
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
                <option value="DAILY">{{ t('event.wizard.recurrenceDaily') }}</option>
                <option value="WEEKLY">{{ t('event.wizard.recurrenceWeekly') }}</option>
                <option value="MONTHLY">{{ t('event.wizard.recurrenceMonthly') }}</option>
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

            <!-- Kapak Görseli (Sprint V3 §5) — UPLOADS_DISABLED'da gizlenir -->
            <div v-if="!coverUploadsDisabled" class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
                {{ t('event.wizard.coverLabel') }}
              </label>

              <!-- Gizli dosya input -->
              <input
                ref="fileInputEl"
                type="file"
                class="hidden"
                accept="image/*"
                @change="onCoverSelected"
              />

              <!-- Önizleme varsa: görsel + kaldır -->
              <div
                v-if="coverPreviewUrl"
                class="relative w-full rounded-[var(--kv-radius-md)] overflow-hidden border"
                style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
              >
                <img
                  :src="coverPreviewUrl"
                  :alt="t('event.wizard.coverLabel')"
                  class="w-full object-cover"
                  style="height: 140px;"
                />
                <!-- Yükleme ilerleme örtüsü -->
                <div
                  v-if="coverUploading"
                  class="absolute inset-0 flex flex-col items-center justify-center gap-2"
                  style="background-color: var(--kv-bg-overlay);"
                >
                  <div class="w-3/4 h-1 rounded-full overflow-hidden" style="background-color: var(--kv-bg-elevated);">
                    <div
                      class="h-full rounded-full transition-all duration-200"
                      style="background-color: var(--kv-accent-500);"
                      :style="{ width: `${coverProgress}%` }"
                    />
                  </div>
                  <span class="text-[12px]" style="color: var(--kv-text-primary);">{{ t('event.wizard.coverUploading') }}</span>
                </div>
                <!-- Kaldır butonu (yükleme bitince) -->
                <button
                  v-else
                  type="button"
                  class="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full cursor-pointer"
                  style="background-color: var(--kv-bg-sidebar); color: var(--kv-text-secondary);"
                  :aria-label="t('event.wizard.coverRemove')"
                  :title="t('event.wizard.coverRemove')"
                  @click="removeCover"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <!-- Önizleme yoksa: seç butonu -->
              <button
                v-else
                type="button"
                class="flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--kv-radius-md)] border border-dashed cursor-pointer transition-colors"
                style="border-color: var(--kv-border-subtle); color: var(--kv-text-secondary); background-color: var(--kv-bg-elevated);"
                @click="openCoverPicker"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span class="text-[13px] font-medium">{{ t('event.wizard.coverUpload') }}</span>
              </button>

              <p v-if="coverError" class="text-[12px]" style="color: var(--kv-danger);">{{ coverError }}</p>
            </div>
          </div>

          <!-- ── Adım 3: İncele ── -->
          <div v-else-if="step === 3" class="flex flex-col gap-4">
            <p class="text-[15px] font-medium" style="color: var(--kv-text-primary);">
              {{ t('event.wizard.reviewTitle') }}
            </p>
            <div
              class="rounded-[var(--kv-radius-md)] border overflow-hidden flex flex-col"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <!-- Kapak banner (varsa) -->
              <img
                v-if="coverPreviewUrl"
                :src="coverPreviewUrl"
                :alt="t('event.wizard.coverLabel')"
                class="w-full object-cover"
                style="height: 120px;"
              />
              <div class="p-4 flex flex-col gap-2">
              <p class="text-[12px] font-semibold uppercase tracking-wide" style="color: var(--kv-accent-500);">{{ previewDate }}</p>
              <p class="text-[16px] font-semibold" style="color: var(--kv-text-primary);">{{ name }}</p>
              <p class="text-[13px]" style="color: var(--kv-text-secondary);">{{ previewLocation }}</p>
              <p
                v-if="recurrence !== 'NONE'"
                class="text-[12px]"
                style="color: var(--kv-text-secondary);"
              >🔁 {{ t(`event.recurrence.${recurrenceKey}`) }}</p>
              <p class="text-[12px] mt-1" style="color: var(--kv-text-muted);">{{ t('event.wizard.reviewInterested') }}</p>
              </div>
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
            <KvButton :disabled="coverUploading" @click="goNext">{{ t('event.wizard.next') }}</KvButton>
          </template>
          <template v-else-if="step === 3">
            <KvButton variant="ghost" @click="goBack">{{ t('event.wizard.back') }}</KvButton>
            <div class="flex gap-3">
              <KvButton variant="ghost" @click="emit('close')">{{ t('event.wizard.cancel') }}</KvButton>
              <KvButton :loading="submitting" :disabled="coverUploading" @click="submit">
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
