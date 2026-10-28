# SPRINT C28: Mobilde mesaj avatarında durum noktası + grup DM üye listesinde durum

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). Kullanıcı isteği (sahip iletti). **Yalnız mobil (JS)**, vc34.
> **R7-nötr:** çevrimiçi görünürlüğü sunucuda (`PresenceService.canSeePresence`: engelli göremez, minör yalnız
> kankasına görünür). İstemci yalnız `usePresenceStore`'da olanı çizer; görünürlük istemcide genişletilmez.

## §0 Neden
Grup DM'de ve ortam kanallarında kimin çevrimiçi olduğu anlaşılmıyor. Durum bugün yalnız 1-1 DM başlığında,
Kanka şeridinde ve ortam kanalının Üyeler sekmesinde (`ChannelMembersTab`) görünüyor. Grup DM Üyeler sekmesinde
(`components/dm/GroupMembersTab.tsx`) hiç yok.

## §1 Mesaj avatarında durum noktası (`components/MessageBubble.tsx`)
1. Avatar gösterilen her başkasının mesajında (`identityVisible && showAuthor`; grup DM ve ortam kanalı), avatarın
   sağ alt köşesine küçük yuvarlak nokta.
2. **Yalnız `online` (yeşil), `away` (sarı), `dnd` (kırmızı).** `offline` için nokta **YOK** (gri değil).
   Gerekçe: görünürlüğü gizlenmiş kişi de istemciye çevrimdışı geliyor; gri nokta "kapalı" diye yanlış kesin iddia olur.
   Bilinçli Discord'dan sapma: Discord mesaj avatarına nokta koymuyor; offline'ı göstermeyerek gürültü düşük tutuluyor.
3. Nokta, mesaj arka planından ayrışsın diye ekran zemin rengiyle ince halka (kenarlık) taşır. Boyut/renk token'dan.
4. Canlı güncellenir (`usePresenceStore(selectStatus(authorId))`). Her baloncuk tüm haritaya değil, yalnız kendi
   yazarının durumuna abone olur (liste performansı).
5. Erişilebilirlik: avatarın `accessibilityLabel`'ı noktalı durumda `username` + durum metni (`presence.*`, mevcut anahtar).

## §2 Grup DM Üyeler sekmesinde durum (`components/dm/GroupMembersTab.tsx`)
1. Üyeler iki bölüm: `member.online` ("Çevrimiçi — {n}") ve `member.offline` ("Çevrimdışı — {n}"),
   C26'daki ortam listesiyle aynı başlıklar. Grup DM'de rol yok, hoist grubu yok. Boş bölüm gösterilmez.
2. Her satırın avatarında durum noktası; **bu listede çevrimdışı da gri nokta alır** (üye listesi + Kanka şeridi ile
   tutarlı, bölüm başlığı zaten durumu söylüyor).
3. Bölüm içi sıra bugünkü gibi korunur. Mevcut eylemler (çıkar, sahiplik vb.) davranış değiştirmez.

## §3 Ortak parça (Rule of Three)
Durum→renk eşlemesi şu an `home/FriendsStrip.tsx` ve `app/(app)/dm/[id].tsx` içinde ayrı ayrı tanımlı; bu sprint
3. ve 4. kullanımı ekliyor. Tek yere çıkar (örn. `components/PresenceDot.tsx` + renk eşlemesi `theme`'den), mevcut
iki yer de onu kullansın. Web karşılığı: `web/src/components/shared/PresenceDot.vue`. Yeni token uydurma.

**OUT:** sunucu/API değişikliği · web değişikliği · ortam kanalı Üyeler sekmesi (C26'da tamam) · 1-1 DM başlığı (var).

## §4 DoD
- `npm run typecheck`, `npm run lint` temiz. `app.json` versionCode 33 → 34.
- Sahip turu (telefon): grup DM ve ortam kanalında çevrimiçi kişinin avatarında yeşil, çevrimdışında nokta yok;
  biri çıkınca nokta canlı kaybolur; grup DM Üyeler sekmesinde Çevrimiçi/Çevrimdışı bölümleri doğru.
