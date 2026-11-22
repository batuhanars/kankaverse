# SPRINT C71: Mobil arama sahnesi (DM'de dokunulan görüntü büyür)

> Durum: **UYGULANDI, cihaz turu bekliyor (2026-11-22).** Yalnız mobil. API, web değişmez.

## Sahip kararı (2026-11-22)
- 1-1 DM'de "karşı taraf tam alan + köşede ben" düzeni kalkar. Ekran paylaşımında zaten kullanılan kartlı düzen esas olur: üstte büyük sahne, altta kartlar, **dokunulan kart sahneye çıkar**, sahnedeki karta iner.
- Aynı düzen **grup DM**'de de (kamera açıkken iki sütunlu ızgara kalkar).
- Ortam ses kanalı değişmez: kamerada ızgara kalır, ekran paylaşımında sahne çizilir ama yalnız ekran kartları büyütülür (kişi kartı moderasyon panelini açar).

## Davranış
- **Sahne ne zaman:** odada ekran paylaşımı varsa (her arama türü) ya da DM'de (1-1/grup) en az bir kamera açıksa. Hiç video yoksa sesli düzen aynen kalır (1-1 iki kutucuk, grup/ortam alt alta liste).
- **Öğeler:** her kişi bir öğe (kamerası, kapalıysa avatarı); her ekran paylaşımı ayrı bir öğe. Birinin hem kamerası hem ekranı açıksa iki öğe.
- **Şerit sırası:** ekranlar → diğer kişiler (katılma sırası) → sen.
- **Varsayılan odak:** paylaşılan ekran → karşı tarafın açık kamerası → karşı taraf → sen. Kullanıcının seçimi, o öğe odada kaldıkça korunur (yeni paylaşım başlayınca zıplamaz); öğe giderse varsayılana düşer.
- **1-1, karşı taraf henüz yok:** sahnede onun yeri tutulur, "Çalıyor…" / "Cevap yok" orada; "tek başınasın" metni sahnenin altında.
- **Tam ekran:** yalnız sahnede ekran paylaşımı varken (köşedeki düğme).
- Ekran kartı şeritte `contain` (kırpılmaz), siyah zemin, TV rozeti.

## Kod
- `ScreenShareStage.tsx` → `CallStage.tsx` (`buildStageItems` saf fonksiyon + bileşen; odak bileşende, türetilmiş).
- `call.tsx`: `focusedScreenUserId` state'i ve düzeltme effect'i, 1-1 köşe dalı, grup DM ızgara kolu kalktı.
- `ParticipantTile`: `corner` varyantı silindi (kullanan kalmadı); `card` varyantı `isScreenShare` okur.

## Cihaz turu (DoD)
1. 1-1, iki kamera açık: karşı taraf büyük, sen altta kart; kartına dokun → sen büyürsün, karşı taraf karta iner; tekrar dokun → geri.
2. 1-1, web ekran + kamera açar: sahnede ekran, altta web kişisinin kamera kartı + senin kartın; kamera kartına dokun → kamera büyür, ekran karta iner (kırpılmadan).
3. Paylaşım biterken sahnede ekran varsa: varsayılana (karşı tarafın kamerası) düşer, ekran boş kalmaz.
4. "Görüntülü ara" ile başlat, karşı taraf yokken: sahnede "Çalıyor…", altta senin kartın.
5. Grup DM, 3 kişi kamera: sahne + iki kart; her kart dokununca büyür.
6. Kameralar kapanınca: 1-1 iki kutucuk, grup alt alta liste (sesli düzen değişmedi).
7. Ortam kanalında kamera: ızgara aynen; ekran paylaşımında kişi kartı yetkiliye moderasyon panelini açar.
8. Tam ekran ekran paylaşımında açılır/kapanır; kamera sahnedeyken düğme yok.
