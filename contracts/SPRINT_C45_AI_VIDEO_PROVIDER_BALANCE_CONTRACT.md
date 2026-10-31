# SPRINT C45: Admin paneli: Pika bakiyesi (USD + kredi karşılığı)

> Durum: **TASARIM KİLİTLİ (2026-10-31).** PM compose (Opus). Sahip isteği ("sürekli Pika'yı açıp bakmaktan yoruldum").
> **api + web (admin)**. Mobil yok. R7-nötr (salt okuma, yalnız platform admini; kapı/bütçe kararı yok).

## §0 Kaynak
Pika `GET /billing/balance` (ücretsiz, `X-API-Key`). Yanıt (`BillingBalanceResponse`): `balance_micro_usd` (harcanabilir toplam =
ön ödemeli + hediye kredi), `prepaid_micro_usd`, `credit_micro_usd`, `postpaid` (null = düz ön ödemeli). Birim mikro-USD.
Kredi karşılığı mevcut oran: `aiVideo.creditMicroUsd` (varsayılan 10000 = 0,01 $ / kredi).

## §1 API
1. `PikaClient.getBalance(): Promise<{ balanceMicroUsd: number }>` (`GET /billing/balance`). Anahtar yalnız başlıkta; hata
   mesajı anahtar içermez (mevcut `fail` kalıbı).
2. `GET /admin/ai-video/balance` (yeni küçük controller ya da grants controller'a uç; `JwtAuthGuard + PlatformAdminGuard`, grants ile aynı).
   Yanıt:
   ```jsonc
   { "balanceUsd": 41.27, "balanceCredits": 4127,          // kredi aşağı yuvarlanır
     "outstandingCredits": 230,   // etkin hakların kalan kredilerinin toplamı (verilmiş ama harcanmamış)
     "fetchedAt": "2026-10-31T..." }
   ```
   `outstandingCredits`: iptal edilmemiş hakların `max(0, bütçe - kullanılan)` toplamı; kullanılan = mevcut `spentSinceMicro` kuralı
   (kopyalama). Sağlayıcıya ulaşılamazsa 503 `AI_VIDEO_PROVIDER_ERROR` (mevcut kod, Türkçe mesaj); `outstandingCredits` yine de döner mü:
   HAYIR, tek uç tek hata (sade).
3. 60 sn bellek önbelleği (tek instance, C14b teklif önbelleği deseni); panel her açılışta Pika'yı dövmesin. Yanıtta `fetchedAt` önbellekteki an.
4. Testler: dönüşüm (mikro-USD → USD, kredi aşağı yuvarlama), outstanding toplamı (iptal hariç, bitmiş = 0), önbellek, Pika hatası 503,
   admin olmayana 403.

## §2 Web (`web/src/views/settings/components/PlatformAiAccessSection.vue`, admin "Yapay zeka" sekmesi)
1. Hak listesinin üstünde tek kart:
   - Büyük satır: **"Pika bakiyesi: 41,27 $ · 4.127 kredi"** (TR sayı biçimi, `Intl` / mevcut `n()`).
   - Alt satır: **"Kullanıcılara verilmiş, henüz harcanmamış: 230 kredi"**.
   - `outstandingCredits > balanceCredits` ise alt satır uyarı renginde (`--kv-danger` değil, uyarı tonu varsa o; yoksa danger) ve ek metin:
     "Bakiye verilen kredileri karşılamıyor."
   - Sağda küçük "Yenile" düğmesi (önbellek yüzünden en fazla 60 sn bayat olabileceğini belirten küçük not: "Son güncelleme: 18.42").
   - Hata: "Bakiye alınamadı." + Yenile.
2. Metinler i18n (`admin.aiAccess.balance.*`), uzun çizgi yok, saat TR biçimi "18.42".

## §3 DoD
api build + tüm testler + `tsc -p tsconfig.build.json --noEmit`; web `vue-tsc -b` (6 önceden-var) + dokunulan dosyalarda eslint + `vite build`.
Sahip turu: panelde bakiye Pika paneliyle aynı; bir üretimden sonra Yenile ile düşüyor (en geç 60 sn).

## §4 OUT
Bakiye düşük uyarısı/bildirimi, otomatik yükleme, geçmiş grafiği.
