# SPRINT C62: Gruptan ayrılan/çıkarılan sohbeti kaybetmez + mobil ortam rail'i anlık

> Durum: **KİLİTLİ (2026-11-13, sahip onayı).** PM compose (Opus). api + web + mobile.
> 🔴 **R7 bölgesi:** grup üyeliği ve mesaj okuma yetkisi (§1). Sahip satır satır incelemeden main'e girmez.

## §0 Sorun ve hedef (sahip isteği, 2026-11-13)
Bugün gruptan ayrılma/çıkarılmada `ChannelMember` satırı silinir; liste üyelikten kurulduğu için grup sayfa
yenilenince DM listesinden kaybolur, geçmiş de gider. Hedef: kişi ister çıkarılsın ister kendi ayrılsın,
grup listede kalır; içine girince ayrıldığı ana kadarki mesajlar okunur, mesaj kutusu yerine
"artık mesaj gönderemezsin" bandı çıkar; kullanıcı isterse sohbeti siler.
Ortamda (§5): atılan/ayrılan kişinin rail'inden ortam anında düşer. Web'de var, mobilde dinleyici yok.

## §1 Tasarım ilkesi (R7, değişmez)
- `ChannelMember` silme davranışı **AYNEN KALIR.** Gönderme, tepki, sabitleme, yazıyor, okundu, arama, push,
  soket odası, E2EE cihaz listesi gibi her kapı üyelik satırına bakmaya devam eder; eski üye hepsinde kapalı kalır.
- Eski üyenin yeni hakları yalnız iki: **ayrıldığı ana kadarki mesaj listesini okumak** (§2.3) ve **o penceredeki
  mesajları şikâyet etmek** (§2.3.c, Rev.2). Başka hiçbir uç bu kayda bakarak yetki vermez.
- `requireChannelAccess` / `requireChannelVisible` DEĞİŞMEZ.

## §2 Sunucu (api/)
### §2.1 Şema
Yeni model (migration + `prisma generate`):
```prisma
model GroupDmDeparture {
  id        String          @id @default(cuid())
  channelId String
  userId    String
  joinedAt  DateTime        // silinen ChannelMember.createdAt (katılım öncesi şifreli filtre için)
  leftAt    DateTime        @default(now())
  reason    DepartureReason // LEFT | REMOVED
  clearedAt DateTime?       // silinen üyeliğin G4 clearedAt'i taşınır
  memberIds String[]        // ayrılma anında DİĞER üyeler (liste başlığı/avatarı için; sonrası sızmaz)
  @@unique([channelId, userId])
  @@index([userId])
}
enum DepartureReason { LEFT REMOVED }
```
`E2eeFormerMember` ayrı kalır (E2EE amaçlı, yalnız şifreli grupta); birleştirilmez.

### §2.2 Yazım
- `deleteGroupMembership` (ayrılma + çıkarma ortak yolu): departure upsert, `ChannelMember.delete` ve E2EE
  işlemleriyle **AYNI transaction**. `reason`: `leaveGroupDm` → LEFT, `removeGroupMember` → REMOVED.
- `addGroupMember`: hedefin departure satırı üyelik `create` ile aynı transaction'da silinir (geri eklenen
  normal üyedir; aradaki mesajlar bugünkü E2 kuralıyla görünmez).
- Commit sonrası ayrılan kullanıcının tüm soketlerine `dm.group_departed { channelId, reason, leftAt }`.
- Kalan < 2 ile kanal soft-delete kuralı DEĞİŞMEZ (§6 açık kalem).

### §2.3 Okuma
- `GET /dm/channels` (getDmChannels): kullanıcının departure satırları, kanalı silinmemiş olanlar için
  `GROUP_DM` öğesi olarak eklenir. Ek alan: `departed: { leftAt: string, reason: 'LEFT' | 'REMOVED' } | null`
  (aktif gruplarda `null`). Eski üye öğesi: `members` = `memberIds`'in güncel kullanıcı adı/avatarı,
  `adminIds: []`, `lastMessage` = `leftAt` ve öncesi, `clearedAt` sonrası, katılım filtresinden geçen son mesaj;
  `unread: false`, `lastReaction: null`, `receiptsEnabled: false`, `groupAllReadAt: null`. `name` güncel kanal adı.
  Sıralama bugünkü tek kural (son mesaj tarihi).
