# Sprint M4h — Mobil Ses Moderasyonu

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır · native diff sıfır → **yeni build YOK.**
> **Kaynak:** sahip sorusu 2026-08-08 — "web'deki moderatör yetkileri mobilde de görünecek mi?"
> Cevap: bugün mobilde **hiçbiri yok**; sunucuda dördü de hazır ve R7'den geçmiş.
> **🔴 R7 yüzeyi:** moderasyon. Yeni yetki üretilmiyor; kapılar sunucuda, istemci yalnız gösterir.

## §0 Bugünkü durum
Sunucuda dört uç canlı, web hepsini kullanıyor, **mobilde istemcisi bile yok**:
`POST /voice/:channelId/mute/:userId` · `DELETE .../mute/:userId` · `POST /voice/:channelId/move/:userId`
· `POST /channels/:id/voice/stop-broadcast` · `POST /channels/:id/voice/disconnect`.

Bugün (R19) sunucu tarafı sağlamlaştırıldı: susturma yayındaki track'leri de kesiyor, taşıma olayı
kick'ten önce gidiyor, mobil taşınmayı karşılıyor (M4j). Zemin hazır; kalan iş **arayüz + uç çağırma**.

## §1 Kapsam
**Yüzey: arama ekranı** (`src/app/(app)/call.tsx`) — katılımcıya dokununca alt sayfa (bottom sheet)
açılır, moderasyon eylemleri orada. Mevcut sheet deseni var (`VoiceChannelSheet`, `OutputPickerSheet`);
**yeni sheet altyapısı yazılmaz**.

| Eylem | Yetki | Not |
|---|---|---|
| Sustur / Susturmayı Kaldır | `MUTE_MEMBERS` | Etiket **gerçek duruma** bakar (§3) |
| Yayını Durdur | `MUTE_MEMBERS` | Yalnız hedef yayın yapıyorsa çizilir |
| Taşı | `MOVE_MEMBERS` | Hedef = aynı ortamın diğer ses kanalları |
| Odadan Çıkar | `MOVE_MEMBERS` | 🔴 Onay ister (yıkıcı) |

**Kapsam dışı:** kanal listesinden (odaya girmeden) moderasyon — web'de var, mobilde ayrı tur ·
ban/kick (ortam üyeliği) · rol yönetimi · moderasyon kuyruğu.

## §2 Yetki ve hedef kapıları
- `useGuildPermission(guildId, 'MUTE_MEMBERS' | 'MOVE_MEMBERS')` **zaten var** (`src/hooks/`), o kullanılır.
- Kendine ve **ortam sahibine** eylem gösterilmez (sunucu da reddediyor; istemci sessiz 403 yaşatmaz).
- Yetki yoksa sheet **moderasyon bölümünü hiç çizmez** (yetkisiz kullanıcıya pasif düğme gösterme).
- 🔴 Kapı **sunucuda**; istemcideki hesap yalnız yapılamayacak işi ekranda göstermemek için
  (`useGuildPermission` dosyasının kendi yorumu bunu açıkça söylüyor — oku).

## §3 🔴 "Sustur" mu "Susturmayı Kaldır" mı — webdeki tuzağa DÜŞME
Webde tam bu noktada bir kusur çıktı (bugün düzeltildi, D53): menü kapatıldıktan **sonra** susturulma
durumu okunuyordu, bayrak sıfırlandığı için her basış "sustur" ucuna gidiyordu. Etiket doğru
görünüyordu ama eylem yanlıştı ve `upsert` yüzünden hata da vermiyordu.

**Kural:** durum **eylem tetiklenmeden önce** okunacak; sheet kapanışı okumayı etkilemeyecek.

Durum kaynağı: `GET /channels/:id/voice/participants` yanıtındaki **`mutedUserIds`** (R16'da eklendi).
Mobil bu alanı bugün **okumuyor** — `src/api/voice.ts`te tiplenip kullanılacak. WS olayları
(`voice.participant_muted`/`unmuted`) canlı güncelleme için dinlenir.

## §4 Taşı
- Hedef listesi: aynı ortamın diğer ses kanalları (`channelsApi.listByGuild`, mevcut uç).
- Mevcut kanal listede olmaz.
- Başarısızlıkta (dolu kanal, yaş kapısı, izin) sunucunun **Türkçe mesajı** gösterilir.
- 🔴 Taşınan taraf mobildeyse M4j akışı zaten çalışıyor — ona dokunma.

## §5 Hata ve geri bildirim
- 🔴 **Sessiz başarısızlık yasak.** Her uç çağrısının hata dalı kullanıcıya Türkçe mesaj gösterir.
- Başarıda kısa bir onay (mevcut uyarı deseni); yeni bildirim altyapısı yazılmaz.
- Odadan çıkarma **onay diyaloğu** ister (mevcut `ConfirmDialog`).

## §6 DoD
### Kod tarafı
- [ ] `npm run typecheck` · `npm run lint` temiz · `api/`+`web/` diffi sıfır · native diff yok
- [ ] `mutedUserIds` tiplendi ve etiket ondan türüyor; durum **eylemden önce** okunuyor (§3)
- [ ] Yetkisiz kullanıcıda moderasyon bölümü hiç çizilmiyor

### Cihazda (SAHİPTE)
- [ ] Yetkili olarak katılımcıya dokun → moderasyon eylemleri görünüyor
- [ ] Sustur → hedefin sesi VE kamerası kesiliyor; etiket "Susturmayı Kaldır"a dönüyor
- [ ] Susturmayı kaldır → gerçekten kalkıyor (webdeki D53 tuzağı mobilde tekrarlanmadı)
- [ ] Yayını durdur → video düşüyor, ses sürüyor
- [ ] Taşı → hedef kanala geçiyor; dolu/yaş-kapılı hedefte **sebep** görünüyor
- [ ] Odadan çıkar → onay çıkıyor, sonra hedef odadan düşüyor
- [ ] Yetkisiz hesapta bu eylemlerin **hiçbiri görünmüyor**
- [ ] Kendine ve ortam sahibine eylem görünmüyor

## §7 Dev'e notlar
1. §3'ü atlama; aynı kusuru ikinci istemcide üretmek en pahalı hatamız olur.
2. Sheet altyapısı mevcut; yeni desen icat etme.
3. `channel-edit.tsx` ve yeni kaydırıcı bileşeni **senin değil** — başka bir oturum orada çalışıyor.
4. Cihaz testi yapma, commit atma.
