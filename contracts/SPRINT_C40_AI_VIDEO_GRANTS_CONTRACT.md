# SPRINT C40: Yapay zeka video erişim hakkı (admin panelinden, kredili ve süreli)

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-30).** PM compose (Opus). **api + web + mobil (yalnız metin).**
> **R7:** yapay zeka erişim kapısı (`ai-video-access.ts`) değişiyor: para harcatan kapı. §1-§2 satır satır sahibe.

---

## §0 Kararlar (sahip, 2026-10-30)
1. **Ücretli deneme:** erişim isteyen kullanıcıdan sahip ödemeyi platform dışında alır (IBAN), erişimi admin panelinden açar.
   Pika yazılı izni var (20.10.2026, Pika API son kullanıcı adına kullanım onayı). Uygulama içinde **fiyat, ödeme, IBAN geçmez.**
2. **Play kuralı:** mobilde kilitli not nötr, yönlendirme yok (§4). Web/masaüstünde C39 notu + "Ortama katıl" kalır.
3. Hak = **kredi bütçesi + isteğe bağlı bitiş tarihi.** Bütçe bitince ya da süre dolunca erişim kendiliğinden kapanır.
4. Minöre hak verilemez (Pika 18+). Mevcut env açık listesi (`AI_VIDEO_USER_IDS`: sahip + 2 destekçi) aynen çalışmaya devam eder.

## §1 Şema + kapı (api, R7)
1. `AiVideoGrant { id, userId @unique, budgetMicroUsd Int, startsAt DateTime @default(now()), expiresAt DateTime?, revokedAt DateTime?,
   grantedById String, note String?, createdAt, updatedAt }`. Kullanıcı başına tek kayıt; yeniden verme mevcut kaydı günceller
   (yeni dönem: `startsAt` sıfırlanır, bütçe yeni değer). Migration yerel DB'ye uygulanır.
2. **Harcanan** = `AiVideoGeneration` kayıtlarında bu kullanıcının `startsAt` sonrasındaki kesinleşmiş + rezerve maliyet toplamı
   (mevcut günlük tavan hesabıyla aynı kaynak; dev mevcut alan adlarını kullanır, yeni defter yok).
3. `canUseAiVideo` (tek kapı) **async** olur: `!isMinor && enabled && apiKey && (envListede || etkinHak)`.
   Etkin hak = kayıt var, `revokedAt` null, `expiresAt` null ya da gelecekte, harcanan < bütçe. Guard ve oturum DTO'su aynı fonksiyonu
   çağırır (bugünkü ilke). `canPreviewAiVideo` DEĞİŞMEZ.
4. **Bütçe kapısı:** üretim isteğinde tahmin, kalan bütçeyi aşıyorsa 402 değil **403 `AI_VIDEO_BUDGET_EXCEEDED`** (Türkçe mesaj:
   "Kredin bu video için yetmiyor."). Günlük tavan (mevcut) ayrıca geçerli; ikisinden küçüğü bağlar. Env listedekilere bütçe kapısı yok.
5. Rezerv/iade mantığı mevcut akıştan; Pika başarısızsa maliyet harcanana sayılmaz (bugünkü davranış).
6. Test: env listesi aynen geçer · hak yok → yok · iptal/süre dolmuş/bütçe bitmiş → yok · minöre hak kaydı olsa bile yok · bütçeyi aşan
   tahmin 403 · yeniden verme yeni dönem başlatır · guard ile DTO aynı sonuç.

## §2 Admin uçları (api, R7)
`PlatformAdminGuard` (mevcut admin kapısı).
1. `GET /admin/ai-video/grants` → `[{ user: { id, username }, budgetCredits, spentCredits, startsAt, expiresAt, revokedAt, note, grantedBy }]`.
2. `PUT /admin/ai-video/grants/:userId { budgetCredits: int 1..100000, expiresAt?: ISO | null, note?: ≤200 }` → oluştur/yenile.
   Kullanıcı minörse 403 `MINOR_NOT_ALLOWED`; silinmişse 404. Kredi ↔ mikro-USD dönüşümü C33'teki tek yardımcıyla.
3. `DELETE /admin/ai-video/grants/:userId` → `revokedAt` (kayıt silinmez).
4. Her yazma `AuditLog` (`ai_video.grant` / `.revoke`, metadata: bütçe, bitiş, not).
5. Hakkı değişen kullanıcıya oturum DTO'su bir sonraki yenilemede yansır (canlı itme gerekmez; dev mevcut `me` yenilemesini raporlar).

## §3 Web admin arayüzü
Kullanıcı ayarları > Admin bölümüne **"Yapay zeka erişimi"** alt bölümü (yalnız platform admini görür; mevcut admin sekmesinin
yapısına uyar):
1. Liste: kullanıcı adı, kullanılan / bütçe kredi, bitiş, durum (etkin / süresi doldu / bitti / iptal).
2. "Erişim ver": kullanıcı adıyla arama (mevcut admin kullanıcı listesi verisi), kredi, bitiş tarihi (isteğe bağlı), not. Form vee-validate + zod.
3. Satırda "Yenile" (aynı form, dolu) ve "İptal et" (onaylı).
4. Not alanı yalnız admin içindir ("120 TL, 30.10 IBAN" gibi); kullanıcıya hiç gösterilmez.

## §4 Kullanıcı yüzü (web + mobil)
1. Hakkı olan kullanıcının maliyet çubuğunda günlük satırın yanında: "Kalan kredi: 340 / 500" ve bitiş varsa "Bitiş: 30 Kasım 2026"
   (TR tarih). `GET /ai-video/options` cevabına `grant: { remainingCredits, budgetCredits, expiresAt } | null` (yalnız hak sahibine).
2. **Mobil kilitli not:** davet düğmesi ve davet metni **kaldırılır**; yalnız "Yapay zeka ile video şu an yalnız davetli kullanıcılara açık."
   (`accessInviteCode` mobilde kullanılmaz). Web/masaüstü C39 davranışı aynen.
3. Bütçe bittiğinde/süre dolduğunda kullanıcı kilitli moda düşer (C33 davranışı), web'de C39 notu görünür.
4. Metinler `tr.json`, em dash yok. Mobil versionCode **41 kalır**.

## §5 DoD
- api: build, ilgili jest + tam koşu, eslint (değişen), `migrate status` temiz. web: `vue-tsc -b` (bilinen 6), `vite build`, eslint.
  mobil: tsc + lint.
- **R7:** `ai-video-access.ts`, guard, bütçe kapısı ve admin uçları diff'i sahibe.
- **Sahip turu:** test hesabına 50 kredi ver → yapay zeka açılır, kalan kredi görünür · bütçeyi aşan istek reddedilir · iptal et →
  kilitli mod · süresi geçmiş hak → kilitli · mobilde kilitli not düğmesiz.

**OUT:** uygulama içi ödeme · otomatik ödeme doğrulama · kullanıcıya fatura/makbuz · erişim talep formu · admin mobil arayüzü.
