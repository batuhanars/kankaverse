<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useEventsStore } from '@/stores/events'
import { useEventDateFormat } from '@/composables/useEventDateFormat'
import { renderMessageHtml } from '@/utils/markdown'
import KvButton from '@/components/ui/KvButton.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import CreateEventWizard from '@/views/app/components/CreateEventWizard.vue'
import type { EventDto } from '@/types'

const props = defineProps<{
  guildId: string
  canManage: boolean
  // Deep-link (?event=<id>) ile açıldıysa vurgulanacak/kaydırılacak kart.
  highlightEventId?: string | null
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const eventsStore = useEventsStore()
const { formatEventDate } = useEventDateFormat()

const events = computed(() => eventsStore.eventsFor(props.guildId))

// ── Deep-link vurgusu: açılışta hedef kartı bul → kaydır + geçici vurgu ──
const highlightedId = ref<string | null>(null)
onMounted(async () => {
  const target = props.highlightEventId
  if (!target) return
  highlightedId.value = target
  await nextTick()
  document
    .querySelector(`[data-event-card="${target}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Vurguyu birkaç saniye sonra söndür (kalıcı stil bırakma).
  setTimeout(() => {
    if (highlightedId.value === target) highlightedId.value = null
  }, 2400)
})

// Açıklama markdown render: mesajlarla aynı güvenli boru hattı (markdown-it + DOMPurify).
// Etkinlikte mention yok → no-op resolver. v-html yalnız sanitize edilmiş HTML alır.
function renderDescription(desc: string): string {
  return renderMessageHtml(desc, () => undefined, '')
}

// ── Oluştur / Düzenle sihirbazı ──
const showWizard = ref(false)
const editTarget = ref<EventDto | null>(null)

function openCreate() {
  editTarget.value = null
  showWizard.value = true
}
function openEdit(ev: EventDto) {
  editTarget.value = ev
  showWizard.value = true
}
function closeWizard() {
  showWizard.value = false
  editTarget.value = null
}

// ── ⋯ menüsü ──
const openMenuId = ref<string | null>(null)
function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

// ── İlgileniyor toggle ──
async function toggle(ev: EventDto) {
  try {
    await eventsStore.toggleInterest(ev.id, props.guildId)
  } catch {
    // store geri aldı; sessiz
  }
}

// ── Paylaş ──
const shareSource = ref('')
const { copy, copied } = useClipboard({ source: shareSource })
function share(ev: EventDto) {
  shareSource.value = `${window.location.origin}${window.location.pathname}?event=${ev.id}`
  copy(shareSource.value)
}

// ── Sil ──
const deleteTarget = ref<EventDto | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleting.value = true
  try {
    await eventsStore.deleteEvent(target.id, props.guildId)
    deleteTarget.value = null
  } catch {
    // sessiz — liste güncel kalır
  } finally {
    deleting.value = false
  }
}

function locationLabel(ev: EventDto): string {
  if (ev.locationType === 'VOICE_CHANNEL') return `🔊 ${ev.channelName ?? ''}`
  return `📍 ${ev.externalLocation ?? ''}`
}

// Tekrar etiketi anahtarı (event.recurrence.daily/weekly/monthly).
function recurrenceKey(ev: EventDto): string {
  return ev.recurrence.toLowerCase()
}
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
        @click="openMenuId = null"
      >
        <!-- Başlık -->
        <div class="px-6 pt-5 pb-4 shrink-0 border-b flex items-center gap-3" style="border-color: var(--kv-border-subtle);">
          <h2 class="flex-1 text-[20px] font-semibold" style="color: var(--kv-text-primary);">
            {{ t('event.modalTitle', { count: events.length }) }}
          </h2>
          <KvButton v-if="canManage" size="sm" @click="openCreate">{{ t('event.create') }}</KvButton>
          <button
            class="flex items-center justify-center w-8 h-8 rounded-[var(--kv-radius-sm)] cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
            style="color: var(--kv-text-muted);"
            :aria-label="t('common.cancel')"
            @click="emit('close')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Liste -->
        <div class="overflow-y-auto flex-1 min-h-0 px-6 py-5 flex flex-col gap-3">
          <p v-if="!events.length" class="text-[14px] text-center py-8" style="color: var(--kv-text-muted);">
            {{ t('event.empty') }}
          </p>

          <div
            v-for="ev in events"
            :key="ev.id"
            :data-event-card="ev.id"
            class="rounded-[var(--kv-radius-md)] border p-4 flex flex-col gap-2"
            :class="highlightedId === ev.id ? 'kv-event-highlight' : ''"
            :style="highlightedId === ev.id
              ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);'
              : 'border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);'"
          >
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <!-- Tarih = ilgili örnek (occurrence), çapa startAt değil -->
                <p class="text-[12px] font-semibold uppercase tracking-wide" style="color: var(--kv-accent-500);">{{ formatEventDate(ev.occurrenceStartAt) }}</p>
                <p class="text-[16px] font-semibold mt-0.5 truncate" style="color: var(--kv-text-primary);">{{ ev.name }}</p>
                <p class="text-[13px] mt-0.5 truncate" style="color: var(--kv-text-secondary);">{{ locationLabel(ev) }}</p>

                <!-- Rozetler: şu an sürüyor (ACTIVE) + tekrar -->
                <div v-if="ev.status === 'ACTIVE' || ev.recurrence !== 'NONE'" class="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span
                    v-if="ev.status === 'ACTIVE'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style="background-color: rgba(61,180,110,0.15); color: var(--kv-online, #3DB46E);"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" style="background-color: var(--kv-online, #3DB46E);" />
                    {{ t('event.card.active') }}
                  </span>
                  <span
                    v-if="ev.recurrence !== 'NONE'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                    style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
                  >🔁 {{ t(`event.recurrence.${recurrenceKey(ev)}`) }}</span>
                </div>
              </div>

              <!-- ⋯ menü (yetkili) -->
              <div v-if="canManage" class="relative shrink-0">
                <button
                  class="flex items-center justify-center w-7 h-7 rounded-[var(--kv-radius-sm)] cursor-pointer hover:bg-[var(--kv-bg-sidebar)]"
                  style="color: var(--kv-text-muted);"
                  :aria-label="t('common.settings')"
                  @click.stop="toggleMenu(ev.id)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
                </button>
                <div
                  v-if="openMenuId === ev.id"
                  class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
                  style="min-width: 130px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
                  @click.stop
                >
                  <button
                    class="w-full text-left px-3 py-2 text-[13px] cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                    style="color: var(--kv-text-secondary);"
                    @click="openMenuId = null; openEdit(ev)"
                  >{{ t('event.edit') }}</button>
                  <button
                    class="w-full text-left px-3 py-2 text-[13px] cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                    style="color: var(--kv-danger);"
                    @click="openMenuId = null; deleteTarget = ev"
                  >{{ t('event.delete') }}</button>
                </div>
              </div>
            </div>

            <!-- Açıklama: güvenli markdown render (renderMessageHtml → DOMPurify sanitize; v-html güvenli) -->
            <div v-if="ev.description" class="kv-md text-[13px] break-words" style="color: var(--kv-text-body);" v-html="renderDescription(ev.description)" />


            <!-- Aksiyon satırı -->
            <div class="flex items-center gap-2 mt-1">
              <button
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kv-radius-sm)] text-[13px] font-medium cursor-pointer transition-colors border"
                :style="ev.interestedByMe
                  ? 'background-color: rgba(61,180,110,0.15); border-color: var(--kv-online, #3DB46E); color: var(--kv-online, #3DB46E);'
                  : 'background-color: transparent; border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
                @click="toggle(ev)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" :fill="ev.interestedByMe ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {{ t('event.interested') }}
              </button>
              <span class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('event.interestedCount', { count: ev.interestedCount }) }}</span>
              <button
                type="button"
                class="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--kv-radius-sm)] text-[13px] cursor-pointer hover:bg-[var(--kv-bg-sidebar)]"
                style="color: var(--kv-text-muted);"
                @click="share(ev)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                {{ copied && shareSource.includes(ev.id) ? t('event.shareCopied') : t('event.share') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Oluştur / Düzenle sihirbazı -->
  <CreateEventWizard
    v-if="showWizard"
    :guild-id="guildId"
    :event="editTarget"
    @close="closeWizard"
    @created="closeWizard"
  />

  <!-- Sil onayı -->
  <ConfirmDialog
    v-if="deleteTarget"
    :title="t('event.deleteTitle')"
    :message="t('event.deleteConfirm', { name: deleteTarget.name })"
    :confirm-label="t('event.deleteButton')"
    :loading="deleting"
    @confirm="confirmDelete"
    @cancel="deleteTarget = null"
  />
</template>

<style scoped>
/* Deep-link vurgusu: aksan outline + kısa nabız (ChannelPanel kanal-vurgusu deseniyle aynı; gölge yok). */
.kv-event-highlight {
  outline: 2px solid var(--kv-accent-500);
  outline-offset: -2px;
  animation: kv-event-pulse 1.2s ease-in-out;
}
@keyframes kv-event-pulse {
  0%, 100% { background-color: var(--kv-accent-subtle); }
  30% { background-color: var(--kv-bg-elevated); }
}
</style>
