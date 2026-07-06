# SPRINT C10 — Kullanıcı Kartı Zenginleştirme (UserCardPopover)

> Discord-referanslı kart iyileştirmeleri. Ortak arkadaş satırı C5'te bitmişti; bu sprint inline mesaj
> kutusu, rol rozetleri ve ses durumu ekler. **Tek doğruluk kaynağı** — endpoint/DTO/enum buradan sapmaz.

## Kapsam

1. **Inline mesaj kutusu** — "Mesaj" butonu kaldırıldı; yerine kartın içinde metin kutusu. Kullanıcı mesajını
   yazar → Enter → DM kanalı açılır (arkadaş değilse PENDING istek) + ilk mesaj gönderilir + DM'e geçilir.
   Alıcı içeriği görüp kabul/reddeder. İzin yoksa kutu gösterilmez, jenerik not çıkar.
2. **Rol rozetleri** — yalnız kart bir **ortam bağlamında** açıldığında (guildId geçilir). @everyone hariç,
   pozisyona göre yüksekten alçağa. Renk noktası + isim çip.
3. **Ses durumu** — hedef aktif bir **GUILD_VOICE** kanalındaysa "Sesli aramada / Görüntülü / Yayında" rozeti.
   Tıkla → o kanala git. DM aramaları kapsam dışı (ertelendi).
4. **Üye sağ-tık menüsü** — üye panelinde satıra **sağ-tık** (⋯ butonu da kalır) → imleç konumunda menü.
   İçerik: Profil (kart aç) · Mesaj Gönder · [moderasyon: Rolleri Yönet/At/Yasakla/Sahipliği Devret, yetkiye göre] ·
   Kullanıcı ID'sini Kopyala. **Sadece var olan aksiyonlar** — ilişki-durumu gerektirenler (arkadaş ekle/çıkar,
   engelle) kartta kalır (kart o durumu zaten çeker; menüde placeholder olmaz). Frontend-only.

## Endpoint

```
GET /users/:id/card?guildId=<opsiyonel>
→ envelope { success, statusCode:200, data: UserProfileCardDto }
```
- `guildId` verilmezse `roles: []`.
- Erişim kapısı (mevcut, değişmedi): ortak ortam VEYA ilişki (arkadaş/blok/GROUP_DM) yoksa 404.

## DTO (eklenen alanlar)

```ts
interface UserProfileCardDto {
  // ...mevcut alanlar...
  canMessage: boolean            // canDm(caller,target).allowed — inline kutu kapısı (jenerik boolean)
  roles: { id, name, color }[]   // yalnız guildId + ortak üyelik; aksi hâlde []
  voiceStatus: {                 // aktif GUILD_VOICE + caller erişimi; aksi hâlde null
    channelId, channelName, guildId, guildName,
    streaming: boolean,          // ekran paylaşımı
    video: boolean               // kamera
  } | null
}
```

## T&S / R7 kapıları (insan incelemesi noktası)

- **canMessage**: `DmPermissionService.canDm` otoritesini yeniden kullanır (karar fonksiyonu DEĞİŞMEDİ, yalnız
  `allowed` boolean'ı yüzeye taşınır). Neden jenerik: reddedilme sebebi (blok/minör/NONE/yeni-hesap) sızmaz (G3).
- **roles**: caller o ortamın üyesi değilse `[]`. Yeni ifşa yok — üye listesi rolleri zaten üyelere görünür.
- **voiceStatus**: caller o ortamın üyesi değilse `null`. Ses katılımcı listesi zaten ortam üyelerine görünür
  (VoiceParticipantList), kart aynı kapıyı kullanır → **yeni disclosure yüzeyi değil**. Kaynak: VoiceSession
  (leftAt=null) yalnız ADAY kanalı bulur → `VoiceService.getLiveParticipation` ile **CANLI LiveKit doğrulaması**
  yapılır. **Fail-closed**: LiveKit erişilemez/hatalıysa VEYA kullanıcı gerçekten odada değilse `null`. VoiceSession
  tek başına ASLA "sesli aramada" göstermez — dev'de (webhook localhost'a ulaşmaz) ve prod'da (kaçan webhook) bayat
  kalabilir; bayat kayda dayanıp yanlış konum ifşası yapılmaz. DM aramaları kapsam dışı.
- **minör**: hiçbir alan yaş/minör statüsü taşımaz (mevcut kart garantisi korunur).

## Dokunulan dosyalar

**api/**: `users.service.ts` (DTO + getGuildRoles + getVoiceStatus + canDm/voice inject), `users.controller.ts`
(guildId query), `users.module.ts` (VoiceModule import), `users.service.spec.ts` (+8 test, 34 geçer).

**web/**: `types/index.ts`, `api/users.ts` (getCard guildId), `components/shared/UserCardPopover.vue`
(inline kutu + roller + ses + afiş 80→106px), `i18n/tr.json` (userCard.* + member.actions.*). guildId geçen
çağıranlar: `MemberPanel.vue`, `MessageArea.vue` (→ MessageItem prop), `VoiceParticipantList.vue`.
Sağ-tık menü: `GuildMemberRow.vue` (teleport imleç-konumlu menü + sağ-tık) + `MemberPanel.vue` (openMenu/
messageMember/copyMemberId handler'ları).

## DoD

- [x] api build temiz + `users.service` 34 test geçer
- [x] web `vue-tsc --noEmit` temiz
- [ ] sahip local test (inline gönder / rol / ses) → commit onayı
- [ ] deploy sonrası `prisma migrate status` temiz (şema değişimi YOK — migration gerekmez)
