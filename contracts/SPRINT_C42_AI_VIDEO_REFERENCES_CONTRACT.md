# SPRINT C42: Yapay zeka video: çoklu referans (görsel + video + ses) ve @ etiketleme

> Durum: **TASARIM KİLİTLİ (2026-10-31).** PM compose (Opus). Sahip isteği (kullanıcı revizesi). **api + web + mobil (JS)**, mobil vc43.
> C14 / C14b / C14f / C40'ta yazılan her şey aynen geçerli (erişim kapısı, yoklayıcı, harcama kaydı, tavan, bütçe, ölçü).
> R7-nötr: auth ve T&S karar fonksiyonuna dokunulmaz. C40 bütçe kapısı (`assertUnderBudget`) **değişmez**, yalnız yeni teklifle çağrılır.
> Deneysel, erişim C14 kapısıyla aynı (sahip + açık liste + C40 hak sahipleri).

## §0 Kaynak ve kararlar

### Sağlayıcı (doğrulandı 2026-10-31)
- Uç: `alibaba/wan3.0-video/omni-video` (`https://api.dev.pika.art/openapi.json` → `WanOmniVideoRequest`;
  belge `https://dev.pika.art/llms/alibaba/wan3.0-video/omni-video`).
- Gövde: `prompt`, `resolution`, `ratio`, `duration`, `audio`, `watermark`, `reference_image_urls` (≤10),
  `reference_video_urls` (≤5), `reference_audio_urls` (≤5). `additionalProperties: false`.
  **İlk kare (`first_frame_url`) bu uçta YOK**: iki kip ayrı istek türü, karıştırılamaz.
- En az bir referans şart (`omni-video requires at least one reference input`).
- İstemde atıf: "görseller ve videolar kendi türü içinde ayrı numaralanır (`Image 1`, `Video 1`), ekleme sırasıyla".
  Ses için yazım belgede yok; varsayım `Audio 1` (§4 sahip turunda sınanır).
- Yükleme: `POST /v1/media/uploads` görsel, ses **ve video** kabul eder (mevcut `PikaClient.createUpload/putUpload`).
- **Teklif davranışı (ücretsiz `quote` ile sınandı):** görsel ve ses girdisi fiyatı değiştirmez. Video girdisi varsa,
  video sayısından ve gerçek süreden bağımsız olarak **15 sn girdi videosu** fiyatlanır (720p 5 sn: 0,325 $ → 1,30 $;
  480p 10 sn: 0,8125 $). Kesin ücret iş bitince `billing.settled` ile gelir (mevcut akış). Sonuç: teklif ve tahmin için
  yalnız "video var mı" bilgisi yeter, gerçek süre ve adres gerekmez (yer tutucu adres gider, C14 deseni).

### Sahip kararları (2026-10-31)
1. **Model bilgisi formdan kalkar.** Tek model açık (Wan 3.0); kullanıcıya model adı ve "sesli" etiketi gösterilmez.
   Birden çok model açılırsa seçici geri gelir (env ile), yani kod silinmez, tek modelde görünmez.
2. **Görsel dışında video ve ses** de eklenebilir.
3. **@ etiketleme:** istem kutusunun sağ alt köşesinde `@` düğmesi + yazarken `@` ile açılan liste.
4. **Sınırlar (bizim tavanımız, sağlayıcınınkinden küçük):** 4 görsel, 2 video, 2 ses.
   Video tek tek ≤ 15 sn **ve toplam ≤ 15 sn** (teklifin varsaydığı üst sınır; aşarsa kesin ücret teklifi geçebilir).
   Ses tek tek ≤ 30 sn. Boyut: görsel 10 MB (mevcut), video 50 MB, ses 10 MB.

### Kip kuralı (PM kararı)
- **Yalnız 1 görsel, video ve ses yok** → mevcut görselden video (`image-to-video`, `first_frame_url`). Bugünkü
  "görseli hareketlendir" davranışı korunur; görsel videonun ilk karesi olur.
- **Başka her bileşim** (2+ görsel, ya da herhangi bir video/ses) → `omni-video`; dosyalar referanstır, ilk kare değildir.
- Bu ayrım ekranda **sessiz değil**: ek listesinin altında tek satır açıklama (§3.4).

**OUT:** Seedance ve diğer modeller (ayrı karar) · referansa ad verme/yeniden adlandırma · `file_url` / `web_url` ·
1080p · ses aç/kapa · son kare · Wan `auto` süre · içinde çip gömülü zengin metin kutusu · kredi/fiyat modeli değişikliği.

## §1 API

