# SPRINT C64: Grup DM olay satırları ("Ayla ayrıldı") + kalan üyelerde anlık üye listesi

> Durum: **KİLİTLİ (2026-11-13, sahip onayı: (a) çıkaranın adı yazar, (b) ekleme satırı da var).** PM compose (Opus).
> api + web + mobile. 🔴 **R7 (küçük):** eski üyenin olay okuma kapısı (§2.3), C62 penceresiyle birebir.

## §0 Sorun
1. Gruptan çıkarma/ayrılmada kalan üyelerin ekranında kişi üye listesinden yenilemeden düşmüyor; eklemede de
   yeni üye anında görünmüyor (kalan üyelere hiçbir olay gitmiyor, C62 §6).
2. Sohbette üyelik değişikliği iz bırakmıyor. İstenen: sohbetin akışında ortalanmış ince satır
   ("Ayla gruptan ayrıldı", "Kaan, Ayla adlı kişiyi gruptan çıkardı", "Kaan, Ayla adlı kişiyi gruba ekledi").

## §1 Tasarım ilkesi
- Olay bir **Message DEĞİLDİR**: ayrı tablo. Okunmadı, bildirim/push, son mesaj önizlemesi, liste sıralaması,
  şifreleme, arama, yedek, şikâyet hattına GİRMEZ. Görünümü E2 "yeni cihaz eklendi" satırıyla aynı aile.
- Olay, üyelik değişikliğiyle **aynı transaction'da** yazılır (olay var ↔ değişiklik oldu).
- Grup kurulumunda ilk üyeler için olay yazılmaz.
- Türkçe ek uyumu (Ayla'yı / Ali'yi) kullanıcı adında güvenilir yapılamaz: metinler ek gerektirmeyen kalıpla yazılır (§4).

## §2 Sunucu (api/)
### §2.1 Şema
```prisma
model GroupDmEvent {
  id        String           @id @default(cuid())
  channelId String
  kind      GroupDmEventKind // MEMBER_ADDED | MEMBER_LEFT | MEMBER_REMOVED
  actorId   String?          // ekleyen/çıkaran; MEMBER_LEFT'te null
  targetId  String           // eklenen/ayrılan/çıkarılan
  createdAt DateTime         // üyelik değişikliğiyle AYNI an (açıkça verilir, @default değil)
  @@index([channelId, createdAt])
}
enum GroupDmEventKind { MEMBER_ADDED MEMBER_LEFT MEMBER_REMOVED }
```
### §2.2 Yazım
- `addGroupMember`: tek `at = new Date()`; `ChannelMember.create` `createdAt: at` + departure silme + E2EE işlemleri +
  `GroupDmEvent(MEMBER_ADDED, actor=çağıran, target, createdAt: at)` AYNI tx.
- `deleteGroupMembership` (C62 ortak yol): `leftAt` ile aynı an; LEFT → `MEMBER_LEFT` (actor null), REMOVED →
  `MEMBER_REMOVED` (actor=çıkaran; imzaya `actorId` eklenir). AYNI tx.
