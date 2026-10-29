# SPRINT C31f: Son Etkinlik (son oynanan oyunlar)

> Durum: **KODLANDI + R7/KVKK SAHİP ONAYI (2026-10-29).** Ek sıkılaştırmalar (sahip onaylı): dnd iken yazılmaz, oyun gösterme kapanınca geçmiş silinir, hesap silme isteğinde geçmiş HEMEN silinir + ayar kapanır (auth.service). PM compose (Opus). **api + web + mobil.**
> **🔴 R7 + KVKK:** ilk kez oyun bilgisi KALICI saklanıyor (C31b'de bilinçli OUT'tu). Sahip şartlarla onayladı: yalnız yetişkin,
> ayrı ayar, 7 gün saklama. Sunucu diff'i sahibe satır satır. Başlangıç C31e commit'inden SONRA (aynı presence dosyası).

---

## §0 Veri azaltma ilkesi (KVKK m.4 ölçülülük)
- Oturum/süre günlüğü TUTULMAZ. Kişi başına oyun başına **yalnız son oynama anı** saklanır: `RecentGame { userId, gameId, lastPlayedAt }`,
  `@@unique([userId, gameId])`, upsert. Kaç saat oynadığı, hangi saatlerde oynadığı kaydedilmez.
- Saklama **7 gün**: `lastPlayedAt` 7 günden eskiyse silinir (mevcut job kalıbı, `api/src/common/jobs/purge.job.ts` gibi; günde bir).
- Kişi başına en fazla 10 satır gösterilir.

## §1 Kim kaydedilir (sunucu otoritesi)
1. Yeni ayar `User.showRecentActivity Boolean @default(false)` (**varsayılan KAPALI**; mevcut oyunu gösterme ayarından ayrı).
2. Kayıt şartı: `!isMinor` VE `showRecentActivity` VE mevcut oyun ayarı etkin (`showGameActivity ?? !isMinor`). Biri yanlışsa hiç yazılmaz.
   **Minör asla kaydedilmez** (ayar açılsa bile; ayar ucu minörde `true` kabul etmez, 403/400).
3. Yazım anı: oyun bittiğinde ya da değiştiğinde (bellekteki oyun kaydı silinirken/yenilenirken) ve bağlantı koparken, o oyun için upsert.
4. Ayar kapatılınca kullanıcının tüm `RecentGame` satırları **hemen silinir**. Hesap silme akışında da silinir (mevcut silme/anonimleştirme yolunu bul, ekle).

## §2 Kim görür
- `GET /users/:id/recent-activity` → `[{ game: { id, name, iconUrl, storeUrl }, lastPlayedAt }]`.
- Görünürlük: hedefin `showRecentActivity` açık **VE** `canSeeActivity(viewer, target)` (C31b kuralı aynen; kopya kural yok). Değilse boş dizi
  (varlık sızdırmaz). Kendi profilinde kendisi görür (ayar açıksa). `hidden` oyunlar dönmez.
- Throttle mevcut kullanıcı uçlarıyla aynı.

## §3 Arayüz
1. **Web `FullProfileModal` Etkinlik sekmesi** (C31e): "Mevcut Etkinlik" altında **"Son Etkinlik"** listesi: logo, oyun adı, "4 saat önce" gibi
   göreli zaman (TR). Sekme, mevcut oyun yoksa ama son etkinlik varsa da görünür.
2. **Mobil profil paneli** (`ProfileSheetBody`): aynı liste, mevcut kartın altında.
3. **Ayar:** web Kullanıcı Ayarları gizlilik bölümü ve mobil gizlilik ekranında "Son oynadığım oyunları profilimde göster (7 gün saklanır)".
   Minörde ayar hiç görünmez. Kapatınca "Geçmişin silindi" bilgisi.
4. **KVKK:** `web/src/views/legal/GizlilikView.vue` metnine (i18n `legal.privacy`) madde: hangi veri (son oynanan oyun ve zamanı),
   amaç (profilde gösterme), varsayılan kapalı, 7 gün saklama, ayar kapanınca silinme, minörden toplanmaz. Sade dil, em dash yok.

## §4 Test
- Minör kaydedilmez/ayar açamaz · ayar kapalı kayıt yok · ayar kapanınca silinir · 7 gün temizliği · görünürlük canSeeActivity + ayar ·
  engelli kullanıcı göremez · upsert tek satır.

## §5 DoD
- api build/jest/eslint, migration yerelde uygulandı. web vue-tsc -b (bilinen 6), vite build, eslint. mobil typecheck/lint (vc39 içinde).
- R7 diff + KVKK metni sahibe.
- **Sahip turu:** ayarı aç, bir oyun aç-kapat, kanka profilinde "Son Etkinlik"te görünür; ayarı kapat, liste boş; minör hesapta ayar yok.

**OUT:** oynama süresi/istatistik · 7 günden uzun saklama · başkasının son etkinliğinden bildirim.