- `GET /channels/:id/messages` (`findMessages`): `requireChannelAccess` `NOT_CHANNEL_MEMBER` verirse VE kanal
  `GROUP_DM` VE çağıranın departure satırı varsa, pencere `createdAt <= leftAt` (+ `clearedAt` sonrası,
  `joinedAt` ile katılım öncesi şifreli filtre) ile sayfa döner. Yeni yardımcı:
  `MembershipService.requireGroupHistoryAccess(userId, channelId)` → `{ channel, window }`; YALNIZ `findMessages`
  çağırır. Diğer her durumda hata bugünkü gibi aynen fırlar.
- Yeni uç: `DELETE /dm/groups/:id/departure` (envelope, `data: null`). Yalnız çağıranın kendi satırını siler;
  satır yoksa 404 `DEPARTURE_NOT_FOUND`. Event yok (yerel etki).
- `POST /dm/channels/:id/read` eski üyede bugünkü 403'ü verir; istemci bu kanalda çağırmaz.

### §2.3.b Pencere sıkılaştırma (Rev.1, sahip kararı 2026-11-13: borç bırakılmaz)
Eski üyenin penceresi (`findMessages` + liste `lastMessage`) mesajı değil, mesajın `leftAt` anındaki HALİNİ verir:
- **Tepkiler:** yalnız `createdAt <= leftAt` tepkiler (tepki değişimi sil+oluştur olduğu için birebir doğru).
- **Düzenleme:** `editedAt > leftAt` ise içerik verilmez: `content: ''`, `ciphertext` yok, `frankingTag` yok,
  `mentions: []`, `embeds` yok; DTO'ya `editedAfterLeave: true` (diğer her durumda alan yok). Ekler kalır.
  Aynı kural `replyTo` alıntısında (alıntılanan mesaj `leftAt` sonrası düzenlendiyse `replyTo.content: ''` +
  `replyTo.editedAfterLeave: true`) ve listedeki `lastMessage`'ta (`lastMessage.editedAfterLeave: true`).
  İstemci: bayrak varsa gövde/şifre çözme yerine i18n "Bu mesaj sen ayrıldıktan sonra düzenlendi" (E2EE
  `e2eeStatus` etiketinden ÖNCE bakılır, yerel depo kaydı bu mesaj için gösterilmez).
- **Silinmiş hesap (KVKK):** hesap imhası (`purge.job.ts`) kullanıcının KENDİ `GroupDmDeparture` satırlarını
  siler. Eski grup listesinde `members`'tan `deletedAt` dolu kullanıcılar çıkarılır.
Testler: leftAt sonrası tepki görünmez, öncesi görünür; leftAt sonrası düzenlenen mesaj (düz + şifreli) içeriksiz +
bayraklı, öncesi düzenlenen normal; replyTo ve lastMessage aynı; aktif üyede bayrak hiç yok; imha departure'ı
siler; silinmiş üye `members`'ta yok.

### §2.3.c Şikâyet (Rev.2, T&S: mağdura çıkış yolu)
Eski üye, penceresindeki mesajları ŞİKÂYET EDEBİLİR (çıkarılan kişi çoğu zaman mağdurdur). `ReportEvidenceService.requireAccess`:
`requireChannelAccess` `NOT_CHANNEL_MEMBER` verirse `requireGroupHistoryAccess` denenir (`findMessages` ile aynı kalıp);
hedef `createdAt <= leftAt` ve `clearedAt` sonrası olmalı, aksi 422 (bugünkü `invalidEvidence`). Şifresiz bağlam
mesajları ve şifreli kanıt doğrulaması aynı pencereyle sınırlanır (`leftAt` sonrası hiçbir satır kanıta girmez).
Yabancı yine 403. Bu, eski üyeye tanınan İKİNCİ ve SON yetkidir (§1 güncellendi). İstemcide eski grupta
"Şikâyet et" AÇIK kalır (Kopyala + Şikâyet et). Testler: eski üye pencere içi şikâyet 201; leftAt sonrası hedef 422;
bağlam leftAt sonrasını içermez; yabancı 403.

### §2.3.d Sesli aramadan düşürme (Rev.3, T&S, bugün de var olan açık)
Bugün gruptan ayrılma/çıkarma ve ortamdan atma/yasaklama/ayrılma, kişiyi o anki LiveKit oturumundan düşürmüyor;
çıkarılan kişi aramayı dinlemeye devam edebiliyor. Kural: üyelik silinen kullanıcı, o kanalın (grup DM) ya da o
ortamın TÜM ses kanallarının LiveKit odasından commit sonrası düşürülür (`roomService.removeParticipant`, best-effort,
hata işlemi düşürmez; mevcut `pullSelfFromVoice` kalıbı). Kendi ayrılmasında da aynı. Testler: grup çıkarma/ayrılmada
ve ortam kick/ban/leave'de removeParticipant doğru oda + kullanıcıyla çağrılır; LiveKit hatası işlemi bozmaz.

