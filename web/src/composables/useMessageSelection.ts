/**
 * C82: WhatsApp tarzı çoklu mesaj seçimi (web). Yalnız KİMLİKLER tutulur; seçili mesajlar her seferinde listeden
 * okunur (kronolojik sıra, silinen mesaj kendiliğinden düşer, tepki/düzenleme bayat kopyadan okunmaz).
 * Gönderilmemiş/başarısız (yerel) mesaj seçilemez: sunucuda yok.
 */
import { computed, inject, provide, ref, watch, type InjectionKey } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'
import type { MessageDto } from '@/types'

/** Tek seferde en çok bu kadar mesaj seçilir (toplu silme tek onayla). */
export const SELECTION_MAX = 50

export function useMessageSelection(
  channelId: () => string | null | undefined,
  messages: () => MessageDto[],
) {
  const { t } = useI18n()
  const toast = useToastStore()
  const ids = ref<string[]>([])
  const active = computed(() => ids.value.length > 0)
  const idSet = computed(() => new Set(ids.value))
  const selected = computed(() => messages().filter((m) => idSet.value.has(m.id)))

  function clear() {
    ids.value = []
  }

  // Kanal değişince mod kapanır; seçili mesajların hepsi silindiyse (başka cihazdan da olabilir) de kapanır.
  watch(channelId, clear)
  watch(
    () => selected.value.length,
    (n) => {
      if (active.value && n === 0) clear()
    },
  )

  function start(message: MessageDto) {
    if (message.localStatus) return
    ids.value = [message.id]
  }

  function toggle(message: MessageDto) {
    if (message.localStatus) return
    if (idSet.value.has(message.id)) {
      ids.value = ids.value.filter((id) => id !== message.id)
      return
    }
    if (ids.value.length >= SELECTION_MAX) {
      toast.info(t('select.limit', { n: SELECTION_MAX }))
      return
    }
    ids.value = [...ids.value, message.id]
  }

  return { active, selected, isSelected: (id: string) => idSet.value.has(id), start, toggle, clear }
}

export type MessageSelection = ReturnType<typeof useMessageSelection>

const SELECTION_KEY: InjectionKey<MessageSelection> = Symbol('messageSelection')

/** Liste sahibi (ortam kanalı / DM) çağırır; alttaki MessageRow'lar `injectMessageSelection` ile okur. */
export function provideMessageSelection(selection: MessageSelection) {
  provide(SELECTION_KEY, selection)
}

export function injectMessageSelection(): MessageSelection | null {
  return inject(SELECTION_KEY, null)
}
