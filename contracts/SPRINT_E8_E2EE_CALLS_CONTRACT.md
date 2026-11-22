# SPRINT E8: DM aramalarında uçtan uca şifreleme (ses, görüntü, ekran)

> Durum: **TASLAK (2026-11-22), PM compose (Opus).** shared/e2ee-core + shared/e2ee-client + api + web (+ masaüstü) + mobil.
> Yol haritası: E1-E5, E2 ✅ (herkese açık, 2026-11-14) → **E8 bu sprint** → E7 güvenlik kodu + yerel arama. E6 ertelenmiş.
> 🔴 **R7 bölgesi:** anahtar türetme (§2), token kapısı (§3), istemcide anahtarın odaya verilmesi (§4.2, §5.2). Sahibin satır satır incelemesi olmadan main'e girmez.
> Temel: E1 ve E2 sözleşmeleri aynen geçerli; bu belge yalnız aramayı yazar.

## §0 Karar ve kapsam

**Sahip kararları:**
- Aramalar mesajlar kadar önemli; sıra E8 → E7 (2026-11-12).
- **Şifreleyemeyen cihaz aramaya giremez (2026-11-22).** Arama hiçbir koşulda sessizce şifresize düşmez. Eski sürüm, desteklemeyen tarayıcı ve gruba henüz eklenmemiş cihaz için açık bir mesaj gösterilir.
- Ortam ses kanalları şifresiz kalır (ortam = umumi alan, 2026-11-05 kararıyla tutarlı).

**Kapsam:** `DM` ve `GROUP_DM` kanallarındaki LiveKit aramalarında ses, kamera ve ekran paylaşımı karelerinin cihazda şifrelenmesi; anahtarın kanalın MLS grubundan türetilmesi; üyelik/cihaz değişince anahtarın arama sürerken yenilenmesi; arama ekranında "uçtan uca şifreli" göstergesi; D102 (çıkarılan üyenin `voice:` odasında kalması).

**Kapsam DIŞI:** ortam ses kanalları; güvenlik kodu / anahtar doğrulama (E7); katılımcı listesi, kimin ne zaman aradığı, süre gibi üst veriler (sunucu görür, düz kalır); arama kaydı (zaten yok).

## §1 İlkeler

1. **SFU içeriği görmez, yönlendirir.** LiveKit sunucusu şifreli kareyi alır ve dağıtır; çözemez. Bağlantı katmanındaki DTLS-SRTP aynen kalır (iki kat şifre).
2. **Yeni anahtar dağıtımı yok.** Arama anahtarı kanalın zaten var olan MLS grubundan **MLS exporter** ile türetilir (RFC 9420 §8.5). Gruptaki her cihaz aynı anahtarı kendi başına hesaplar; anahtar ağa hiç çıkmaz.
3. **Epoch = anahtar.** Her epoch'un anahtarı ayrıdır. Üye/cihaz çıkınca epoch ilerler, çıkan cihaz yeni anahtarı türetemez.
4. **Geri düşme yok.** Sunucu "bu arama şifreli" dediyse istemci şifresiz bağlanmaz; bağlanamıyorsa bağlanmaz.
5. **T&S işlevleri değişmez.** Acil butonu üst veri toplar (içerik yok), DM'de mod teftiş girişi zaten kapalı, kayıt/egress yok. Şifreleme bunların hiçbirini bozmaz; dev bunu kodda teyit eder, aksi görülürse DURUR.

## §2 Anahtar türetme (shared/e2ee-core, R7)

`Group`'a tek yöntem eklenir:

```ts
/** E8: bu epoch'un arama anahtarı. Saf; ağ/depolama yok. */
async exportCallKey(channelId: string): Promise<{ key: Uint8Array; epoch: number }>
```