### §2.4 Testler (jest)
Ayrılma ve çıkarmada departure satırı doğru `reason`/`joinedAt`/`clearedAt`/`memberIds` ile, üyelik silme ile tek
tx; geri eklemede satır silinir; liste eski grubu `departed` ile döner, `lastMessage` `leftAt` sonrasını içermez;
`findMessages` eski üyeye yalnız pencereyi verir, `leftAt` sonrası mesaj ASLA dönmez (sayfalama dahil);
departure'sız yabancı yine 403; eski üye mesaj gönderemez/tepki veremez/okundu yazamaz (403, mevcut kapı);
`DELETE .../departure` yalnız kendi satırı; kanal soft-delete olunca eski üye listesinde görünmez;
`dm.group_departed` yalnız ayrılana.

## §3 Web (web/)
1. Tip: `GroupDmChannel.departed` (yukarıdaki şekil). Store `dm.group_departed` olayında kanalı yerinde
   `departed` yapar (sayfa yenilemeden band çıkar); açık sohbet varsa aynı anda kilitlenir.
2. `DmConversation`: `departed` iken composer yerine band. Metin i18n: REMOVED → "Bu gruptan çıkarıldın,
   artık mesaj gönderemezsin." · LEFT → "Bu gruptan ayrıldın, artık mesaj gönderemezsin." Bandın yanında
   "Sohbeti sil" düğmesi (onaylı `ConfirmDialog`).
3. Eski grupta kapalı: yanıtla, tepki, düzenle, sil, sabitle, arama düğmeleri, üye/yönetim paneli, okundu
   çağrısı, yazıyor yayını. Kopyala açık kalır. E2EE "bu cihaz çıkarıldı" bandı `departed` iken GÖSTERİLMEZ
   (tek band). E2EE motoru eski grupta Welcome/senkron tetiklemez; çözme yalnız yerel depodan.
4. DM listesi: eski grup normal satır gibi, okunmamış rozeti yok; sağ tık menüsünde yalnız "Sohbeti sil".
5. Silince store'dan düşer; açıksa ana DM ekranına dönülür.

## §4 Mobil (mobile/)
§3'ün aynısı RN'de: tip, `dm.group_departed` dinleyicisi, `dm/[id]` ekranında composer yerine band
(mevcut `disabledNotice` yolu genişletilir, ikinci band yazılmaz), kapalı eylemler, liste/uzun basma
menüsünde "Sohbeti sil". i18n tek kaynak.

## §5 Mobil ortam rail'i (ayrı küçük iş)
Mobil soket `guild.member_left` dinler: `userId` bensem ortam store'dan düşer, o ortamın ekranı açıksa ana
ekrana dönülür. `guild.joined` gelince ortam listesi yeniden çekilir (web ile parite). Web'de atılan kişi o
ortamın kanalını açık tutuyorsa yönlendirme olduğunu dev teyit eder; yoksa aynı kural eklenir.

## §6 Kapsam dışı / açık kalemler
- Kanal soft-delete olan grup (kalan < 2 ya da kurucu sildi) eski üyede de görünmez (bugünkü davranış).
- Geriye dönük doldurma yok: bu sürümden önceki ayrılmalar listeye geri gelmez.
- Kalan üyelere canlı "X ayrıldı" sistem satırı ve üye listesi canlı güncellemesi bu işte yok.
- Bildirim "Yeni mesaj" sorunu (E3 sınırı) ayrı iş.

## §7 Doğrulama
api: jest spec'ler, `prisma generate`, `migrate status` temiz (yerel DB'ye uygulandı), `tsc -p tsconfig.build.json`.
web: `vue-tsc -b` (6 bilinen), eslint dokunulan dosyalar, `vite build`. mobile: `tsc --noEmit`, jest varsa.
**Cihaz turu (sahip):** (1) Ayla'yı gruptan çıkar: Ayla'nın açık tarayıcısında anında band, yenileyince grup
listede, eski mesajlar okunuyor; Kaan'ın yeni mesajı Ayla'ya gelmiyor, bildirim gitmiyor. (2) Ayla kendi
ayrılsın: "ayrıldın" bandı. (3) Sohbeti sil: listeden gider, yenileyince geri gelmez. (4) Ayla'yı geri ekle:
normal sohbet, mesaj atılıyor. (5) Mobilde aynı 1-4. (6) Mobilde ortamdan at: rail'den anında düşer.
