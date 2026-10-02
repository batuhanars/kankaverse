# Sprint M6a — Mobil sohbet baloncukları

> **Kaynak:** sahip önerisi 2026-10-02 (dışarıdan gelen tasarım önerisi: "WhatsApp gibi sağlı sollu").
> **Tier:** yalnız `mobile/`. `api/` ve `web/` diffi SIFIR. Masaüstü/web düz liste olarak KALIR.
> **Kapsam:** mesaj satırının görsel düzeni. Yeni uç, yeni DTO, yeni bağımlılık, native diff YOK.
> Saf JS: mevcut dev build yeterli, yeni APK gerekmez.
> **R7:** dokunulmuyor.
> **Kapsam dışı:** R8 (D68) bu sprintte YOK. Sesli mesaj (M6b) ve video (M6c) ayrı sözleşmeler.

---

## §0 Mevcut durum (PM koddan doğruladı)

- Tek bileşen: `mobile/src/components/MessageBubble.tsx` (adı "Bubble" ama düz Discord satırı:
  solda avatar, üstte ad + saat, altında metin). Tek çağıran `MessageScreen.tsx:386`.
- Gruplama `useMessageListController.ts:45` `showAuthor`: gün başı / ilk mesaj / yazar değişti /
  5 dk'dan uzun ara. **Bu mantık değişmez**, baloncuk öbeklemesi aynı bayrağı kullanır.
- `MessageScreen` üç ekranda: ortam kanalı (`channel/[id].tsx`), 1-1 DM ve grup DM (`dm/[id].tsx`,
  `isGroupDm` `:78`). Okundu göstergesi yalnız 1-1 DM'de geliyor (`receiptFor`).

## §1 Yeni token

`theme/tokens.ts` → `colors.bubbleOwn: '#4A2C22'`. Kaynak tasarım kataloğuna PM tarafından eklendi
(`kankaverse-design-tokens.md` → `bubble-own`, "yalnız mobil"). Yorumda kaynağı yaz. Başka yeni
renk YOK. Karşı tarafın baloncuğu mevcut `bgElevated`.

## §2 Düzen

| | Kendi mesajım | Karşı taraf |
|---|---|---|
| Hizalama | sağ | sol |
| Zemin | `bubbleOwn` | `bgElevated` |
| Avatar | yok | **ortam kanalı + grup DM:** öbek başında (`showAuthor`) 34px avatar, öbeğin devamında aynı genişlikte boşluk (baloncuklar hizalı kalsın). **1-1 DM:** yok |
| Yazar adı | yok | **ortam kanalı + grup DM:** öbek başında baloncuğun İÇİNDE ilk satır (`fontSize.xs`, 600, `textSecondary`), dokunulabilir (`onPressAuthor`). **1-1 DM:** yok |

- Baloncuk en fazla satır genişliğinin **%80**'i; kısa mesajda içeriği kadar daralır.
- Köşe `radius.lg`. Öbeğin İLK baloncuğunda gönderen tarafın üst köşesi `radius.sm` (kuyruk
  yerine sade işaret). Kuyruk/SVG çizilmez.
- Boşluk: öbek içi baloncuklar arası 2px, yeni öbek 8px. Ekran yan boşluğu mevcut `layout.panelGap`.
- İç dolgu yatay 10, dikey 6.

**Ekran bilgisi:** `MessageBubble`/`MessageScreen`'e tek bir prop: `showIdentity: boolean`
(avatar + ad gösterilsin mi). `dm/[id].tsx` 1-1 DM'de `false`, grup DM'de `true`; kanal ekranı
`true` (varsayılan). `receiptFor` üzerinden ÇIKARIM YAPMA, açık prop.

## §3 Baloncuk içi sıra (yukarıdan aşağı)

1. Yazar adı (§2 koşuluyla)
2. Sabitlendi rozeti (mevcut)
3. Yanıt alıntısı: baloncuk içinde, solda 3px dikey çizgi (`accent500`), hafif koyu zemin
   (`bgOverlay` değil; `borderSubtle` dolgulu blok), yazar + tek satır metin (mevcut kurallar)
4. Metin (mevcut bahsetme bölme mantığı korunur)
5. Ekler (`AttachmentView`, mevcut). Ek-yalnız mesajda baloncuk iç dolgusu 4px'e iner
6. **Meta satırı**, sağa yaslı, metnin altında: `düzenlendi` (varsa) + saat + okundu ikonu (varsa).
   Saat artık üst satırda DEĞİL, her baloncukta. `fontSize.xs`, `textMuted`

**Tepkiler baloncuğun DIŞINDA**, hemen altında, baloncuğun hizasında (kendi mesajımda sağa,
karşıda sola yaslı). Mevcut pill stili değişmez.

## §4 Kor zemin üstünde Kor çakışmaları (kendi baloncuğumda)

`accent500` `bubbleOwn` üstünde ~4.4:1 (AA sınırının altı). Kendi baloncuğumda:

- **Bahsetme:** metin `accent400`, zemin YOK (`accentSubtle` bu zeminde görünmez). Karşı tarafın
  baloncuğunda mevcut stil (`accent500` + `accentSubtle`) aynen kalır.
- **Okundu "görüldü":** `accent400` (gönderildi: mevcut `textMuted`).
- **Yanıt alıntısı çizgisi + sabitlendi rozeti:** `accent400`.
- **Meta/saat:** `textSecondary` (`textMuted` bu zeminde fazla siliniyor).

Gövde metni her iki baloncukta `textPrimary`.

## §5 Korunan davranışlar (regresyon listesi)

- Uzun basış → mesaj paneli: baloncuğa basınca açılır (satırın boş tarafına basınca açılmaması
  kabul edilebilir).
- Avatar/ad dokunuşu → profil alt-paneli (yalnız gösterildiği yerde).
- Atlama vurgusu (`highlighted`): satır zemini yerine baloncuğa `accent500` 1.5px kenarlık.
- Tarih ayracı, `inverted` liste, `MessageScreen.tsx:378` sarmalayıcı `View` notu (C11) DOKUNULMAZ.
- Görsele dokun → tam ekran, dosyaya dokun → aç (mevcut `interactive`).

## §6 Kabul (DoD)

1. `npm run typecheck` + `npm run lint` temiz.
2. Emülatörde dört bağlam görülür: 1-1 DM, grup DM, ortam kanalı, tek görselli ek-yalnız mesaj.
3. Taşma yok: boşluksuz 200 karakterlik metin ve uzun URL baloncuktan taşmaz (kırılır).
   Ekran genişliği 320dp'de de bakılır (emülatör ölçeği ya da küçük AVD).
4. Kendi baloncuğumda bahsetme, okundu, yanıt çizgisi okunur (§4).
5. Yeni i18n metni YOK. Olması gerekirse DUR, PM'e bildir.
6. Cihaz doğrulaması sahipte (emülatör sonrası).