- Gövde: `mlsExporter(state.keySchedule.exporterSecret, 'kankaverse call v1', utf8(channelId), 32, cs)`; `epoch` = grubun o anki epoch'u.
- Etiket sabit `'kankaverse call v1'` (mesaj şifrelemesiyle karışmaz; ileride sürüm değişirse `v2`).
- Bağlam `channelId`: aynı grup sırrı başka bir kanalda kullanılamaz.
- Durumu DEĞİŞTİRMEZ (salt okunur, `encrypt` gibi anahtar tüketmez).

**Testler (vitest):**
- Aynı gruptaki iki cihaz aynı epoch'ta **aynı** anahtarı türetir.
- Farklı `channelId` → farklı anahtar.
- Cihaz çıkarma commit'inden sonra kalanların anahtarı değişir; çıkarılan cihazın elindeki eski durumdan türetilen anahtar yenisine eşit değildir.
- Çağrı öncesi/sonrası `serialize()` çıktısı aynı (durum değişmedi).

## §3 API (R7)

### §3.1 Token isteği
`POST /channels/:id/voice/token` gövdesi (yeni, isteğe bağlı DTO):
```jsonc
{ "callE2ee": true }   // istemci "şifreli aramayı yapabilirim" der
```
Eski istemciler gövde göndermez → `callE2ee` yok sayılır = yapamaz.

