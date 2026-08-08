# Sprint R16 — Susturma Durumu Görünür Olsun (D53)

> **Tier:** `api/` + `web/` (bu sprint) · `mobile/` ayrı turda (§6).
> **Kaynak:** sahip cihaz turu 2026-08-08 → `PLAN.md` [[D53]].
> **🔴 R7:** moderasyon yüzeyi. Yeni yetki üretilmiyor, var olan yetkinin **geri alınabilir** hale
> gelmesi sağlanıyor.

---

## §0 Kusur — ne olduğu, neden ciddi

Moderatör bir kullanıcıyı ses kanalında susturuyor (`POST /voice/:channelId/mute/:userId`, R11).
Sunucu doğru çalışıyor: `VoiceMute` kaydı yazılıyor, LiveKit izni düşüyor, kayıt **kalıcı**
(sonraki `mintToken`larda `canPublish=false` üretiyor).

**Ama "kim susturulmuş" bilgisi hiçbir uçtan dönmüyor.** Webde bu bilgi yalnız o anki oturumda,
`voice.participant_muted` WS olayıyla bellekteki bir `Set`e yazılıyor
(`web/src/stores/voice.ts` `serverMutedUserIds`). Sonuç zinciri:

1. Sayfa yenilenince `Set` boşalır → menü etiketi "Susturmayı Kaldır" yerine **"Sustur"** olur →
   **susturmayı kaldırmanın UI'da yolu kalmaz.**
2. `addServerMute` `connectedChannelId !== channelId` iken erken dönüyor → moderatör **o ses kanalına
   bağlı değilken** susturursa etiket zaten hiç doğru olmaz.
3. Susturulan kullanıcı kanaldan çıkıp girse de susturulmuş kalır (kayıt duruyor) ve UI ona
   **"Karantinada olduğun için konuşamazsın"** der — bu metin de yanlış (§4).

**Neden ciddi:** uygulanabilen ama geri alınamayan bir moderasyon aracı. Yanlışlıkla susturulan
kullanıcı, moderatör iyi niyetli olsa bile kalıcı olarak susturulmuş kalır.

---

## §1 Kapsam

| Tier | Ne |
|---|---|
| `api/` | `GET /channels/:id/voice/participants` yanıtına **susturulmuş kullanıcılar** eklenir |
| `web/` | Liste sunucudan doldurulur (yenileme sonrası kaybolmaz); menü etiketi gerçeğe bakar |
| `web/` | Susturma kalkınca kullanıcı **yeniden bağlanmadan** konuşabilir (§3) |
| `web/` i18n | `voice.listenerOnly` metni düzeltilir (§4) — **iki istemciyi birden düzeltir** |

**Kapsam dışı:** mobil moderasyon eylemleri (M4h) · mobil izin dinleyicisi (§6, ayrı tur) ·
susturma geçmişi/denetim ekranı · süreli susturma.

---

## §2 api — susturulmuş kullanıcılar yanıta eklenir

`listParticipants` bugün `{ startedAt, participants[], broadcasters[] }` döndürüyor.
Buna **`mutedUserIds: string[]`** eklenir (`VoiceMute` tablosundan, o kanal için).

- Alan **eklenir**, var olan alanların şekli değişmez (istemci uyumu bozulmaz).
- Kapsam: yalnız **GUILD_VOICE**. DM/grup DM'de `VoiceMute` yok → **her zaman boş dizi**.
- Yetki: uç zaten `requireChannelAccess`ten geçiyor; **ek yetki kapısı KONMAZ.** Gerekçe: aynı bilgi
  bugün de `voice.participant_muted` WS olayıyla **odadaki herkese** gidiyor; REST'te saklamak yeni
  bir mahremiyet kazancı sağlamaz, yalnız tutarsızlık üretir. (Susturulmuş olmak kanal içinde zaten
  görünür bir durum — rozet çiziliyor.)
- OpenAPI/DTO güncellenir.
- **Test:** susturulmuş kullanıcı listede geliyor · susturma kalkınca listeden düşüyor · DM kanalında
  boş dönüyor.

🔴 **Bunun dışında `api/` davranışı DEĞİŞMEZ.** `mute`/`unmute`/`stopBroadcast` uçlarına dokunulmaz.

---

## §3 web — durum sunucudan gelsin, susturma kalkınca ses geri gelsin

### §3.1 Hidrasyon
`stores/voice.ts` katılımcıları çekerken (`getParticipants`, bugün satır ~171) `mutedUserIds`i
`serverMutedUserIds`e **yazar**. Böylece sayfa yenilense de, moderatör kanala sonradan katılsa da
etiket doğru olur. WS olayları (`participant_muted`/`unmuted`) bu listeyi **güncellemeye devam eder**
— hidrasyon onların yerine geçmez, ilk doğruyu verir.

