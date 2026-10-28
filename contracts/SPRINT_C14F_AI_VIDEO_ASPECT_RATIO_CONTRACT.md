# SPRINT C14f: Yapay zeka video: ölçü (en-boy oranı) seçimi + Wan'a 25 sn

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). Sahip isteği. **api + web + mobil (JS)**, mobil vc35.
> Deneysel, erişim C14 kapısıyla aynı (sahip + iki hesap). R7-nötr (auth/T&S kararı yok).
> C14b §0 OUT'taki "oran (aspect ratio) seçimi" maddesini **bu sözleşme açar**.

## §0 Kaynak (sağlayıcı belgesi, 2026-10-28)
`https://dev.pika.art/llms/<apiBase>/<text-to-video|image-to-video>` "Accepted values" tabloları:

| Model | Alan | Yazıdan video | Görselden video | Süre |
|---|---|---|---|---|
| `pika-2.5` | `aspect_ratio` | 16:9, 9:16, 1:1, 4:3, 4:5, 5:2 | **alan yok** | 5, 10 |
| `wan-3.0` | `ratio` | 16:9, 9:16, 1:1, 4:3, 3:4 | aynısı | 2-30 serbest |
| `kling-3.0-turbo` | `aspect_ratio` | 16:9, 9:16, 1:1 | **alan yok** | 3-15 |

**Sahip kararı (2026-10-28): ölçü kümesi Wan'ınkidir** (16:9, 9:16, 1:1, 4:3, 3:4). Pika'nın 4:5 ve 5:2'si
SUNULMAZ. Her model bu kümeden yalnız desteklediğini sunar → model tablosuna girecek listeler:
Pika text `16:9, 9:16, 1:1, 4:3` · Wan text/image `16:9, 9:16, 1:1, 4:3, 3:4` · Kling text `16:9, 9:16, 1:1` · Pika/Kling image `[]`.
§2.4'teki `4:5` ve `5:2` etiketleri eklenmez.

Wan'ın `adaptive` değeri ve Pika'nın "alanı gönderme" davranışı bizde tek kavram: **Otomatik** = alan gövdeye HİÇ eklenmez
(model seçer). Wan için `adaptive` göndermek yerine alanı atlamak da varsayılanı (`adaptive`) verir.

## §1 API
1. `AiVideoModelSpec`'e (`ai-video.models.ts`, tek kaynak) eklenir: `aspectField: string`, `aspectRatios: { text: string[]; image: string[] }`
   (§0 tablosu birebir; Pika/Kling `image: []`). Wan `durations`: `[5, 10, 15, 20, 25, 30]`.
2. `buildPikaBody` opts'a `aspectRatio?: string`; verilmişse `[spec.aspectField]: aspectRatio` eklenir, yoksa alan yok.
3. `EstimateAiVideoDto` ve `CreateAiVideoDto`: `aspectRatio?: string` (`@IsOptional @IsString @MaxLength(10)`).
   Doğrulama `resolveSpec` yanında: verilmişse `withImage`'a göre `aspectRatios.image` ya da `.text` içinde olmalı,
   değilse mevcut `AI_VIDEO_INVALID_OPTION` (400). Görselden üretimde boş listeli modelde ölçü gönderilirse de 400.
4. Şema (additive): `AiVideoGeneration.aspectRatio String?` (null = Otomatik). Migration üretilir **ve DB'ye uygulanır**
   (`prisma migrate status` temiz). Gönderim, kurtarma, yeniden deneme yolları gövdeyi satırdan kurarken `aspectRatio`'yu da taşır
   (`ai-video.service.ts` ~186 `opts` dahil, tüm `buildPikaBody` çağrıları).
5. `GET /ai-video/options` model öğesine `aspectRatios: { text, image }` eklenir. Satır DTO'suna (`ai-video.mapper.ts`) `aspectRatio: string | null`.
6. Teklif önbelleği anahtarı `aspectRatio`'yu içerir (farklı ölçü farklı teklif olabilir).
7. Testler: gövdeye alan doğru adla girer / Otomatik'te girmez; geçersiz ölçü 400; görselli Pika'da ölçü 400; Wan 25 kabul.

## §2 Web (`web/src/components/shared/AiVideoOptions.vue` ve ilgili) ve mobil (`mobile/src/components/aiVideo/*`)
1. Süre ve çözünürlüğün yanına **Ölçü** seçimi, mevcut seçici kalıbıyla (mobilde `Segmented`). İlk seçenek **Otomatik** (varsayılan).
2. Liste seçili modelin ve görsel var/yok durumunun listesidir (`options` yanıtından; istemcide sabit liste YOK).
   Model ya da görsel değişince seçili ölçü yeni listede yoksa Otomatik'e döner.
3. Görselden üretimde liste boşsa seçici **gizlenmez**: yalnız Otomatik seçili ve kilitli görünür, altında kısa açıklama
   (i18n: "Ölçü görselden alınır"). Sessiz gizleme yok.
4. Etiketler i18n'den: `16:9 Yatay`, `9:16 Dikey`, `1:1 Kare`, `4:3`, `3:4`, `4:5 Dikey gönderi`, `5:2 Geniş`. Bilinmeyen değer gelirse
   oranın kendisi yazılır (yeni sağlayıcı değeri arayüzü kırmaz).
5. Teklif (`estimate`) ve oluşturma isteği `aspectRatio`'yu gönderir (Otomatik'te alan yok). Teklif ölçü değişince yenilenir.
6. Son üretimler listesi/önizlemede ölçü gösterilmesi **OUT** (sadece seçim).
7. 25 sn ayrıca kod istemez: süre listesi sunucudan geliyor; kontrol et, sabit liste varsa kaldır.

**OUT:** 1080p · ses aç/kapa · Wan `auto` süre · son-kare (`last_frame_url`) · fiyatlandırma/kredi değişikliği.

## §3 DoD
- api: `npm run build`, testler yeşil, migration uygulandı (`migrate status` temiz).
- web: `vue-tsc -b` (bilinen 6 önceden-var hata dışında yeni hata yok), lint.
- mobil: `npm run typecheck`, `npm run lint`; `app.json` versionCode 34 → 35.
- Sahip turu: her modelde ölçü listesi doğru; 9:16 ile üretilen video dikey çıkar; görsel seçince Pika/Kling'de kilitli Otomatik;
  Wan'da 25 sn seçilebilir ve teklif gelir.
