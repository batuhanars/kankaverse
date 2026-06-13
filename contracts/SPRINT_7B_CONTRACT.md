# Sprint 7B Contract — Türkçe Automod (block-on-send) + Yeni Üye Karantinası

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Türetildiği yer: PLAN Sprint 7B (sahip+PM 2026-06-13).
>
> **R7:** Karantina, `canDm`/`canSendFriendRequest` (T&S karar fonksiyonları) içine girer → satır-satır insan incelemesi.
> Automod = block-on-send içerik filtresi (kayıtsız, geri-döndürülebilir) → **R7-hafif** (PM incelemesi yeterli, T&S karar
> yüzeyi değil; erişim/minör kararı vermez).
>
> Response envelope her endpoint ilk satırı: `{ success, statusCode, data }`.

---

## 1. Hedef

(1) Topluluk alanlarında **Türkçe yasak-kelime filtresi** (block-on-send, **kayıtsız** — hukuk-nötr, sahip kararı 2026-06-13);
(2) **Yeni üye karantinası** — yeni katılan hesabın ortak-ortamı hemen kötüye kullanıp yerleşik üyelere ulaşmasını
geciktiren anti-spam/anti-raid sertleştirme (mevcut `canDm`/`canSendFriendRequest` karantina **no-op hook'larını** gerçeğe bağlar).

> **Karantinanın T&S rolü (dürüst çerçeve):** Minörler cold-DM/click-add'den **zaten tam korunuyor** (`canDm` 4a +
> friend G1). Karantina o kalkanı değiştirmez; **anti-spam/raid + savunma derinliği** katar (yeni hesap ortak-ortam
> basamağını anında kullanamaz).

---

## 2. Automod — Türkçe yasak-kelime (block-on-send, kayıtsız)

- **Kapsam:** yalnız **guild kanalı mesajları** (`messages.service.create`). **DM hariç** (özel alan; mahremiyet — DM automod ayrı/sonraki karar).
- **`AutomodService.check(content): { blocked: boolean }`** (yeni, SharedModule): metni normalize et (küçük harf, TR karakter farkındalığı, tekrarlı harf daralt — **basit tut, over-engineering yok**), platform yasak-kelime listesiyle karşılaştır (kelime-sınırı/normalize eşleşme).
- **Yasak liste = config** (`api/src/config/automod-words.ts` veya config dosyası) — genişletilebilir; küçük TR küfür/nefret tabanıyla başla. Kod-dışı, kolay güncellenir.
- **Davranış:** eşleşme → `messages.service.create` mesajı oluşturmadan `BadRequestException` jenerik `{ error: 'MESSAGE_BLOCKED' }` ("Mesajınız topluluk kurallarına uygun değil"). **Sıfır DB, sıfır report, sıfır kayıt** (kayıtsız — 4B/hukuk bölgesine girmez).
- **WS yolu:** mesaj yalnız REST `POST` ile oluşturuluyorsa (mevcut mimari) tek nokta yeterli; gateway'de ayrı send yoksa orada kontrol gerekmez (doğrula).

## 3. Yeni Üye Karantinası (R7)

- **Veri:** `GuildMember.joinedAt` **zaten var** — yeni alan/migration GEREKMEZ. "Yeni üye" = `joinedAt + QUARANTINE_HOURS > now`.
- **Config:** `QUARANTINE_HOURS` (default **24**, `.env` üzerinden). 0 = karantina kapalı (kaçış valfi).
- **`isQuarantinedInGuild(userId, guildId): Promise<boolean>`** helper (MembershipService veya yeni QuarantineService — DRY için MembershipService önerilir).
- **Entegrasyon (R7 — ortak-ortam basamağını karantinayla kapıla):**
  - **`canDm` Kural 4c (`FRIENDS` dmPolicy → ortak sunucu):** ortak guild **yalnız initiator (sender) o guild'de karantinada DEĞİLSE** sayılır. Karantinalıysa o guild basamağı geçmez (`DM_NOT_ALLOWED` jenerik).
  - **`canSendFriendRequest` USER_CLICK 6a (ortak ortam zorunlu):** ortak guild **yalnız sender o guild'de karantinada değilse** sayılır; aksi → `USER_NOT_FOUND` jenerik.
  - **Yön:** yalnız **başlatanın** (sender) karantinası kapılar; yeni üyeye yerleşik üyenin ulaşması ayrı (ve zaten minör/blok kapıları geçerli). Sadeleştirme: initiator-quarantine.
- **Sessiz:** karantina UI'da gösterilmez (minör-koruması felsefesi gibi — sızıntı=ipucu). Yeni üye fark etmeden çalışır; jenerik retler.
- **Hook bağlama:** `dm-permission.service.ts` satır ~29/100 + `friend-permission.service.ts` USER_CLICK no-op karantina hook'ları gerçeğe bağlanır.

## 4. R7 Kapsamı (insan incelemesi)
- `isQuarantinedInGuild` + `canDm` 4c ve `canSendFriendRequest` 6a entegrasyonu (ortak-ortam basamağının karantinayla kapılanması), fail-closed.
- Minör kalkanının (4a/G1) BOZULMADIĞI doğrulanır (karantina yalnız ekler, gevşetmez).

## 5. Frontend (`web/`)
- **Automod:** `MESSAGE_BLOCKED` hata kodu → mesaj alanında jenerik Türkçe uyarı (toast/satır); `tr.json`. Mesaj input temizlenmez (kullanıcı düzeltebilir).
- **Karantina:** **UI YOK** (sessiz). Jenerik retler zaten mevcut akışlarda gösteriliyor (DM/friend hata mesajları). Yeni ekran/gösterge ekleme.

## 6. DoD
- [ ] Automod: guild kanalında yasak-kelime içeren mesaj `MESSAGE_BLOCKED` ile reddedilir; **DM etkilenmez**; sıfır DB/kayıt; liste config'ten.
- [ ] Karantina: yeni üye (joinedAt < QUARANTINE_HOURS) ortak-ortam basamağıyla DM/friend başlatamaz; süre dolunca normal çalışır; `QUARANTINE_HOURS=0` kapatır.
- [ ] Minör kalkanı bozulmadı (canDm 4a / friend G1 testleri hâlâ geçer); karantina yalnız ekledi.
- [ ] `nest build` + `vue-tsc` temiz; birim testler (automod check + karantina entegrasyonu) geçer.
- [ ] **R7:** karantina entegrasyonu satır-satır incelendi (sahip onayı).

## 7. Notlar
- Per-ortam karantina süresi/ayarı + DM automod + per-ortam özel kelime listesi → **V2** (`ORTAM_AYARLARI_ROADMAP.md`).
- Automod kayıtsız (block-only); flag→moderasyon kuyruğu = **4B** (hukuk beklemede).
