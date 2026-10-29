# SPRINT C34: Grup DM okundu tikleri + mobilde kendi mesajın sağda

> Durum: **TAMAMLANDI + R7 SAHİP ONAYI (2026-10-29).** §3 mobil düzen zaten doğruydu (sahip başka hesapla bakmıştı), kod değişmedi. PM compose (Opus). **api + web + mobil.**
> **🔴 R7:** okundu karar yüzeyi (C12 `readReceiptDecision`) çok kişiye genişliyor → sunucu diff'i sahibe satır satır, onaysız commit YOK.
> Sahip kararı: ortam kanallarında tik YOK (kalabalık, anlamsız, yük, minör var; Discord da göstermiyor).

---

## §1 Grup DM okundu durumu (api, R7)
1. Grup DM'de izleyici (viewer) için **uygun üyeler**: izleyici hariç, `readReceipts` açık, izleyiciyle iki yönde de engel ilişkisi olmayan üyeler.
   **İzleyicinin kendi `readReceipts`'i kapalıysa** grupta da yalnız tek tik (karşılıklılık, C12 ile aynı).
2. Sunucu izleyiciye YALNIZ `groupAllReadAt` verir = uygun üyelerin `lastReadAt`lerinin EN KÜÇÜĞÜ (biri hiç okumadıysa null).
   (Sahip kararı 2026-10-29: `groupSomeReadAt` / "bazıları okudu" YOK.) Uygun üye yoksa null ve `receiptsEnabled=false`. Bireysel okuma anları ASLA gönderilmez.
3. Karar `readReceiptDecision` ile aynı dosyada yeni saf fonksiyon (`groupReadReceiptDecision`), testli. 1-1 kararı DEĞİŞMEZ.
4. Alanlar hem liste ucunda (`getDmChannels` grup satırları) hem tek kanal DTO'sunda. Canlı güncelleme: grup üyesi `markRead` yaptığında
   (mevcut `emitReadReceipt` kalıbı) diğer her üyeye kendi izleyici hesabıyla güncel `groupAllReadAt` (olay `dm:groupRead`) yayılır.
5. Test: ayarı kapalı üye hesaba katılmaz · engelli üye katılmaz · izleyici kapalıysa receiptsEnabled false · hiç okumayan üye varken all null ·
   bireysel lastReadAt yanıtta yok · 1-1 davranışı aynı.

## §2 Tik gösterimi (web + mobil, yalnız 1-1 ve grup DM; ortam kanalı yok) [SAHİP KARARI 2026-10-29 işlendi]
- YALNIZ İKİ durum: tek tik = gönderildi, çift tik = okundu. Kor renkli tik YOK (1-1 dahil); renk nötr
  (web: ikincil yazı rengi, mobil: baloncuk meta metin rengi).
- Grup DM, kendi mesajın: `createdAt <= groupAllReadAt` → çift tik (uygun üyelerin HEPSİ okudu); değilse tek tik.
  `receiptsEnabled=false` → tek tik. `pending:` mesajda tik yok. 1-1: `createdAt <= otherReadAt` → çift, değilse tek.
- Web: tik ayrı satırda değil; mesaj metninin SON satırının sonuna ((düzenlendi) varsa ondan sonra) satır içi küçük simge
  (`ReceiptTick.vue`); metinsiz/ekli mesajda ekin altında; başlıksız ardışık mesajda da görünür.
- i18n etiketleri: "Gönderildi", "Okundu".

## §3 Mobil düzen (yalnız mobil)
- Grup DM ve ortam kanallarında **kendi mesajın sağda**, 1-1 DM'deki baloncuk rengi/biçimiyle; diğerleri solda, avatar + ad ile (bugünkü gibi).
  Ardışık mesaj gruplama, yanıt, tepki, ek, iletme, düzenleme, iyimser gönderim görünümleri her iki tarafta bozulmadan çalışır.
- Ortam kanalında tik yok. Web düzeni değişmez.

## §4 DoD
- api build/jest (tam)/eslint (`npm run lint` değil). web vue-tsc -b (bilinen 6), vite build, eslint. mobil typecheck/lint, versionCode 40 kalır
  (Play'e henüz gitmedi).
- R7 diff sahibe. Sahip turu (3 hesaplı grup DM + ortam kanalı, telefon + masaüstü): tek → gri çift → kor çift geçişi; bir üye ayarı kapatınca
  hesaba katılmıyor; kendi mesajın mobilde sağda; ortam kanalında tik yok.

**OUT:** ortam kanalı tikleri · "kim okudu" listesi · web'de baloncuk düzeni.
