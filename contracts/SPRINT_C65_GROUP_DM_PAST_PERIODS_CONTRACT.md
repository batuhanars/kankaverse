# SPRINT C65: Geri eklenen üye önceki üyelik dönemlerinin mesajlarını görür

> Durum: **KİLİTLİ (2026-11-13, sahip onayı; geriye dönük doldurma YOK).** PM compose (Opus). Yalnız api.
> 🔴 **R7:** grup DM mesaj görünürlüğü (E2 §2.5 süzgeci). Sahip incelemesi olmadan main'e girmez.

## §0 Sorun (sahip bulgusu)
Ayla grupta mesaj attı, çıkarıldı/ayrıldı (mesaj eski grupta göründü), geri eklendi, sayfa yenilendi: mesaj kayboldu.
Sebep: E2 §2.5 "katılım öncesi şifreli mesaj yok" süzgeci katılımı EN SON `ChannelMember.createdAt` sayıyor; geri
eklenince önceki üyelik döneminin şifreli mesajları da "katılım öncesi" sayılıyor.

## §1 Kural
Kullanıcı, üye olduğu HER dönemin mesajlarını görür; dönemler ARASINDAKİ (dışarıdayken atılmış) şifreli mesajlar
görünmez. Düz mesaj davranışı değişmez. Bu kural süzgecin tüm yüzeylerinde aynı tek yardımcıdan geçer.

## §2 Şema
```prisma
model GroupDmPastPeriod {
  id        String   @id @default(cuid())
  channelId String
  userId    String
  joinedAt  DateTime // o dönemin ChannelMember.createdAt'i
  leftAt    DateTime // ayrılma/çıkarılma anı (C62 leftAt ile aynı an)
  @@index([channelId, userId])
}
```

## §3 Yazım
- `deleteGroupMembership` (C62/C64 ortak yol): `GroupDmPastPeriod` satırı departure + üyelik silme + olay + E2EE ile
  AYNI tx'te eklenir. Geri eklemede SİLİNMEZ (departure silinmeye devam eder).
- `deleteDeparture` ("Sohbeti sil"): kullanıcının o kanaldaki TÜM `GroupDmPastPeriod` satırları da aynı tx'te silinir
  (sildiği geçmiş geri eklenince geri gelmez).
- Hesap imhası (`purge.job.ts`): kullanıcının tüm satırları silinir (KVKK).

## §4 Süzgeç (tek yardımcı, `common/utils/pre-join.util.ts`)
- `groupJoinedAt` yerine `groupVisibility(prisma, channel, userId)` → `{ joinedAt: Date, periods: {from, to}[] } | null`
  (GROUP_DM değilse null). Eski üyede `joinedAt` = departure.joinedAt (C62 penceresi aynen, `leftAt` üst sınırı ayrıca).
- `preJoinEncryptedFilter(visibility)`: şifreli VE `createdAt < joinedAt` VE hiçbir dönemin `[from, to]` aralığında
  OLMAYAN mesaj dönmez. `isHiddenBeforeJoin(message, visibility)` bellek içi karşılığı.
- Tüm kullanım yerleri yeni imzaya geçer: `findMessages` (aktif + eski üye), DM listesi `lastMessage` (aktif ve eski
  grup öğesi), `toMessageDto` replyTo gizleme, messages.service'teki diğer iki kullanım (~1362, ~1411; neyse aynısı),
  ve C64 olay penceresi (aktif üye: `>= joinedAt` VEYA bir dönem içinde; eski üye: C62 penceresi VEYA önceki dönem).
- Şikâyet kanıtı (C62 §2.3.c) hedef/bağlam kontrolü aynı görünürlükle.

## §5 Testler (jest + DB spec)
Ekle → mesaj m1 → çıkar → dışarıdayken m2 → geri ekle → m3: üye m1 ve m3'ü görür, m2'yi görmez (sayfalama dahil);
iki kez çık-gir ile iki dönem; replyTo m2 ise alıntı gizli, m1 ise görünür; liste lastMessage kuralı; olay penceresi;
"Sohbeti sil" sonrası geri eklenince m1 görünmez; imha satırları siler; GROUP_DM dışı kanalda süzgeç yok (değişmedi);
geçmiş dönemi olmayan üyede davranış bit-bit eski.

## §6 Doğrulama
jest, `E2EE_DB_TESTS=1` DB spec'leri, `prisma generate`, `migrate status` temiz, `tsc -p tsconfig.build.json`,
derlenmiş sunucu açılışı. **Cihaz turu:** grupta Ayla mesaj atar, çıkarılır, dışarıdayken Kaan mesaj atar, geri
eklenir, yenile: Ayla'nın ilk mesajı görünür, aradaki görünmez, sonrakiler görünür.

## §7 Kapsam dışı
Geriye dönük doldurma (sahip: gerek yok). İstemci değişikliği yok.
