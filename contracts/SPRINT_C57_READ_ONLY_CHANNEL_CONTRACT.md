# C57 — Salt Okunur Metin Kanalı

> Sahip isteği 2026-11-09: duyuru tipi kanallarda (ör. güncelleme notları) üyeler yalnız okusun.

## 1. Veri

- `Channel.readOnly Boolean @default(false)`. Migration `20261109200000_c57_channel_read_only`.
- `ChannelDto.readOnly: boolean` (her kanal DTO'sunda döner).
- `PATCH /channels/:id` gövdesine `readOnly?: boolean` (yetki: mevcut `MANAGE_CHANNELS`).
  Envelope standart: `{ success, statusCode, data: ChannelDto }`.

## 2. Kural (sunucu otorite)

- `POST /channels/:id/messages`: kanal ortam kanalıysa ve `readOnly` ise gönderen `MANAGE_CHANNELS`
  (OWNER / ADMINISTRATOR dahil) taşımalı; yoksa **403 `CHANNEL_READ_ONLY`**,
  mesaj "Bu kanala yalnız yetkililer yazabilir."
- Webhook yolu bu kapıdan geçmez (webhook'u `MANAGE_WEBHOOKS` sahibi kurar).
- Tepki, okuma, sabitleme, kendi eski mesajını düzenleme/silme etkilenmez.

## 3. İstemci (yalnız UX)

- Kanal ayarlarında yalnız `GUILD_TEXT` için "Salt okunur" anahtarı (web ChannelPanel, mobil channel-edit;
  mobilde parametre taşınmazsa anahtar gösterilmez/gönderilmez).
- Yazamayan üye: mesaj kutusu yerine "Bu kanala yalnız yetkililer yazabilir." satırı; Yanıtla gizlenir.
- Hata kodu `CHANNEL_READ_ONLY` i18n'de (`message.errors`).

## 4. DoD

- [x] API birim testleri: yetkisiz 403, yetkili geçer.
- [ ] Web: anahtar kaydediliyor; yetkisiz hesapta kutu yerine bilgi satırı, Yanıtla yok.
- [ ] Mobil (cihazda): aynı iki madde.
- [ ] Canlıda migration uygulandı (`migrate status` temiz).
