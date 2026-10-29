# SPRINT C33: Yapay zeka video, herkese kapalı tanıtım + kredi birimi

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-29).** PM compose (Opus). **api + web + mobil.**
> **R7 (hafif):** `ai-video-access.ts` kapı dosyasına arayüz ipucu eklenir; **sunucu kapısı (`canUseAiVideo` + guard) DEĞİŞMEZ.**
> O dosyanın diff'i sahibe sunulur.

---

## §0 Sahip kararları
1. Yapay zeka düğmesi izin listesi dışındaki **yetişkinlere de görünür ama pasif**: pencere açılır, üretim yapılamaz, harcama ve limit 0.
   **Minörler görmez** (Pika 18+). Bilinçli istisna: "tıklayınca hiçbir şey yapmayan düğme" kuralı; pencere durumu açıkladığı için kabul.
2. Kullanıcıya **dolar değil "kredi"** gösterilir; arka plan dolar (mikro-USD) olarak kalır. Satış/abonelik YOK (şirket kurulana dek,
   hafıza kuralı); bu sprint yalnız görünen birimi değiştirir.

## §1 Kredi birimi (api)
1. Yapılandırma: `AI_VIDEO_CREDIT_MICRO_USD` (varsayılan `10000`, yani **1 kredi = 0,01 $**). Tek dönüştürücü yardımcı:
   `credits = ceil(microUsd / creditMicroUsd)` (kullanıcı aleyhine yuvarlama yok sorusu: tahmin ve tavan aynı yardımcıdan geçer, tutarlı).
2. DB alanları DEĞİŞMEZ (`costMicroUsd` vb.). Defter/tavan mantığı dolar üzerinden çalışmaya devam eder.
3. İstemciye giden her tutarın **kredi karşılığı eklenir**: tahmin, bugünkü harcama, günlük tavan, geçmiş listesindeki maliyet
   (`estimateCredits`, `spentTodayCredits`, `dailyCapCredits`, `costCredits`; dev mevcut DTO adlarına paralel isimlendirir).
   **USD alanları kalır** (sahadaki eski mobil sürümler okuyor); yeni istemciler yalnız kredi alanlarını kullanır. USD alanlarının
   kaldırılması PLAN borç tablosuna yazılır (vc39 yaygınlaşınca).
4. Tavan aşımı hata mesajları kredi diliyle (Türkçe, `message`).

## §2 Pasif tanıtım (api, R7 hafif)
1. `ai-video-access.ts`'e ikinci fonksiyon: `canPreviewAiVideo(config, user) = !user.isMinor && aiVideo.enabled === true`.
   `canUseAiVideo` ve guard **aynen**. Oturum DTO'suna `aiVideoPreview` (mevcut `aiVideoAllowed` ile aynı yoldan).
2. Kilitli kullanıcı hiçbir yapay zeka ucunu çağırmaz (istemci kuralı); çağırırsa sunucu bugünkü gibi reddeder.
3. Test: minör → preview false · bayrak kapalı → false · yetişkin listede değil → preview true, allowed false · guard davranışı değişmedi.

## §3 Web + mobil
1. Düğme: `aiVideoAllowed || aiVideoPreview` ise görünür (web `AiVideoButton.vue`, mobil karşılığı; ek kaynak seçicisindeki giriş dahil).
2. Kilitli mod (`aiVideoPreview && !aiVideoAllowed`): pencere/ekran açılır, form görünür ama **devre dışı**; maliyet çubuğunda
   "Bugün 0 / 0 kredi", Oluştur kapalı, altında not: **"Yapay zeka ile video yakında herkese açılacak."** Tahmin, geçmiş, yükleme
   uçlarına **hiç istek atılmaz** (403 gürültüsü yok); geçmiş listesi gösterilmez.
3. Tüm kullanıcılar için (izinli dahil) tutarlar **kredi** ile: "45 kredi", "Bugün 120 / 300 kredi". `formatUsd` gösterimleri kredi
   biçimleyiciyle değişir (TR sayı biçimi, binlik nokta). Dolar işareti arayüzde kalmaz.
4. Metinler i18n'de, em dash yok. Mobil metinler `web/src/i18n/tr.json`'dan.

## §4 DoD
- api: build, ilgili jest + tam koşu, `npx eslint` değişen dosyalar. web: `vue-tsc -b` (bilinen 6), `vite build`, eslint. mobil: typecheck + lint,
  `app.json` versionCode 38 → 39.
- R7: `ai-video-access.ts` diff'i sahibe.
- **Sahip turu:** izin listesi dışı yetişkin hesapla düğme görünür, pencere açılır, 0 kredi, Oluştur kapalı, not görünür, ağda yapay zeka
  isteği yok · minör test hesabında düğme yok · sahip hesabında tutarlar kredi, üretim çalışıyor, tavan kredi diliyle.

**OUT:** kredi satışı/paketler/Play Billing · kullanıcı başına bakiye · USD alanlarının kaldırılması · izin listesinin genişletilmesi.