⚠️ `addServerMute`/`removeServerMute`in `connectedChannelId !== channelId` erken dönüşü **korunur**
(store'un anlamı bağlı oda kapsamında) ama hidrasyon aynı kapıya takılmamalı: moderatör listeyi
görüyorsa etiket doğru olmalı. Bu ikisi çelişiyorsa **DUR ve bildir** — store'un kapsam anlamını
tek başına değiştirme.

### §3.2 🔴 Susturma kalkınca yeniden bağlanma gerekmesin
Bugün: sunucu izni geri veriyor ama tarayıcıdaki kullanıcı **hâlâ konuşamıyor** — mikrofon track'i
susturulurken düşürülmüştü, kimse geri koymuyor; ayrıca istemcinin `canPublish`i token'dan geldiği
için `false` donmuş durumda, mikrofon düğmesi pasif.

Çözüm, **M4f'te kamera için yazılanın ses karşılığı**:
- `RoomEvent.ParticipantPermissionsChanged` (yerel katılımcı) → `canPublish` güncellenir.
- İzin geri geldiğinde mikrofon **yeniden yayınlanır** — ama **kullanıcının kendi mikrofon tercihi
  korunur**: susturulmadan önce kendi isteğiyle mikrofonu kapatmışsa açılmaz. 🔴 Sunucu izni geri
  vermek "mikrofonunu aç" demek değildir.
- İzin düştüğünde (susturulma anında) `canPublish=false` yansır; kullanıcı sessiz kalmaz, mevcut
  gösterge (§4 metni) doğru metinle çıkar.

### §3.3 Menü etiketi
"Sustur" / "Susturmayı Kaldır" ayrımı artık hidrate edilmiş listeye bakar. Yanlış etiketle yanlış uca
gitmek (susturulmuş kullanıcıya tekrar `mute` atmak) bitmeli.

---

## §4 🔴 Yalan söyleyen metin

```
voice.listenerOnly = "Karantinada olduğun için dinleyebilir ama konuşamazsın."
```

**Ses karantinası 2026-06-19'da kaldırıldı** (`voice.service.ts` `resolveCanPublish` yorumu). Bu metin
o günden kalma ve **var olmayan bir politikayı** kullanıcıya gerekçe olarak sunuyor. Sahibi kendi
politikasını sorgulamaya itti (2026-08-08) — metin yüzünden.

Yeni metin **gerekçe uydurmaz**, durumu söyler: *"Şu an bu kanalda konuşamıyorsun, yalnız
dinleyebilirsin."* (Nihai ifade metin kurulundan geçmeden değişmez; anlam bu olacak.)

Aynı anahtar mobilde de kullanılıyor → tek düzeltme iki istemciyi birden düzeltir.

---

## §5 DoD

### Kod tarafı
- [ ] `api`: build + test temiz; yeni alanın testi var
- [ ] `web`: `vue-tsc -b` bilinen 6 hata (fazlası yok) · `vite build` başarılı
- [ ] `api` yanıt şekli geriye uyumlu (var olan alanlar değişmedi)

### Tarayıcıda (SAHİPTE)
- [ ] Kullanıcıyı sustur → **sayfayı yenile** → menü hâlâ "Susturmayı Kaldır" diyor
- [ ] Ses kanalına **bağlı değilken** sustur → listeyi açınca etiket doğru
- [ ] Susturmayı kaldır → susturulan kullanıcı **yeniden bağlanmadan** konuşabiliyor
- [ ] Susturulan kullanıcı kendi isteğiyle mikrofonunu kapatmışsa, susturma kalkınca mikrofonu
      **kendiliğinden açılmıyor**
- [ ] "Karantinada olduğun için…" metni hiçbir yerde görünmüyor
- [ ] 🔴 Sahibin **kilitli kalmış ikinci hesabı** bu akışla kurtarılabiliyor (gerçek kabul testi)

---

## §6 Sonraki tur (bu sprintte DEĞİL)

Mobil tarafta aynı izin dinleyicisi (§3.2'nin mobil karşılığı) ayrı turda yazılır — M4t'nin
dokunduğu dosyalarla çakışmasın diye ayrıldı. Mobil moderasyon eylemleri M4h'ın işi.

---

## §7 Dev'e notlar

1. Önce `api`, sonra `web`. Alan dönmeden webde hidrasyon yazılamaz.
2. §3.2'nin referansı `mobile/src/stores/voice.ts` M4f bloğu (`ParticipantPermissionsChanged` +
   `LocalTrackUnpublished`) — **oku, mantığı taşı, kodu kopyalama** (RN ≠ Vue).
3. Kullanıcının kendi mikrofon tercihini ezme (§3.2). Bu, kamera tarafında `cameraIntent` ile
   çözdüğümüz ayrımın aynısı.
4. Sözleşme dışına çıkma ihtiyacı → **DUR ve bildir.**
5. Cihaz/tarayıcı testi yapma, commit atma. PM inceleyip commit'ler.