### 1.1 Model tablosu (`ai-video.models.ts`, tek kaynak)
`AiVideoModelSpec`'e eklenir:
```ts
references: {
  apiFunction: string;              // 'omni-video'
  fields: { image: string; video: string; audio: string }; // gövde alan adları
  max: { image: number; video: number; audio: number };    // bizim tavanımız (§0.4)
  videoTotalMaxS: number;           // 15
  videoMaxS: number;                // 15
  audioMaxS: number;                // 30
  aspectRatios: string[];           // omni ölçüleri: 16:9, 9:16, 1:1, 4:3, 3:4
} | null;
```
Wan: yukarıdaki değerler, alanlar `reference_image_urls` / `reference_video_urls` / `reference_audio_urls`. Pika ve Kling: `null`.
`apiIdOf(spec, mode)` üç kipi bilir: `'text' | 'image' | 'reference'` (`reference` → `${apiBase}/${references.apiFunction}`).
Mevcut `withImage: boolean` imzası kaldırılır, tüm çağrılar kipe çevrilir. `modelKeyOfApiId` öneke baktığı için değişmez.

### 1.2 Girdi yükleme (`POST /ai-video/input/presign`, imza aynı)
- `AI_INPUT_TYPES` türe göre genişler (tek tablo, tür bilgisiyle):
  - görsel: `image/png`, `image/jpeg`, `image/webp` → 10 MB
  - video: `video/mp4`, `video/quicktime`, `video/webm` → 50 MB
  - ses: `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/wav`, `audio/ogg`, `audio/webm` → 10 MB
- Hata mesajı türe göre (i18n'li istemci mesajı yok, sunucu Türkçe mesaj döner, mevcut `UNSUPPORTED_TYPE` / `FILE_TOO_LARGE`).
- Anahtar biçimi aynı (`ai-input/{userId}/{uuid}.{ext}`), uzantı listesi tablodan.
- **Adım 0 (dev, ücretsiz):** her video/ses içerik türü için `createUpload` dener; Pika reddeden türü listeden çıkarır ve
  PR notuna yazar. Liste sözleşmenin üst sınırıdır, daraltılabilir, genişletilemez.

### 1.3 DTO (geriye uyumlu; vc42 ve öncesi mobil istemciler sahada)
- `EstimateAiVideoDto`: mevcut `withImage` kalır. Eklenir: `referenceKinds?: ('image'|'video'|'audio')[]` (en çok 8).
  Verilmişse kip `reference`, `withImage` yok sayılır. Önbellek anahtarı `hasVideo`'yu içerir (fiyat yalnız ona bağlı, §0).
- `CreateAiVideoDto`: mevcut `inputKey` kalır. Eklenir: `references?: { kind: 'image'|'video'|'audio'; key: string }[]`
  (sıra = istemdeki numara sırası, türü içinde).
  - `inputKey` ile `references` birlikte → 400 `AI_VIDEO_INVALID_OPTION`.
  - `references` yalnız tek görselden ibaretse de **kabul edilir ve omni'ye gider** (sunucu kip kuralını dayatmaz;
    kural istemcide, §3.4). Boş dizi → 400.
  - Sayı tavanı (`max`), tür ↔ uzantı uyumu, her anahtar için `assertInputKey` (sahiplik + var + boyut).
  - **Süre denetimi sunucuda:** video ve ses için `ffprobe` (mevcut `shared/media/run-binary.ts`) ile süre okunur;
    `videoMaxS`, `videoTotalMaxS`, `audioMaxS` aşılırsa 400, yeni kod `AI_VIDEO_INPUT_TOO_LONG`
    (mesaj: "Video en fazla 15 saniye, sesler en fazla 30 saniye olabilir."). Okunamayan dosya → 400 `INVALID_STORAGE_KEY`.
  - Ölçü: kip `reference` ise `references.aspectRatios` içinden doğrulanır (C14f deseni).

### 1.4 İstemde etiket çevirisi (sunucu, tek fonksiyon, birim testli)
- Etiket biçimi: `@Görsel<n>`, `@Video<n>`, `@Ses<n>` (n ≥ 1, türü içindeki sıra). Büyük/küçük harf duyarsız eşleşir.
- Omni: `@Görsel2` → `Image 2`, `@Video1` → `Video 1`, `@Ses1` → `Audio 1`.
- Görselden video kipi (`inputKey`): `@Görsel1` → `görsel` (tek görsel var, modele numara anlamsız).
- Var olmayan referansa etiket (`@Video3`, 1 video varken) → 400 `AI_VIDEO_INVALID_OPTION`.
- Etiketsiz referans serbest (model yine görür).
- **Satırda kullanıcının yazdığı istem saklanır** (`prompt` alanı, etiketli hali); çeviri gövde kurulurken yapılır
  (kurtarma/yeniden deneme aynı sonucu üretir). `AI_PROMPT_MAX` (1000) etiketli metne uygulanır.

