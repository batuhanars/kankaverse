# SPRINT C43: Yapay zeka video: günlük tavan kalkar, tek ölçü admin hakkı

> Durum: **TASARIM KİLİTLİ (2026-10-31).** PM compose (Opus). Sahip isteği. **api + web + mobil (JS)**, mobil **vc43 içinde kalır**
> (vc43 henüz Play'e gönderilmedi; C42 ile aynı pakete girer, versionCode artmaz).
> **R7 kapsamı:** C40 bütçe kapısı (`assertUnderBudget`) ve erişim kapısı (`canUseAiVideo`) değişir. Diff sahip onayına sunulur.

## §0 Sorun ve kararlar

**Gözlem (sahip 2026-10-31):** panelden bir kullanıcıya 100 kredi + yarın bitiş tanımlandı; form panele uymuyor, "Bugün X / 500" yazıyor.
Kök neden: (1) `AI_VIDEO_USER_IDS` env listesindeki hesaplar hak kaydını tamamen yok sayıyor (`isAiVideoEnvListed` →
kapı yok, `grant: null`); (2) günlük tavan (`AI_VIDEO_DAILY_CAP_USD`, 5 $ = 500 kredi) herkese ayrıca uygulanıyor ve formda gösteriliyor.

**Sahip kararları:**
1. **Günlük tavan kalkar.** Ne kapı ne gösterim. Tek ölçü panelde tanımlanan hak.
2. Formda gösterilen: **kullanılan / tanımlanan kredi** ve bitiş tarihi. Örnek: "Kullanılan 35 / 100 kredi · Bitiş: 1 Kasım 2026".

**Revizyon (sahip 2026-10-31, ilk taslağın env çakışma kuralını iptal eder):**
3. **Env açık listesi (`AI_VIDEO_USER_IDS`) tamamen kalkar.** Erişimin tek kaynağı panelden tanımlanan hak. Sahip dahil herkes
   (sahip kendine de hak tanımlar). Sınırsız hesap kavramı YOK.
4. **Bitiş tarihi isteğe bağlı kalır** (bugün de öyle; boş bırakılırsa hak kredi bitene dek sürer). Alan kaldırılmaz: ücretli
   denemede süreli erişim ve unutulan hakkın kendiliğinden kapanması için kullanışlı. Panelde varsayılan boş.
- Para güvenliği: günlük tavan kalkınca her harcama bir hakkın bütçesine bağlı; kalan sert sınır Pika ön ödemeli bakiyesi.

**Geçiş sırası (deploy günü):** deploy'dan ÖNCE sahip panelden kendine ve `Emir`'e hak tanımlar (`Sena`'nın hakkı var).
Deploy sonrası hakkı olmayan env hesabı kilitli moda düşer.

**OUT:** hak geçmişi/çoklu hak · kullanıcıya bildirim · fiyat/kredi oranı değişikliği.

## §1 API (`api/src/modules/ai-video/`)
1. Env listesi kaldırılır: `isAiVideoEnvListed`, `aiVideo.userIds` config, `.env.example` satırı ve tüm çağrıları. Etkin hak tek kural:
   `findActiveAiVideoGrant` (kapı, bütçe, gösterim aynı fonksiyonu kullanır).
2. `canUseAiVideo` (`ai-video-access.ts`): minör/bayrak/anahtar kontrolleri aynen; sonra yalnız `findActiveAiVideoGrant !== null`.
3. `assertUnderBudget`: env istisnası kalkar; etkin hak yoksa ya da teklif kalanı aşarsa 403 `AI_VIDEO_BUDGET_EXCEEDED` (mevcut).
4. **Günlük tavan kaldırılır:** `assertUnderCap`, `dailyCapMicro`, `todaySpentMicro` çağrıları ve `AiVideoError.DAILY_CAP` kullanımı silinir.
   `aiVideo.dailyCapUsd` config ve `.env.example` satırı kaldırılır. Eski hata kodu metni mapper'da kalabilir (eski istemci), kod üretilmez.
5. `GET /ai-video/options` yanıtı:
   - `grant`: etkin hak varsa `{ usedCredits, budgetCredits, remainingCredits, expiresAt }`. `usedCredits` YENİ alan
     (`spentMicro`'dan, yukarı yuvarlanır, `budgetCredits`'i geçmez). Yoksa `null`.
   - **Geri uyum (sahadaki vc42 ve öncesi "Bugün {spent} / {cap}" satırını gösteriyor):** `dailyCapCredits` = hak varsa `budgetCredits`,
     yoksa 0; `spentTodayCredits` = hak varsa `usedCredits`, yoksa 0. `dailyCapUsd` / `todaySpentUsd` aynı mantıkla (USD).
     Alanlar D84 ile birlikte kaldırılacak; şimdi silinmez.
   - Eski istemcide `dailyCapCredits = 0` iken "aşım" hesabı Oluştur'u kilitliyorsa (istemci `spent + estimate > cap` yapıyorsa) bunu
     raporla ve hak varken eski istemcide yanlış kilit oluşmadığını doğrula.
6. Testler: etkin hak → kapı açık + bütçe uygulanır; süresi dolmuş/iptal/bitmiş hak → kapı kapalı; hak yok → kapı kapalı
   (env değişkeni tanımlı olsa bile etkisiz); günlük tavan artık reddetmiyor; `usedCredits` yuvarlaması; options geri uyum alanları.

## §2 Web + mobil (maliyet satırı: `web/src/components/shared/AiVideoCostBar.vue`, `mobile/src/components/aiVideo/AiVideoCostBar.tsx`)
1. "Bugün {spent} / {cap} kredi" satırı ve `overCap` (günlük tavan aşımı) mantığı **kaldırılır**.
2. Hak varsa tek satır: **"Kullanılan {used} / {budget} kredi"** + (varsa) " · Bitiş: {tarih}". Eski "Kalan kredi" satırı bunun yerine geçer.
3. Teklif kalan krediyi aşıyorsa (`estimate > remainingCredits`) Oluştur kapalı ve kısa neden: "Kalan kredin bu video için yetmiyor."
   (sunucu yine 403 verir; istemci yalnız erken uyarı).
4. (Hak yoksa form zaten kilitli modda açılır; ayrı satır gerekmez.)
5. i18n: `aiVideo.spentLine` silinir, `aiVideo.grantLine` → "Kullanılan {used} / {budget} kredi", yeni `aiVideo.grantNotEnough`.
   Kullanılmayan anahtar kalmaz. Uzun çizgi yok.

## §3 DoD
- api: `npm run build`, tüm testler, `tsc -p tsconfig.build.json --noEmit`. Şema değişikliği YOK.
- web: `vue-tsc -b` (6 önceden-var dışında yeni hata yok), lint, build.
- mobil: `npm run typecheck`, `npm run lint`; versionCode **43 kalır**.
- **R7:** api diff'i (`ai-video-grant.ts`, `ai-video-access.ts`, `assertUnderBudget`) sahip onayına sunulur, onaysız push yok.
- PLAN/deploy notu: prod `.env`'den `AI_VIDEO_USER_IDS` ve `AI_VIDEO_DAILY_CAP_USD` satırları silinir (sahip, deploy sonrası; okunmadıkları için zararsız).

## §4 Sahip turu
1. Prod env'den `AI_VIDEO_USER_IDS` ve `AI_VIDEO_DAILY_CAP_USD` silinir. Pika bakiyesinin sert sınır olduğunu kabul.
2. 100 kredi tanımlı kullanıcıda form "Kullanılan 0 / 100 kredi · Bitiş: ..." gösteriyor; bir üretimden sonra kullanılan artıyor.
3. Deploy öncesi sahip kendine ve `Emir`'e hak tanımladı; sahip hesabında kredi satırı görünüyor, üretim çalışıyor.
4. Hakkı iptal edilen/süresi dolan kullanıcıda yapay zeka düğmesi kilitli moda düşüyor.

## §5 Ek (sahip 2026-10-31): kişi başı tek eşzamanlı üretim
**Neden:** aynı kullanıcı iki üretimi aynı anda başlatırsa ikisi de kalan krediden geçebiliyordu (C40'tan beri yarış). Tek eşzamanlı
üretim hem kullanım kuralı hem bu yarışın kapanışıdır.
1. `create`: teklif alındıktan sonra, satır oluşturma **tek transaction** içinde ve kullanıcıya özgü kilitle yapılır:
   `SELECT pg_advisory_xact_lock(hashtext('ai-video:' || $userId))` → kullanıcının `ACTIVE_STATUSES` (QUEUED, RUNNING) satırı var mı →
   varsa 409 yeni kod `AI_VIDEO_IN_PROGRESS` ("Bir üretimin zaten sürüyor. Bitince yenisini başlatabilirsin.") → yoksa bütçe kapısı
   (`assertUnderBudget`) **aynı transaction içinde** → satır QUEUED olarak yazılır. Pika gönderimi transaction DIŞINDA (uzun ağ çağrısı kilidi tutmaz).
   Böylece eşzamanlı iki istekten ikincisi ilk satırı görür ve reddedilir; bütçe denetimi de sıraya girer.
2. Sayılan durum yalnız QUEUED/RUNNING. Tamamlanıp indirmesi bekleyen (COMPLETED) üretim yenisini engellemez.
3. İstemci (web + mobil): son üretimlerde QUEUED/RUNNING satır varken Oluştur kapalı, altında aynı metin (i18n `aiVideo.inProgress`).
   Sunucu yine 409 verir; yeni kod iki istemcinin bilinen hata listesine eklenir.
4. Testler: etkin üretim varken 409 ve Pika çağrılmaz; tamamlanmış/başarısız üretim engellemez; transaction + kilit sorgusu çağrılıyor
   (mock); bütçe kapısı kilit içinde.
