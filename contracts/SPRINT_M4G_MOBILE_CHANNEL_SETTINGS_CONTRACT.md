# Sprint M4g — Mobil Ses Kanalı Ayarları

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır · native diff sıfır → **yeni dev build YOK.**
> **Kaynak:** sahip 2026-08-08 Discord mobili açtı, ekran görüntüsüyle gösterdi: bit hızı, video
> kalitesi, kullanıcı limiti Discord'un **kanal ayarları** ekranında var.
> **🔴 Sahibin bulduğu ayrım (sözleşmenin belkemiği):** Discord bu alanları **oluşturma formuna
> KOYMAMIŞ**, yalnız var olan kanalın ayarlarında gösteriyor. Bizde de öyle olacak.

---

## §0 Neden küçük

- Sunucu **hazır**: `UpdateChannelDto` `userLimit` · `bitrate` · `mediaEnabled` alanlarını zaten kabul
  ediyor ve `toChannelDto` üçünü de zaten **döndürüyor** (`channels.service.ts`).
- Metinler **hazır**: `channel.userLimitLabel/Hint/Placeholder` · `channel.bitrateLabel/Hint` ·
  `channel.mediaEnabledLabel/Desc` — hepsi `tr.json`da, web kullanıyor. **Yeni metin uydurma.**
- Ekran **hazır**: `channel-edit.tsx` (bugün ad · 18+ · özel kanal · yavaş mod taşıyor).

Kalan iş: DTO'da üç alanı tiplemek, ekrana üç kontrol eklemek, doğru kanal türünde göstermek.

---

## §1 Kapsam

| Dosya | Ne |
|---|---|
| `src/api/channels.ts` | `ChannelSummaryDto`ya `userLimit` · `bitrate` · `mediaEnabled` **tiplenir** (sunucu zaten dönüyor, yeni alan DEĞİL); `update` çağrısı bu üçünü gönderebilir |
| `src/app/(app)/channel-edit.tsx` | Üç kontrol (§2), kanal türüne göre koşullu (§3) |
| 3 çağıran ekran | `channel-edit`e `type` + üç değeri taşır (§3) |

**Kapsam dışı:** kanal **oluşturma** formu (sahip kararı — sade kalıyor: tür · ad · özel · 18+) ·
video kalitesi (bizde böyle bir alan yok, uydurulmayacak) · bölge seçimi (yok) · kanal izinleri ekranı.

---

## §2 Üç kontrol

- **Kullanıcı Limiti** (`userLimit`, sayı) — `0 = sınırsız`. Metinler hazır.
- **Bit Hızı** (`bitrate`, kbps) — metinler hazır.
- **Medya Yayını (Kamera & Ekran)** (`mediaEnabled`, anahtar) — 🔴 **açıklama metni MUTLAKA gösterilir**
  (`mediaEnabledDesc`). Gerekçe §4'te.

Girdi biçimi (kaydırıcı mı, sayı alanı mı, seçenek listesi mi) **dev'in kararı**; mevcut ekranın
deseniyle tutarlı olsun, yeni bir girdi altyapısı yazılmasın. Yavaş mod bu ekranda seçenek listesiyle
çözülmüş, oradaki desen referans alınabilir.

---

## §3 🔴 Kanal türü — bu sprintin tek gerçek tuzağı

Bu üç alan **yalnız ses kanalına** ait; yavaş mod ise **metin kanalına**. Ekran bugün kanal türünü
**bilmiyor** (`useLocalSearchParams` içinde `type` yok).

`channel-edit`e üç yerden geliniyor: `home.tsx` · `channel-details.tsx` · `guild-channels.tsx`.
**Üçü de `type`i ve üç yeni değeri taşımak zorunda.**

🔴 **M4c dersi aynen geçerli:** `/call` ekranı da böyle route parametresine güveniyordu, çağıran
yollardan **biri** parametreyi taşımayınca ekran sessizce yanlış moda düşmüştü (`callKind` bu yüzden
store'a taşındı). Mobilde kanal store'u **yok**, o yüzden burada parametre kalıyor — ama:

**Zorunlu savunma:** `type` gelmezse ses alanları **çizilmez** (bugünkü davranışa düşer).
Yanlış kanala yanlış kontrol göstermektense hiç göstermemek doğrudur. Sessiz yanlışlık yasak.

---

## §4 T&S notu — `mediaEnabled` sıradan bir ayar değil

Bu anahtar C7'nin anahtarı: açıldığında o ses kanalında **minör dahil** herkes kamera/ekran
paylaşabilir (brief §4'ün bilinçli gevşetmesi, sahip kararı 2026-06-30). Küçük bir ekranda yanlışlıkla
açılması gereken bir şey değil.

- Açıklama metni (`mediaEnabledDesc`) **gizlenmez, kısaltılmaz.**
- Kapı **sunucuda** kalır; istemci yalnız bayrağı gönderir.
- ⚠️ **Bilinen sınır ([[D54]]):** ayar değiştiğinde o an kanalda **bağlı olanların** LiveKit izinleri
  güncellenmiyor; değişiklik yeniden bağlanınca geçerli oluyor. Bu sprintte **çözülmeyecek** (ayrı
  iş), ama dev bunun farkında olsun ve "çalışmıyor" sanıp kapsam dışına çıkmasın.

---

## §5 DoD

### Kod tarafı
- [ ] `npm run typecheck` · `npm run lint` temiz
- [ ] `api/` + `web/` diffi sıfır · native diff yok · yeni bağımlılık yok
- [ ] `type` taşımayan bir çağrı yolu kalmadı; taşınmazsa ses alanları çizilmiyor (§3)

### Cihazda (SAHİPTE)
- [ ] Ses kanalı ayarlarında üç alan görünüyor, kaydedilince sunucuda kalıcı
- [ ] Metin kanalı ayarlarında bu üç alan **görünmüyor**; yavaş mod yerinde duruyor
- [ ] Kanal **oluşturma** formu değişmedi (tür · ad · özel · 18+)
- [ ] `mediaEnabled` kapalıyken o kanalda kamera düğmesi çıkmıyor; açılınca (yeniden bağlanınca)
      çıkıyor
- [ ] Kullanıcı limiti dolu kanala girilemiyor (sunucu kapısı — mobil hata mesajını gösteriyor)

---

## §6 Dev'e notlar

1. Sunucuya dokunma; üç alan zaten var, yalnız **tiplenecek**.
2. Metin uydurma; altı anahtar da `tr.json`da hazır.
3. §3'teki fail-closed davranışı atlama — sessiz yanlışlık en pahalı kusur türümüz oldu.
4. Sözleşme dışına çıkma ihtiyacı → **DUR ve bildir.**
5. Cihaz testi yapma, commit atma.
