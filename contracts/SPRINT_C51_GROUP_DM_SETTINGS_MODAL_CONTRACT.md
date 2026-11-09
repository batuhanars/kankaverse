# SPRINT C51: Grup DM ayarları modalı + yeniden adlandırınca DM listesinin silinmesi

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip bulgusu ve isteği (masaüstü). **Yalnız web** (masaüstü web'i yükler).
> R7 dışı (yetki kararı değişmiyor; yeniden adlandırma sunucuda zaten yalnız sahibe açık).

## §0 Sorun ve karar

**Hata:** grup DM yeniden adlandırılınca soldaki DM listesi komple boşalıyor. Kök neden: `PATCH /dm/groups/:id` yalnız `{ id, name }` döndürüyor (`api/src/modules/dm/dm.service.ts` `renameGroupDm`), web store'u (`web/src/stores/dm.ts` `renameGroup`) bu iki alanı kanalın bütün kaydının YERİNE yazıyor. Tür, üyeler, son mesaj kayboluyor, liste eksik kaydı çizerken düşüyor. Mobil aynı yanıtı doğru işliyor.

**UX (sahip kararı, 2026-11-09):** Sprint R18'deki "Düzenle sağ paneli açar, yeni modal yok" kararı **tersine çevrildi**. Sağ tık > Düzenle sohbete yönlendirmez, yerinde bir ayar modalı açar. Sağ paneldeki **Yeniden Adlandır** ve **Grubu Sil** düğmeleri kalkar (silme ve ayrılma sağ tık menüsünde zaten var).

## §1 Hata düzeltmesi
`stores/dm.ts` `renameGroup`: yanıttan yalnız `name` alınır, mevcut kayda birleştirilir (`{ ...channels.value[idx], name: res.data.name }`). Tip: `dmApi.renameGroup` dönüş tipi `DmChannelDto` değil `{ id: string; name: string | null }` olarak düzeltilir (sunucunun gerçek yanıtı). Kanal store'da yoksa hiçbir şey yapılmaz.

## §2 Sağ panel (`GroupManagePanel.vue`)
- Alttaki sahip-özel aksiyon bölümü (Yeniden Adlandır + Grubu Sil) ve ona ait yeniden adlandır mini-modalı, sil onayı, ilgili state/fonksiyonlar kaldırılır.
- Üye listesi ve üye çıkarma (sahip) aynen kalır.
- Kullanılmayan i18n anahtarı kalırsa silinmez (mobil `group.renameGroup`'u kullanıyor; ortak dosya).

## §3 Ayar modalı
- Yeni bileşen `GroupSettingsModal.vue` (`views/home/components/`). Mevcut modal görünümünü kullanır (silinen mini-modalın düzeni ve tasarım token'ları; renk/ölçü gömülmez).
- İçerik: grup adı alanı (en çok 50 karakter, mevcut kural), Kaydet / Vazgeç. Enter kaydeder, Esc ve dış tık kapatır. Hata metni mevcut i18n'den. Başlık için yeni anahtar `group.settingsTitle` = "Grup Ayarları" (`tr.json`).
- Kaydet → `dmStore.renameGroup` (§1 düzeltilmiş hâli) → modal kapanır. Değişmeyen adla kaydet düğmesi pasif.
- `DmList.vue`: `openGroupSettings` artık yönlendirme yapmaz ve `openGroupPanel()`'ı çağırmaz, modalı açar. **Düzenle** menü öğesi yalnız grup sahibine görünür (`menuGroup.ownerId === authStore.user?.id`; mevcut silme koşuluyla aynı hesap, kopyalama, tek computed'a bağla). Sahip olmayana menüde Düzenle yok (düzenleyebileceği bir şey yok).
- Sohbet açıkken de kapalıyken de aynı modal. Aktif sohbet değişmez.

## §4 Kapsam dışı
Grup adı değişikliğinin diğer üyelere anlık iletimi (bugün yok, sayfa yenilenince görünüyor; ayrı iş, PLAN.md borç tablosuna D-kalemi olarak yazılır). Grup simgesi. Mobil.

## §5 DoD
- `vue-tsc -b` (bilinen 6 önceden-var hata dışında yeni hata yok), `npm run lint`, `npm run build`.
- Bileşeni değiştirmeden önce render eden dosyanın gerçekten kullanıldığı teyit edilir (web'de ölü eş bileşenler var).
- Sahip turu (masaüstü + tarayıcı): sağ tık > Düzenle modal açar, sohbete atmaz; ad değişir, DM listesi yerinde kalır, açık sohbetin başlığı güncellenir; sağ panelde iki düğme yok; sahip olmayan hesapta Düzenle yok; sağ tık > Grubu Sil ve Ayrıl çalışıyor.