### 1.5 Gönderim
- Teklif: kip `reference` ise gövde yer tutucu adreslerle kurulur (her tür için gönderilen sayıda), yani kullanıcı dosyası
  teklife gitmez. Tavan + C40 bütçe aynı sırayla.
- `submitBody`: satırdaki referansları sırayla `uploadToPika` ile yükler, adresleri ilgili alanlara dizi olarak koyar.
  `uploadToPika` içerik türünü uzantı tablosundan alır, boyut sınırı türe göre.
- Ses açık (`audio` alanı Wan'da varsayılan `true`, gönderilmez; değişiklik yok).

### 1.6 Şema (additive)
- `AiVideoGeneration.references Json?` (`[{ kind, key }]`; null = referans yok). Migration üretilir **ve DB'ye uygulanır**
  (`prisma migrate status` temiz), push öncesi `prisma generate` + `tsc -p tsconfig.build.json`.
- Silme (`ai-video-delete.service.ts`): `inputKey`'e ek olarak tüm `references[].key` silinir (her biri `safely`).
- Mapper: `hasInput` = `inputKey !== null || references dolu`. Yeni alan istemciye dönmez (OUT: listede referans önizlemesi).

### 1.7 `GET /ai-video/options`
Model öğesine `references: { max, videoTotalMaxS, videoMaxS, audioMaxS, aspectRatios, inputTypes: { image, video, audio } } | null`.
İstemci sınırları ve kabul edilen türleri **buradan** okur, sabit liste tutmaz.

### 1.8 Testler
Etiket çevirisi (omni, görsel kipi, eksik referans 400, büyük/küçük harf); kip seçimi ve `apiIdOf`; `inputKey`+`references` 400;
sayı tavanı; süre tavanı (ffprobe sahte); toplam video süresi; teklifte yer tutucu adres (kullanıcı anahtarı teklife gitmez);
gövdede alan adları tablodan; silmede tüm referans anahtarları; `options` yanıtında `references`.

## §2 Model bilgisinin kaldırılması (web + mobil)
- Açık model sayısı 1 ise: model etiketi, "sesli/sessiz" satırı ve seçici **render edilmez**. İstek yine `model` alanını
  `options`'taki tek anahtarla gönderir.
- Birden çok model açıksa mevcut seçici aynen kalır.
- Kullanılmayan i18n anahtarı kalırsa silinir (tek model durumunda kullanılan metin yoksa).

## §3 Form (web `AiVideoOptions.vue` / `useAiVideoForm.ts` ve ilgili; mobil `mobile/src/components/aiVideo/*`)
1. **Ekle düğmesi:** mevcut "görsel ekle" yerine tek "Dosya ekle" (görsel, video, ses). Web: tek `<input type=file multiple>`,
   `accept` `options.references.inputTypes`'tan. Mobil: görsel ve video `expo-image-picker` (`mediaTypes` görsel+video),
   ses `expo-document-picker` (`audio/*`). Yeni native modül YOK (ikisi de kurulu).
2. **Ek şeridi:** istem kutusunun üstünde yatay küçük kartlar: görselde küçük resim, videoda ilk kare + süre,
   seste simge + süre. Her kartın köşesinde etiket adı (`Görsel1`, `Video1`, `Ses1`) ve kaldır düğmesi.
   Sayaç: "2/4 görsel · 1/2 video · 0/2 ses" (sınır dolunca o tür seçilemez, açıklamalı).
3. **İstemci ön denetimi:** tür, boyut, video/ses süresi (web: `<video>/<audio>` meta verisi; mobil: picker'ın `duration`'ı)
   ve toplam video süresi. Sunucu yine denetler (§1.3); istemci denetimi yalnız erken uyarı.
4. **Kip açıklaması** (ek şeridinin altında, i18n):
   - tek görsel: "Video bu görselden başlar."
   - diğer: "Eklediklerin videoda referans olarak kullanılır. İstemde @ ile hangisini nerede istediğini belirt."
   Ölçü listesi kipe göre (`image` ya da `references.aspectRatios`), C14f kuralları geçerli.
5. **@ etiketleme:**
   - İstem kutusu **düz metin** kalır (`textarea` / `TextInput`). Zengin metin, gömülü çip YOK.
   - Sağ alt köşede `@` düğmesi: imleç konumuna `@` ekler ve listeyi açar. Hiç ek yoksa düğme pasif, ipucu "Önce dosya ekle".
   - Yazarken `@` girilince eklenen dosyaların listesi açılır (küçük resim + ad); seçilen `@Görsel1 ` olarak eklenir.
     Web: sohbetteki `useMentionAutocomplete` + `ComposerBar.vue` açılır liste kalıbı örnek alınır (üye listesine bağlı olduğu
     için doğrudan yeniden kullanılamayabilir; ortaklaştırma yalnız gerçekten sade çıkarsa, Rule of Three). Mobilde @bahsetme
     otomatik tamamlaması **yok**: istem kutusunun hemen üstünde açılan basit bir liste (alt sayfa değil) yazılır.
   - Web'de etiketler istem kutusunda renkli görünür (arka plan katmanı yöntemi yeterli; yapılamıyorsa düz metin kabul).
     Mobilde renklendirme OUT.
   - **Ek kaldırılınca:** o eke ait etiketler istemden silinir, aynı türdeki sonraki eklerin numarası ve etiketleri bir azalır.
6. **Maliyet satırı:** tahmin `referenceKinds` ile istenir; video varken altında kısa not (i18n):
   "Girdi videosu da ücretlendirilir. Tahmin en yüksek tutardır, gerçek ücret video süresine göre daha az olabilir."
7. **Kural notu** (dosya eklendiyse, ek şeridinin altında küçük metin, i18n):
   "Başkasının yüzünü veya sesini izni olmadan kullanma."
8. Yükleme: her ek seçilince presign + PUT (mevcut görsel akışı), yüklenmeden "Oluştur" pasif; yükleme hatası kartta görünür.
9. Tek görsel kipinde istek mevcut `inputKey` ile, diğerlerinde `references` ile gider (§0 kip kuralı).

## §4 DoD
- api: `npm run build`, testler yeşil, migration uygulandı (`migrate status` temiz), `prisma generate` + `tsc -p tsconfig.build.json`.
- web: `vue-tsc -b` (bilinen 6 önceden-var hata dışında yeni hata yok), lint; i18n'de kaçırılmamış `@` YOK
  (`{'@'}` kaçışı; `@Görsel1` örnekleri metinde geçiyorsa şart, aksi halde sayfa boş gelir).
- mobil: `npm run typecheck`, `npm run lint`; `app.json` versionCode 42 → 43.
- **Sahip turu (ücretli, 480p 5 sn ile):**
  1. Model adı formda görünmüyor (web + mobil).
  2. Tek görsel → video görselden başlıyor (eski davranış).
  3. 2 görsel + `@Görsel2 telefon ekranında` gibi istem → ikinci görsel doğru yerde.
  4. 1 video referans → teklif yükseliyor, not görünüyor; kesin ücret teklifin altında.
  5. 1 ses + `@Ses1` → ses kullanılıyor (`Audio 1` varsayımının sınaması; tutmazsa PM'e döner, yazım düzeltilir).
  6. Ek kaldırınca istemdeki etiketlerin yeniden numaralanması.
  7. 16 sn video ve 5. görsel reddediliyor (istemcide ve sunucuda).
  8. vc42 mobil (eski istemci) ile görselden video hâlâ çalışıyor (geri uyum).

## Ek 2026-11-22: model başına referans kuralları (Seedance 2.5)

Sahip isteği: her model sağlayıcının kabul ettiği kadar referans alır. `AiVideoReferenceSpec`e eklenen alanlar,
hepsi model tablosundan gelir, servis model adına göre dallanmaz:

- `audioTotalMaxS` (seslerin toplamı), `minS` (video/ses en kısa süresi, 0 = yok).
- `inputTypes?` türe göre izinli içerik türleri; verilmeyen tür genel tabloyu kullanır.
- `tagFormat` istem etiketinin sağlayıcı yazımı: Wan `{Kind} {n}` (`Image 2`), Seedance `@{Kind}{n}` (`@Image2`).
- `GET /ai-video/options` → `references` içinde `audioTotalMaxS` ve `minS` (eklemeli; eski istemci yok sayar),
  `inputTypes` artık modele göre.
- Yeni hata kodları: `AI_VIDEO_INPUT_TOO_SHORT`, `AI_VIDEO_INPUT_TYPE`. `AI_VIDEO_INPUT_TOO_LONG` mesajı artık
  modelin sınırını yazar; istemciler bu üç kodda sunucunun Türkçe mesajını gösterir.
- İstek başına referans tavanı `AI_REFERENCES_MAX` = 50.

| Model | Uç | Görsel / video / ses | Video | Ses | En kısa |
|---|---|---|---|---|---|
| Wan 3.0 | `omni-video` | 10 / 5 / 5 | tekil 15, toplam 15 sn | tekil 30 sn | yok |
| Seedance 2.5 | `reference-to-video` | 30 / 10 / 10 | mp4, mov; tekil 30, toplam 30 sn | wav, mp3; tekil 30, toplam 30 sn | 2 sn |
| Kling 4.0 | `omni-video` (`contents` dizisi, `body: contents`) | 4 / 1 / 0 (güvenli başlangıç, canlıda sınanacak) | mp4, mov; 3-10 sn | yok | 3 sn |
| Veo 3.1 Fast | yok (yalnız metinden) | yok | | | |