- Commit sonrası realtime `dm.group_event`, payload `{ channelId, event: GroupDmEventDto, member?: {id, username,
  avatarUrl, avatarAnimatedUrl} }` (`member` yalnız MEMBER_ADDED'de). Alıcılar: değişiklik SONRASI grubun tüm üyeleri
  + ayrılan/çıkarılan kişi (kendi ekranında satır anında çıksın). Mevcut `dm.group_departed` aynen kalır.
- Kanal soft-delete olduysa (kalan < 2) olay yine yazılır, yayın kalan üyeye ve ayrılana gider.
### §2.3 Okuma
- `GET /dm/groups/:id/events` → envelope, `data: GroupDmEventDto[]` (eskiden yeniye, en çok son 200).
- Pencere: aktif üye `createdAt >= ChannelMember.createdAt` (ve G4 `clearedAt` varsa `> clearedAt`); eski üye
  (`GroupDmDeparture` var, ChannelMember yok) `>= departure.joinedAt` ve `<= leftAt` (`clearedAt` sonrası).
  İkisi de yoksa 403 `NOT_CHANNEL_MEMBER` (jenerik). Eski üyeye tanınan ÜÇÜNCÜ yetki; C62 §1'deki "başka hiçbir uç"
  ifadesi bu uçla genişler, başka uç eklenmez.
- `GroupDmEventDto`: `{ id, channelId, kind, actor: {id, username} | null, target: {id, username}, createdAt }`
  (adlar okuma anındaki güncel kullanıcı adı).
### §2.4 Testler
Ekleme/ayrılma/çıkarmada tek olay, doğru kind/actor/target, üyelikle aynı tx ve aynı an; kurulumda olay yok; pencere
(aktif: katılım öncesi olay dönmez; eski üye: leftAt sonrası dönmez, kendi çıkarılma olayı döner); yabancı 403;
`dm.group_event` alıcıları (kalanlar + ayrılan; eklemede `member` dolu); olay okunmadı/push/lastMessage üretmez.

## §3 Web (web/)
1. Sohbet açılışında mesajlarla birlikte `GET .../events` çekilir; olaylar mesaj akışına `createdAt`'e göre ortalanmış
   satır olarak karışır (mevcut "yeni cihaz eklendi" satırı bileşeni/stili örnek alınır). Daha eski mesaj sayfası
   varken en eski yüklü mesajdan eski olaylar gösterilmez (sayfa yüklenince görünür).
2. `dm.group_event`: açık sohbette satır anında eklenir; DM store'da üye listesi güncellenir (ADDED → `member`
   eklenir, LEFT/REMOVED → hedef düşer; hedef bensem C62 `applyGroupDeparted` zaten çalışır). Üye paneli ve grup
   başlığı/avatar yığını anında güncellenir.
3. Olay okunmadı rozeti, bildirim, ses, liste sıralaması üretmez.

## §4 Metinler (i18n, tr.json; web + mobil aynı anahtarlar, mobil `mobile.*` altında kendi kopyası değil, ortak)
- ADDED: "{actor}, {target} adlı kişiyi gruba ekledi" · ben ekledim: "{target} adlı kişiyi gruba ekledin" ·
  beni eklediler: "{actor} seni gruba ekledi"
- REMOVED: "{actor}, {target} adlı kişiyi gruptan çıkardı" · ben çıkardım: "{target} adlı kişiyi gruptan çıkardın" ·
  beni çıkardılar: "{actor} seni gruptan çıkardı"
- LEFT: "{target} gruptan ayrıldı" · ben ayrıldım: "Gruptan ayrıldın"
Em dash yok; `@` geçerse `{'@'}` kaçışı.

## §5 Mobil (mobile/)
§3'ün aynısı: `dm/[id]` akışına olay satırları, `dm.group_event` dinleyicisi, store'da üye listesi, grup detay/üye
sekmesi anında güncel. Metinler §4.

## §6 Doğrulama
api: jest, `prisma generate`, `migrate status` temiz (yerel DB), `tsc -p tsconfig.build.json`, derlenmiş sunucu açılış
denemesi. web: `vue-tsc -b` (6), eslint dokunulan, `vite build`. mobile: `tsc --noEmit` (4), eslint dokunulan,
`npm run test:e2ee`.
**Cihaz turu:** Kaan Ayla'yı çıkarır → Kaan'da Ayla üye listesinden anında düşer, sohbette "Ayla adlı kişiyi
gruptan çıkardın"; diğer üyede "Kaan, Ayla adlı kişiyi gruptan çıkardı"; Ayla'da en altta "Kaan seni gruptan
çıkardı". Ayla kendi ayrılır → "Ayla gruptan ayrıldı". Geri ekle → "… gruba ekledi", Ayla listede anında belirir.
Sayfa yenilenince satırlar yerinde. Okunmadı rozeti/bildirim oluşmaz.

## §7 Kapsam dışı
Grup adı değişikliği/yönetici atama satırları; ortam (guild) için benzer satırlar.
