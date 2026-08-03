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
  isEveryone?: boolean // @everyone özel önerisi (gerçek üye değil)
  // R15 — rol önerisi: gerçek üye değil, seçilince <@&roleId> token'ına çevrilir
  isRole?: boolean
  color?: string | null
}

// @everyone özel önerisi için sabit sentinel id
const EVERYONE_ID = '@everyone'

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
  // @everyone rol id'si — yalnız everyone rolü mentionable ise dolu döner; null → @everyone önerisi yok
  everyoneRoleId?: () => string | null,
  /**
   * R15 — önerilebilir ROLLER (everyone HARİÇ). Çağıran kapı kuralını uygulamış olarak verir:
   * `mentionable` roller herkese, `mentionable` olmayanlar HİÇ KİMSEYE (R2 revizyonu — izin
   * baypası yok). Kapı kuralı burada tekrarlanmaz — tek yerde kalsın (çağıranda uygulanır).
   */
  roles?: () => Array<{ id: string; name: string; color?: string | null }>,
) {
  const showPopover = ref(false)
  const suggestions = ref<MentionMember[]>([])
  const activeIndex = ref(0)

  // username → userId: picker'dan seçilen bahsetmeler (gönderimde token'a çevrilir)
  const pendingMentions = ref<Map<string, string>>(new Map())
  // R15 — rol adı → roleId (gönderimde <@&roleId> token'ına çevrilir)
  const pendingRoles = ref<Map<string, string>>(new Map())

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

    // @everyone önerisi: rol mentionable ise + "everyone" sorguyla eşleşiyorsa en üste
    const list: MentionMember[] = []
    if (everyoneRoleId?.() && 'everyone'.startsWith(q)) {
      list.push({ id: EVERYONE_ID, username: 'everyone', isEveryone: true })
    }
    // R15 — roller üyelerin ÜSTÜNDE (grup hedefi daha az sayıda, aranan çoğunlukla odur)
    for (const role of roles?.() ?? []) {
      if (role.name.toLowerCase().includes(q)) {
        list.push({ id: role.id, username: role.name, isRole: true, color: role.color })
      }
    }
    list.push(...filtered)

    if (!list.length) {
      showPopover.value = false
      suggestions.value = []
      return
    }
    suggestions.value = list.slice(0, MAX_SUGGESTIONS)
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
    // Gerçek üye → username→userId haritası. @everyone için bayrak TUTULMAZ: dönüşüm artık
    // seçime değil rolün mentionable olmasına bakıyor (bkz. applyMentionTokens).
    // R15 — rol seçimi ayrı haritada; token biçimi farklı (<@&id>).
    if (member.isRole) pendingRoles.value.set(member.username, member.id)
    else if (!member.isEveryone) pendingMentions.value.set(member.username, member.id)
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
   * Gönderim öncesi token dönüşümü:
   *   - `@kullanıcıadı` → `<@userId>` — YALNIZ listeden seçilenler (pendingMentions).
   *     Seçilmemiş serbest `@x` dokunulmaz.
   *   - `@everyone` → `<@&roleId>` — seçilmiş olması ŞART DEĞİL (aşağıdaki gerekçe).
   * Kelime-sınırı: token'ın ardından boşluk, satır sonu veya metin sonu.
   */
  function applyMentionTokens(text: string): string {
    let result = text
    /**
     * @everyone → <@&roleId>. **Öneriyi listeden seçmiş olmak ŞART DEĞİL** (sahip kararı
     * 2026-08-03): elle yazılan `@everyone` da çevrilir. Önceden `pendingEveryone` bayrağı
     * şarttı ve elle yazan kullanıcı sessizce sıradan mesaj göndermiş oluyordu — ne bir uyarı
     * ne bir işaret vardı (sahip tam olarak buna takıldı). Discord'da da yazmak yeter.
     *
     * Kapı gevşemiyor: `everyoneRoleId()` yalnız **everyone rolü `mentionable` ise** dolu döner
     * (varsayılanı `false`), ve sunucu aynı kapıyı bağımsız uyguluyor — istemci ne gönderirse
     * göndersin `resolveMentions` mentionable değilse `mentionsEveryone` yazmaz.
     * Kullanıcı adları için AYNISI YAPILMAZ: serbest `@kelime`'yi kişiye eşlemek isim araması
     * ister (yeni uç) ve yanlış kişiyi bahsetme riski taşır — bu asimetri bilinçli.
     */
    const roleId = everyoneRoleId?.() ?? null
    if (roleId) {
      result = result.replace(/@everyone(?=\s|$)/g, `<@&${roleId}>`)
    }
    // R15 — rol adları: YALNIZ listeden seçilenler (kullanıcı adlarındaki kuralın aynısı).
    // Serbest yazılan `@Moderatör` çevrilmez: rol adı serbest metinle çakışabilir ve yanlış
    // gruba ping atmak kişiye yanlış ping atmaktan daha gürültülü olurdu.
    for (const [roleName, id] of pendingRoles.value.entries()) {
      const regex = new RegExp(`@${escapeRegex(roleName)}(?=\\s|$)`, 'g')
      result = result.replace(regex, `<@&${id}>`)
    }
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
    pendingRoles.value = new Map()
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
