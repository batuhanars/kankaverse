/**
 * useMentionAutocomplete — Sprint V2 @bahsetme compose yardımcısı
 *
 * Kullanım:
 *   const { ... } = useMentionAutocomplete(membersSource, textareaEl)
 *
 * membersSource: ComputedRef/Ref<Array<{ id: string; username: string; avatarUrl?: string | null }>>
 *   → guild kanalında guild üyeleri; DM'de [otherUser] + grup üyeleri
 *
 * Dışarıya:
 *   - showPopover, suggestions, activeIndex  → popover render için
 *   - onInput(value, cursorPos)              → her textarea input'ta çağırılır
 *   - onKeydown(e)                           → ↑/↓/Enter/Tab/Esc yakalamak için
 *   - selectSuggestion(member)               → tıklamayla seçim
 *   - applyMentionTokens(text)               → gönderim öncesi @username → <@userId> dönüşümü
 *   - clearPending()                         → gönderim sonrası temizlik
 *   - pendingMentions                        → { username → userId } haritası (gönderimde kullanılır)
 */
import { ref, computed } from 'vue'

export interface MentionMember {
  id: string
  username: string
  avatarUrl?: string | null
}

// @sorgu tespiti: imlecin solundaki @kelime bloğu
function findMentionQuery(text: string, cursorPos: number): { query: string; start: number } | null {
  // Geriye doğru @ ara; kelime-sınırı: boşluk veya satır başı
  const before = text.slice(0, cursorPos)
  const match = before.match(/@([\w]*)$/)
  if (!match) return null
  return {
    query: match[1],
    start: before.length - match[0].length,
  }
}

const MAX_SUGGESTIONS = 8

export function useMentionAutocomplete(
  members: { value: MentionMember[] } | (() => MentionMember[]),
  getContent: () => string,
  setContent: (v: string) => void,
  getCursor: () => number,
  setCursor: (pos: number) => void,
) {
  const showPopover = ref(false)
  const suggestions = ref<MentionMember[]>([])
  const activeIndex = ref(0)

  // username → userId: picker'dan seçilen bahsetmeler (gönderimde token'a çevrilir)
  const pendingMentions = ref<Map<string, string>>(new Map())

  // Aktif sorgu bilgisi (seçim sırasında değiştirmek için)
  const _currentQuery = ref<{ query: string; start: number } | null>(null)

  function _getMembers(): MentionMember[] {
    return typeof members === 'function' ? members() : members.value
  }

  function onInput() {
    const text = getContent()
    const pos = getCursor()
    const found = findMentionQuery(text, pos)
    if (!found) {
      showPopover.value = false
      suggestions.value = []
      return
    }
    _currentQuery.value = found
    const q = found.query.toLowerCase()
    const filtered = _getMembers()
      .filter((m) => m.username.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS)
    if (!filtered.length) {
      showPopover.value = false
      suggestions.value = []
      return
    }
    suggestions.value = filtered
    activeIndex.value = 0
    showPopover.value = true
  }

  function selectSuggestion(member: MentionMember) {
    const qInfo = _currentQuery.value
    if (!qInfo) return
    const text = getContent()
    const before = text.slice(0, qInfo.start)
    const after = text.slice(qInfo.start + 1 + qInfo.query.length) // +1 for '@'
    const replacement = `@${member.username} `
    const newText = before + replacement + after
    setContent(newText)
    const newCursor = before.length + replacement.length
    // username → userId haritasına ekle
    pendingMentions.value.set(member.username, member.id)
    showPopover.value = false
    suggestions.value = []
    _currentQuery.value = null
    // Cursor'ı asenkron ayarla (v-model'in DOM'u güncellemesini bekle)
    setTimeout(() => setCursor(newCursor), 0)
  }

  function onKeydown(e: KeyboardEvent): boolean {
    if (!showPopover.value) return false
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
      return true
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const sel = suggestions.value[activeIndex.value]
      if (sel) {
        e.preventDefault()
        selectSuggestion(sel)
        return true
      }
    }
    if (e.key === 'Escape') {
      showPopover.value = false
      return true
    }
    return false
  }

  /**
   * Gönderim öncesi: pendingMentions'taki her @username → <@userId> token'ına çevir.
   * Seçilmemiş serbest @x dokunulmaz.
   * Kelime-sınırı: @username'in ardından boşluk, satır sonu veya metin sonu.
   */
  function applyMentionTokens(text: string): string {
    if (!pendingMentions.value.size) return text
    let result = text
    for (const [username, userId] of pendingMentions.value.entries()) {
      // Tam kelime eşleşmesi: @username arkasında kelime-sınırı (boşluk, satır sonu, metin sonu)
      const regex = new RegExp(`@${escapeRegex(username)}(?=\\s|$)`, 'g')
      result = result.replace(regex, `<@${userId}>`)
    }
    return result
  }

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function clearPending() {
    pendingMentions.value = new Map()
    showPopover.value = false
  }

  // Mevcut içerik değiştiğinde (örn. gönderim sonrası temizlik) popover'ı kapat
  function closePopover() {
    showPopover.value = false
    suggestions.value = []
  }

  return {
    showPopover: computed(() => showPopover.value),
    suggestions: computed(() => suggestions.value),
    activeIndex: computed(() => activeIndex.value),
    pendingMentions,
    onInput,
    onKeydown,
    selectSuggestion,
    applyMentionTokens,
    clearPending,
    closePopover,
  }
}
