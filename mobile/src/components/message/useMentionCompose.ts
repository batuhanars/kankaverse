import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Sprint M2d — @bahsetme yazma kancası. Web `useMentionAutocomplete.ts` deseninin RN karşılığı:
 * desen okundu, dosya **kopyalanmadı** (Metro proje kökü dışını çözemiyor — i18n'deki aynı sınır).
 *
 * `useMessageComposer` ile **ayrı** durur: o gönderim/yanıt/düzenleme sahibi, bu bahsetme sahibi.
 * Bağlantı noktası tek: gönderim öncesi `applyMentionTokens`.
 *
 * 🔴 **RN'de imleç konumu bedava değil.** Web'de `textarea.selectionStart` her an okunabilir;
 * burada `TextInput`'un `onSelectionChange`'i takip edilmek zorunda. `onChangeText` tek başına
 * yetmez: kullanıcı metnin ORTASINA dokunup oradan yazabilir, o zaman sorgu yanlış yerden okunur.
 */

export interface MentionCandidate {
  id: string;
  username: string;
  avatarUrl?: string | null;
  /** `@everyone` özel önerisi — gerçek üye değil, satır ikonu ve dönüşümü farklı. */
  isEveryone?: boolean;
  /** R15 — rol önerisi: seçilince `<@&roleId>` token'ına çevrilir. */
  isRole?: boolean;
  color?: string | null;
}

/** `@everyone` önerisi için sabit sentinel id (gerçek bir kullanıcı id'si değil). */
export const EVERYONE_ID = '@everyone';

// Liste kaydırılabilir; üst sınır yalnız çok kalabalık ortamda çizim yükü için (sahip revizesi 2026-11-12:
// 8 sınırı yüzünden "@" yazınca ortamdaki diğer üyeler hiç görünmüyordu).
const MAX_SUGGESTIONS = 50;

/** İmlecin solundaki `@kelime` bloğu — web `findMentionQuery` ile aynı kural. */
function findMentionQuery(text: string, cursorPos: number): { query: string; start: number } | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/@([\w]*)$/);
  if (!match) return null;
  return { query: match[1], start: before.length - match[0].length };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function useMentionCompose(
  /** Öneri kaynağı: ortam kanalında ortam üyeleri, DM'de karşı taraf / grup üyeleri. */
  candidates: MentionCandidate[],
  /**
   * `@everyone` rol id'si — YALNIZ everyone rolü `mentionable` ise dolu.
   * `null`/`undefined` → öneri hiç çıkmaz VE elle yazılan `@everyone` de çevrilmez.
   */
  everyoneRoleId: string | null | undefined,
) {
  const [suggestions, setSuggestions] = useState<MentionCandidate[]>([]);
  const [visible, setVisible] = useState(false);

  // İmleç, son metin ve seçilen bahsetmeler render'ı etkilemiyor → ref (gereksiz yeniden çizim yok).
  const cursorRef = useRef(0);
  const textRef = useRef('');
  const queryRef = useRef<{ query: string; start: number } | null>(null);
  const pickedRef = useRef<Map<string, string>>(new Map());
  // R15 — rol adı → roleId (token biçimi farklı: <@&id>)
  const pickedRolesRef = useRef<Map<string, string>>(new Map());

  const hasEveryone = !!everyoneRoleId;

  /** Sorguyu (metin, imleç) çiftinden yeniden hesapla — iki giriş noktası da bunu çağırır. */
  const recompute = useCallback(
    (text: string, pos: number) => {
      textRef.current = text;
      cursorRef.current = pos;
      const found = findMentionQuery(text, pos);
      if (!found) {
        queryRef.current = null;
        setVisible(false);
        setSuggestions([]);
        return;
      }
      queryRef.current = found;
      const q = found.query.toLowerCase();

      const list: MentionCandidate[] = [];
      // `@everyone` önerisi en üstte (web ile aynı sıra)
      if (hasEveryone && 'everyone'.startsWith(q)) {
        list.push({ id: EVERYONE_ID, username: 'everyone', isEveryone: true });
      }
      list.push(...candidates.filter((c) => c.username.toLowerCase().includes(q)));

      if (!list.length) {
        setVisible(false);
        setSuggestions([]);
        return;
      }
      setSuggestions(list.slice(0, MAX_SUGGESTIONS));
      setVisible(true);
    },
    [candidates, hasEveryone],
  );

  /**
   * 🔴 `TextInput` `onSelectionChange` → imleç DOĞRU değerle gelir ve sorgu YENİDEN hesaplanır.
   * Sadece imleci saklamak yetmez: RN'de `onChangeText` `onSelectionChange`'ten önce tetikleniyor
   * ve o anda gerçek imleç konumu bilinmiyor. Metnin ORTASINA dokunup yazan kullanıcıda sorgu
   * metnin sonundan okunur, yanlış liste çıkardı. Bu kanca o hesabı düzeltir.
   *
   * Yan fayda: var olan bir `@kelime`'nin içine dokunmak da listeyi açar (Discord da böyle).
   * Seçim sonrası metin `@ad ` ile bittiği için (sonda boşluk) sorgu eşleşmez, liste kapalı kalır.
   */
  const onSelectionChange = useCallback(
    (start: number) => {
      recompute(textRef.current, start);
    },
    [recompute],
  );

  /**
   * Her metin değişiminde çağrılır. İmleç verilmezse metin sonu varsayılır; gerçek değer
   * hemen ardından gelen `onSelectionChange` ile oturur (yukarıdaki not).
   */
  const onChangeText = useCallback(
    (text: string, cursor?: number) => {
      recompute(text, cursor ?? text.length);
    },
    [recompute],
  );

  /**
   * Öneriye dokunma → `@sorgu` bloğunu `@ad ` ile değiştir, yeni metni ve imleç konumunu döndür.
   * Çağıran (`MessageComposer`) metni kutuya yazar; kanca `TextInput` referansı tutmaz.
   */
  const select = useCallback(
    (candidate: MentionCandidate, text: string): { text: string; cursor: number } | null => {
      const q = queryRef.current;
      if (!q) return null;
      const before = text.slice(0, q.start);
      const after = text.slice(q.start + 1 + q.query.length); // +1 = '@'
      const replacement = `@${candidate.username} `;
      // `@everyone` için kayıt TUTULMAZ: dönüşümü seçime değil rolün mentionable olmasına bağlı
      // (web'de de `pendingEveryone` bayrağı bu yüzden kaldırıldı — sözleşme §4.4).
      if (candidate.isRole) pickedRolesRef.current.set(candidate.username, candidate.id);
      else if (!candidate.isEveryone) pickedRef.current.set(candidate.username, candidate.id);
      queryRef.current = null;
      setVisible(false);
      setSuggestions([]);
      const newText = before + replacement + after;
      const cursor = before.length + replacement.length;
      textRef.current = newText;
      cursorRef.current = cursor;
      return { text: newText, cursor };
    },
    [],
  );

  /**
   * D95 — "Bahset" kısayolu (profil paneli): `@` yazmadan, metnin SONUNA `@ad ` ekler (metin varsa
   * ve boşlukla bitmiyorsa önce bir boşluk). Kayıt `select` ile aynı (`pickedRef`) → gönderimde
   * aynı `<@userId>` dönüşümü. Yeni metni ve imleç konumunu (sonu) döndürür.
   */
  const append = useCallback(
    (candidate: MentionCandidate, text: string): { text: string; cursor: number } => {
      const sep = text.length > 0 && !/\s$/.test(text) ? ' ' : '';
      const newText = `${text}${sep}@${candidate.username} `;
      pickedRef.current.set(candidate.username, candidate.id);
      queryRef.current = null;
      setVisible(false);
      setSuggestions([]);
      textRef.current = newText;
      cursorRef.current = newText.length;
      return { text: newText, cursor: newText.length };
    },
    [],
  );

  const close = useCallback(() => {
    queryRef.current = null;
    setVisible(false);
    setSuggestions([]);
  }, []);

  /**
   * Gönderim öncesi token dönüşümü (sözleşme §4.3-§4.4):
   *   - `@everyone` → `<@&roleId>` — **listeden seçmiş olmak şart değil**, tek kapı rolün
   *     `mentionable` olması. Elle yazan kullanıcının mesajı sessizce sıradan mesaja dönmesin.
   *   - `@kullanıcıadı` → `<@userId>` — **yalnız listeden seçilenler**. Serbest `@kelime`'yi
   *     kişiye eşlemek isim araması ister (yeni uç) ve yanlış kişiyi bahsetme riski taşır;
   *     bu asimetri bilinçli, web ile birebir aynı.
   * Kelime sınırı: token'ın ardından boşluk ya da metin sonu (`@everyone!` çevrilmez — web de öyle).
   */
  const applyMentionTokens = useCallback(
    (text: string): string => {
      // C54 — tek geçiş: ad → token tablosu. Önceki "ad + boşluk/son" kuralı `@ali,` gibi noktalama
      // bitişik bahsetmeyi düz metinde bırakıyordu. Sınır artık kullanıcı adı karakter kümesi
      // (`[A-Za-z0-9_]`) dışındaki herhangi bir karakter; EN UZUN ad önce denenir (`@ali.x` rolü
      // `@ali`den önce eşleşsin). Tek geçiş, üretilen `<@id>` içinin yeniden eşlenmesini engeller.
      const table = new Map<string, string>();
      if (everyoneRoleId) table.set('everyone', `<@&${everyoneRoleId}>`);
      // R15 — rol adları YALNIZ listeden seçilenler çevrilir (@everyone'daki "elle yazma da
      // çalışır" kuralı rollere TAŞINMADI: rol adı serbest metinle çakışabilir ve yanlış gruba
      // ping atmak, yanlış kişiye ping atmaktan daha gürültülü. Web ile birebir aynı karar).
      for (const [roleName, roleId] of pickedRolesRef.current.entries()) {
        if (!table.has(roleName)) table.set(roleName, `<@&${roleId}>`);
      }
      for (const [username, userId] of pickedRef.current.entries()) {
        if (!table.has(username)) table.set(username, `<@${userId}>`);
      }
      if (!table.size) return text;
      const names = [...table.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
      const regex = new RegExp(`@(${names.join('|')})(?![A-Za-z0-9_])`, 'g');
      return text.replace(regex, (_m, name: string) => table.get(name) ?? _m);
    },
    [everyoneRoleId],
  );

  /**
   * C54 — düzenlemeye girerken çözülen etiketleri seçilmiş-bahsetme haritalarına önceden doldurur;
   * böylece kullanıcının dokunmadığı `@ad`'lar kaydederken geri token olur.
   */
  const seedPicked = useCallback((users: Map<string, string>, roles: Map<string, string>) => {
    for (const [name, id] of users) pickedRef.current.set(name, id);
    for (const [name, id] of roles) pickedRolesRef.current.set(name, id);
  }, []);

  /** Gönderim BAŞARILI olunca çağrılır. Hatada çağrılmaz — kullanıcı bahsetmelerini kaybetmesin. */
  const clearPicked = useCallback(() => {
    pickedRef.current = new Map();
    pickedRolesRef.current = new Map();
  }, []);

  return useMemo(
    () => ({
      suggestions,
      visible,
      onChangeText,
      onSelectionChange,
      select,
      append,
      close,
      applyMentionTokens,
      clearPicked,
      seedPicked,
    }),
    [suggestions, visible, onChangeText, onSelectionChange, select, append, close, applyMentionTokens, clearPicked, seedPicked],
  );
}