### §3.2 Karar
`callEncrypted` = `E2EE_CALLS` bayrağı açık **ve** kanal `DM`/`GROUP_DM` **ve** kanalda `E2eeGroup` satırı var.
- `callEncrypted && callE2ee !== true` → **426** `CALL_E2EE_UPDATE_REQUIRED`, mesaj: "Bu arama uçtan uca şifreli. Katılmak için uygulamayı güncelle." Token **basılmaz**, presence yayını yapılmaz, `VoiceSession` açılmaz (kapı mint'ten ve yan etkilerden ÖNCE).
- Ortam ses kanalında `callE2ee` yok sayılır, her zaman `false`.
- Bayrak kapalıyken her şey bugünkü gibi (geri alma yolu, §7).

### §3.3 Cevap (envelope `data`'ya eklenen alanlar)
```jsonc
{ "...mevcut alanlar": "...", "e2ee": true, "e2eeEpoch": 12 }   // e2ee=false iken e2eeEpoch=null
```
`e2eeEpoch` = `E2eeGroup.epoch` (sunucunun kabul ettiği son epoch). İstemci kendi grubunu bununla karşılaştırır (§4.1).

### §3.4 D102
Gruptan çıkarılan/ayrılan üye, mevcut `evictFromRooms` (LiveKit) çağrısının yanında socket `voice:{channelId}` odasından da çıkarılır. Hangi socket odası adı kullanılıyorsa onu `RealtimeService`'te bul; yeni oda adı uydurma.

### §3.5 Yapılandırma
`E2EE_CALLS` (varsayılan `false`), `configuration.ts` + `.env.example`. `e2ee-flag.service.ts`'e `calls` getter'ı (diğer bayraklarla aynı desen).

**Testler (jest):** bayrak açık + grup var + `callE2ee` yok → 426 ve yan etki yok (presence emit, VoiceSession çağrılmadı); `callE2ee: true` → `e2ee: true`, `e2eeEpoch` doğru; grup yoksa `e2ee: false`; ortam kanalında `e2ee: false`; bayrak kapalı → `e2ee: false`; D102 çıkarmada socket odası çıkışı çağrıldı. Mevcut voice spec'leri değişmeden geçer.

## §4 shared/e2ee-client

### §4.1 `E2eeEngine.callKey(channelId, serverEpoch)`
```ts
callKey(channelId: string, serverEpoch: number): Promise<{ key: Uint8Array; epoch: number }>
```
- `run()` kilidi içinde: önce `syncChannel` (bekleyen Welcome/commit'leri işle), sonra yerel grubu al.
- Yerel grup yok ya da cihaz grupta değil → `CallKeyUnavailableError('NOT_MEMBER')`.
- Yerel epoch `serverEpoch`'tan geride kaldıysa (eşitlemeden sonra hâlâ) → `CallKeyUnavailableError('STALE')`. İleride olması normal değil ama zararsız: kullan.
- Dönen anahtar bellekte kalır, **hiçbir yere yazılmaz** (yerel depo, log, metrik yok).

### §4.2 Arama sürerken epoch değişimi
`onGroupChanged(channelId)` sonrası, o kanalda aktif arama varsa istemci `callKey`'i yeniden alıp 0 numaralı yuvaya yazar (§4.3). Bilinen bedel: gönderen yeni anahtara geçtiği anda henüz commit'i işlememiş alıcıda bir iki saniye ses/görüntü bozulabilir. Epoch değişimi arama sırasında nadir (cihaz/üye değişikliği); kabul.

### §4.3 LiveKit tarafı (web + mobil ortak kural)
- **Paylaşılan anahtar modu** (`sharedKey: true`): MLS exporter grup düzeyinde tek sır verir; katılımcı başına anahtar burada ek güvenlik getirmez (her üye zaten herkesin anahtarını bilirdi).
- **Tek anahtar yuvası (indeks 0), epoch değişince üstüne yazılır** (Rev.1, 2026-11-22). Sebep: `RNE2EEManager` şifreleyicinin indeksini yalnız kurulurken `getLatestKeyIndex`'ten okur, paylaşılan anahtar modunda bu hep 0. `epoch % 16` web'de çalışır ama telefon 0 ile göndermeye devam eder. Kütüphanenin özel alanlarına yama yerine tek yuva; bedel §4.2'deki kısa bozulma, aynı büyüklükte. Web'de hazır `ExternalE2EEKeyProvider` yeterli (metin → PBKDF2, indeks 0).
- **Anahtar iki istemciye de base64 METİN olarak verilir** (`toB64(key)`), bayt olarak DEĞİL. Sebep (PM kaynak incelemesi, 2026-11-22): `livekit-client` bayt anahtarı HKDF ile, metin anahtarı PBKDF2 ile işler; `RNKeyProvider` türetme algoritmasını native'e geçirmez, Android varsayılanı PBKDF2. Bayt verilirse web HKDF, telefon PBKDF2 kullanır, aynı anahtardan farklı şifre çıkar. Metin yolunda ikisi de PBKDF2 (SHA-256, 100.000 tur, tuz `LKFrameEncryptionKey`). Girdi 256 bit rastgele olduğu için PBKDF2 güvenliği zayıflatmaz. `ratchetSalt`, `uncryptedMagicBytes`, `keyringSize` iki istemcide varsayılan bırakılır (ikisinin varsayılanı aynı; değiştirilirse ikisinde birden).
- Bağlanmadan ÖNCE anahtar verilir ve şifreleme açılır; şifreleme açılamazsa `room.connect` çağrılmaz.
- Şifre çözme hatası (`EncryptionError` olayı) loglanır (kanal kimliği + sayaç, anahtar/kare içeriği yok); arka arkaya hata görünür kalırsa §6'daki "bağlantı şifresi çözülemiyor" satırı.

## §5 İstemciler

### §5.1 Web + masaüstü (`web/src/stores/voice.ts`)
- Destek kontrolü: `isE2EESupported()` (livekit-client). Desteklenmiyorsa token isteği `callE2ee` OLMADAN yapılır: arama şifreliyse sunucu 426 döner ve istemci `unsupportedBrowser` metnini gösterir; şifresizse (bayrak kapalı, grubu olmayan DM) bugünkü gibi bağlanır. (Rev.2, 2026-11-22: ilk metin "token isteği yapılmaz" diyordu; bayrak kapalıyken eski tarayıcıyı da aramadan keserdi, §7.1 "bayrak kapalı = bugünkü gibi" ile çelişiyordu.) (Ortam kanalı etkilenmez.)
- Token isteği DM/grup kanalında `{ callE2ee: true }` gönderir (destek varsa).
- `e2ee: true` ise: `ExternalE2EEKeyProvider` + `e2ee: { keyProvider, worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url)) }` ile `new Room`, `callKey` → `setKey`, `room.setE2EEEnabled(true)`, sonra `connect`.
- Worker'ın Vite üretim derlemesinde ayrı dosya olarak çıktığını `dist/` içinde teyit et; Caddy'nin `/assets/` yolu kapsıyor mu bak.
- Masaüstü (Electron 36) uzaktan web'i yüklüyor: ek iş yok, turda sınanır.

### §5.2 Mobil (`mobile/src/stores/voice.ts`)
- `RNKeyProvider({ sharedKey: true })` + `RNE2EEManager(keyProvider)` → `new Room({ e2ee: ... })`. Kesin bağlama şekli adım 0'da (§8) netleşir; sözleşme davranışı bağlar, API çağrı sırasını adım 0 belirler.
- Token isteği DM/grup kanalında her zaman `{ callE2ee: true }` (yerel destek adım 0'da teyit edilir).
- Gelen arama akışı (bildirimden Katıl, uygulama içi zil) aynı `join` yolundan geçer; 426 ve `CallKeyUnavailableError` orada da §6 mesajını gösterir, sessizce düşmez.
- Native değişiklik beklenmiyor (`@livekit/react-native-webrtc` çerçeve şifreleyiciyi zaten içeriyor). Yine de önce yerel release APK, sonra AAB.

### §5.3 Masaüstü bildirimi
Yok; masaüstü web ile aynı kodu yükler.

## §6 Arayüz metinleri (tr.json, web + mobil aynı anahtar adları)

| Anahtar | Metin |
|---|---|
| `call.e2ee.badge` | Uçtan uca şifreli |
| `call.e2ee.updateRequired` | Bu arama uçtan uca şifreli. Katılmak için uygulamayı güncelle. |
| `call.e2ee.unsupportedBrowser` | Bu tarayıcı şifreli aramaları desteklemiyor. Güncel bir Chrome, Edge, Firefox ya da Safari kullan. |
| `call.e2ee.notMember` | Bu cihaz bu sohbette henüz şifreli değil. Sohbeti bir kez açıp tekrar dene. |
| `call.e2ee.stale` | Şifreli arama hazırlanamadı. Birkaç saniye sonra tekrar dene. |
| `call.e2ee.decryptFailing` | Bağlantının şifresi çözülemiyor. Aramadan çıkıp yeniden katıl. |

- Rozet: arama ekranı başlığında küçük kilit + `badge` metni, yalnız `e2ee: true` iken. Ortam kanalında yok (placeholder yok).
- Sunucu 426 mesajı Türkçe gelir; istemci `error` koduna göre kendi anahtarını gösterir (iki istemcide aynı metin).
- Em dash yok.

## §7 Yayılım ve geri alma

1. api + web + mobil kodu **bayrak kapalı** canlıya çıkar. Bu hâlde istemciler `callE2ee: true` gönderir, sunucu `e2ee: false` döner, aramalar bugünkü gibi.
2. Mobil AAB Play'de yayına girer, yayılım sorgusu (son açılış sürümü) ile eski sürümde kalan aktif kullanıcı sayısı çıkarılır. Sahip açılış zamanını seçer.
3. `E2EE_CALLS=true`, api restart (son deploy sha'sıyla IMAGE_TAG verilerek). 24 sa izleme: 426 sayısı, `EncryptionError` logları.
4. Gizlilik metni: "aramalar şifresiz" cümlesi güncellenir (PM taslak yazar, **sahip onayı**), bayrak açılışıyla aynı gün.
5. **Geri alma:** `E2EE_CALLS=false` + restart. Sürmekte olan şifreli aramalar biter; yeni aramalar şifresiz başlar. Veri kaybı yok (arama verisi saklanmıyor).

## §8 Adımlar

0. **Kapı (spike, dal `spike/e2ee-calls`):** sabit test anahtarıyla web ↔ Redmi (dev build) 1-1 arama: ses ve kamera her iki yönde, ekran paylaşımı web'den (mobilde yalnız izleme var); bilinçli yanlış anahtarla çözülmediği teyidi; arama sürerken iki tarafta da anahtarı değiştirme (0 numaralı yuvanın üstüne yazma), ses geri geliyor mu. **Web ↔ RN birlikte çalışmazsa DUR**, PM'e dön (anahtar türetme ayarları, `ratchetSalt`, `uncryptedMagicBytes` farkı olası).
   **Adım 0 SONUCU (2026-11-22, sahip cihazında, web Chrome ↔ Redmi dev build `com.kankaverse.app.dev`): GEÇTİ.** Ses ve kamera iki yönde, web ekran paylaşımı telefonda; yanlış anahtarda iki yön de kesildi (web `InvalidKey`), arama sürerken doğru anahtarı geri yazınca ses döndü. Metin anahtar (PBKDF2) ve tek yuva doğrulandı. İki bulgu:
   - **B1 (🔴 adım 5'te kapanmalı): telefon her izin ilk karelerini ŞİFRESİZ gönderiyor.** `RNE2EEManager` gönderici şifreleyiciyi `LocalTrackPublished` olayında takıyor; iz o andan önce yayına başlıyor. Kanıt: web konsolunda arama başında ve kamera açılışında `MissingKey: missing key at index 110/36` (bizim kareler hep 0 taşır; rastgele indeks = şifresiz karenin son baytı). Web'de yok (Chrome şifreleyici takılana dek kare göndermez). Çözüm adım 5'te araştırılır (aday: izi susturulmuş yayınla, şifreleyici etkinleşince aç; ya da paket yaması). **Doğrulama ölçütü:** arama başı, kamera açılışı, ekran/kamera yeniden açılışında web konsolunda TEK bir `MissingKey` yok.
   - **B2: mobilde çözme hatası JS'e gelmiyor.** Yanlış anahtarda Metro'ya hiç `EncryptionError` düşmedi (native hata olay olarak iletilmiyor). §4.3/§6 `decryptFailing` satırı mobilde bu olaya dayanamaz; adım 5'te native cryptor durum olayı aranır, yoksa mobilde bu satır düşer (web'de kalır). PM'e bildirilerek karar verilir.
1. e2ee-core `exportCallKey` + testler. 🔴 R7.
2. api §3 + testler. 🔴 R7.
3. e2ee-client `callKey` + `CallKeyUnavailableError`.
4. web §5.1 + §6. 🔴 R7 (anahtarın odaya verildiği kısım).
5. mobil §5.2 + §6. 🔴 R7 (aynı).
6. Cihaz turu (§9).
7. Yayılım (§7).

Her adım: `tsc`, ilgili testler, web için `vue-tsc -b` (6 bilinen hata dışında yeni yok).

## §9 Cihaz turu (DoD)

1. 1-1 DM, web ↔ Redmi: ses iki yönde, rozet görünür.
2. Aynı, kamera iki yönde + web'den ekran paylaşımı, telefonda izlenir (yetişkin hesaplar).
3. Masaüstü ↔ Redmi sesli arama.
4. Grup DM, 3 katılımcı (web + masaüstü + Redmi).
5. Grup araması sürerken bir üyeyi çıkar: çıkarılan düşer, kalanlar konuşmaya devam eder (en fazla birkaç saniyelik bozulma).
6. Arama sürerken bir katılımcıya yeni cihaz eklenir (epoch değişimi): arama sürer.
7. Bayrak açıkken eski sürüm (vc80) aramaya katılmaya çalışır: güncelleme mesajı, bağlanmaz.
8. Gruba henüz eklenmemiş yeni cihaz (ör. yeni gizli pencere oturumu): `notMember` mesajı, bağlanmaz.
9. Ortam ses kanalı: bugünkü gibi, rozet yok, `callE2ee` etkisiz.
10. LiveKit sunucu logunda / `room` olaylarında içerik yok (yalnız teyit; SFU zaten saklamıyor).
11. Acil butonu DM aramasında: rapor oluşur, kişi aramadan çekilir (davranış değişmedi).
12. Bildirimden gelen aramayı kabul (uygulama kapalıyken): şifreli bağlanır.
