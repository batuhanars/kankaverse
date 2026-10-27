# SPRINT C20: Cihazlar arası okundu senkronu

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip bulgusu + isteği. Sıra: **api → web + mobil.**
> Şema yok, migration yok. vc27 mağaza paketine girer (paket henüz yüklenmedi).
> **R7-nötr ama gizlilik dikkatli:** yeni olay YALNIZ okuyan kullanıcının kendi soketlerine gider. C12 okundu
> bilgisi (`dm:read`, `readReceiptDecision`) kuralına DOKUNULMAZ.

---

## §0 Bulgu ve kararlar

**Kusur (sahip, 2026-10-27):** web'den kendi hesabından DM gönderince mobil DM listesinde o sohbet okunmamış
(kırmızı) görünüyor; tersi de aynı. **Kök sebep sunucuda:** `GET /dm/channels` `unread`i
`lastMsg.createdAt > member.lastReadAt` ile hesaplıyor ve mesaj GÖNDERMEK gönderenin `lastReadAt`ini ilerletmiyor.
Diğer cihaz listeyi yeniden çektiğinde (odak/uygulamaya dönüş) kendi mesajı okunmamış sayılıyor. İstemcilerin
canlı `dm.message` dalı kendi mesajını zaten atlıyor; kusur orada değil.

**İstek:** bir cihazda okununca/cevaplanınca diğer cihazdaki kırmızılık kaybolsun.

**Kilitli kararlar:**
1. **Göndermek = okumak.** Bir kullanıcı bir kanala mesaj gönderdiğinde o kanaldaki okuma işaretçisi mesajın
   `createdAt`ine ilerler. DM/grup DM: `ChannelMember.lastReadAt`. Ortam kanalı: `ChannelRead.lastReadAt` (upsert).
   Önce ortam kanalında da aynı kusurun olup olmadığını kodla doğrula (okunmamış hesabı neye bakıyor); varsa
   aynı kural, yoksa dokunma ve raporla.
   Gönderim sırasında **karşı tarafa `dm:read` yayınlanmaz** (C12'nin tiki "okudu" demek, "cevap yazdı" değil;
   mevcut davranış korunur).
2. **Kendi cihazlarına okundu olayı:** `markRead` (DM ve ortam kanalı, ayrıca `channels/read-all`) yazımdan sonra
   `realtime.emitToUser(okuyan, 'read:self', { channelId | channelIds, guildId|null, readAt })`. Gönderim
   sırasında ayrıca yayın gerekmez: diğer cihaz zaten `dm.message` (senderId = ben) alıyor; ortam kanalında
   yazara `channel.activity` gitmiyor, bu yüzden ortam kanalı gönderiminde de `read:self` yayınlanır.
   Yayın hatası okumayı bozmaz (mevcut `emitReadReceipt` deseni, try/catch).
3. **İstemci (web + mobil):**
   - `dm.message` ile `senderId === ben` gelirse o DM `unread = false` (cevapladım = okudum).
   - `read:self` gelince ilgili DM'in `unread`i düşer; ortam kanalıysa kanal/ray okunmamış rozeti düşer
     (mevcut "kanalı okudum" yolunu yeniden kullan, kopya mantık yazma).
   - Mobil: uygulama açıkken aynı sohbetin sistem bildirimleri de temizlenir, eğer mevcut M5e "sohbete girince
     bekleyen bildirimleri temizle" yardımcısı varsa onu çağır. Yoksa ekleme, raporla.

**OUT:** uygulama arka planda/kapalıyken telefonun bildirim çekmecesini temizlemek (veri-yalnız push gerekir →
PLAN D62, dördüncü gerekçe olarak yazılır) · okundu bilgisi (C12) davranış değişikliği · şema değişikliği.

**Uygulama notu (PM onayı, 2026-10-27):** ortam kanalında kusur YOK (okunmamış sayımı `authorId != ben`).
Bu yüzden ortam gönderiminde işaretçi de `read:self` de eklenmedi; ortamda `read:self` yalnız `markRead` /
`read-all`'da. Yan etki (kabul): DM'de cevap yazmak karşı tarafın gördüğü okundu zamanını da ilerletir;
`readReceiptDecision` kapılarından geçer, `dm:read` yayını yok.

## §1 Backend
- Mesaj oluşturma yolunda (REST ve varsa WS gönderimi; hepsi tek servis fonksiyonundan geçiyorsa orada) gönderenin
  okuma işaretçisini ilerlet. Aynı transaction'da ya da hemen ardından; mesaj oluşturmayı yavaşlatan ek sorgu sayısı
  1'i geçmesin.
- `read:self` yayını: DM `markRead`, kanal `markRead`, `read-all`, ortam kanalı gönderimi.
- Testler: gönderim sonrası gönderenin `GET /dm/channels`'ta `unread: false`; karşı tarafın `unread: true`
  (değişmedi); gönderimde `dm:read` YAYINLANMIYOR; `read:self` yalnız okuyana gidiyor; ortam kanalı (varsa) aynı.

## §2 Web
`useSocket.ts` + `stores/dm.ts` (+ kanal okunmamış store'u): §0.3 kuralları. Yeni olay tipi.

## §3 Mobil
`realtime/socket.ts` + `stores/dm.ts` (+ `stores/unread.ts`): §0.3 kuralları.

## §4 DoD
- [ ] api: göndermek okuma işaretçisini ilerletiyor (DM + gerekirse ortam kanalı), `read:self` yayını, testler
- [ ] web + mobil: `read:self` ve kendi `dm.message`'ım unread düşürüyor
- [ ] build/test: api `tsc --noEmit` (bilinen 2) + jest; web `vue-tsc -b` (bilinen 6) + eslint dokunulan + `vite build`;
      mobil typecheck + lint
- [ ] PLAN D62'ye dördüncü gerekçe: "başka cihazda okununca çekmecedeki bildirimi temizlemek"
- [ ] Sahip turu (iki cihaz): web'den gönder → mobil listede kırmızı yok (uygulamaya dönünce de); mobilde gelen
      DM'i web'de aç → mobilde kırmızı anında söner; tersi; ortam kanalı aynı

## §5 Sapma kuralı
**DUR:** C12 `dm:read` / `readReceiptDecision` değişikliği · şema · `read:self`in başka kullanıcıya gitmesi ·
mesaj gönderim yolunda davranış değişikliği (yalnız işaretçi + yayın eklenir).
