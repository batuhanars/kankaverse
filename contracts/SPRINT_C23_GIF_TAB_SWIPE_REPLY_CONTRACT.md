# SPRINT C23: Sohbette ayrı GIF girişi + mobilde kaydırarak alıntı

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip isteği. **Yalnız istemci: web + mobil** (api yok).
> Mobil yalnız JS (yeni native bağımlılık YOK), mağaza sürümü vc31. **R7-nötr:** yükleme hattı, kapılar, yanıt
> kuralları değişmez; yalnız giriş noktaları.

---

## §0 Neden ve kararlar

**Sorun 1:** sohbette GIF göndermek ataç (dosya ekle) içinde, ayrı bir yerde durmuyor. Sahibin arkadaşı bulamadı.
C22'de profil/ortam medyasında ayrılmıştı, sohbet de aynı mantığa gelir.

**Sorun 2:** mobilde alıntı (yanıt) yalnız basılı tut → menü → Yanıtla ile yapılıyor; kullanıcı kısa yol istiyor.

**Kilitli kararlar:**
1. **Web:** mesaj kutusunda emoji (😊) düğmesinin yanına ayrı **GIF** düğmesi (metin "GIF" yazan küçük rozet-düğme,
   Discord deseni). Tıklayınca dosya seçici **yalnız `image/gif`** kabul ederek açılır, seçilen dosya bugünkü ek akışına
   (`AttachmentComposeModal` → aynı gönderim) girer. Ataç düğmesi değişmez (GIF orada da kabul edilmeye devam eder).
2. **Mobil:** emoji düğmesi artık **iki sekmeli bir alt sayfa** açar: **Emoji | GIF**, varsayılan **Emoji**.
   - Emoji sekmesi: bugünkü seçici (`rn-emoji-keyboard` gömülü `EmojiKeyboard` bileşeni, aynı tema/dil/son kullanılanlar).
     Davranış (imlece ekleme) aynen korunur.
   - GIF sekmesi: bugün **yalnız "GIF yükle"** seçeneği (simge + alt metin "Galerinden bir GIF seç"). Seçilen dosya
     bugünkü taslak ek akışına girer (`AttachmentSheet`'in kullandığı yükleme yolu, aynı boyut sınırı ve hata metinleri).
     Seçici yalnız GIF gösteremiyorsa seçimden sonra doğrula; GIF değilse "Yalnız GIF seçebilirsin" hatası.
   - GIF kütüphanesi (Klipy) **ertesi sprint**, bu sekmenin üstüne arama + liste olarak gelir. Bugün boş arama kutusu,
     "yakında" yazısı vb. **KOYMA** (boş iskele yasak).
   - Düzenleme modunda GIF sekmesi gösterilmez (ataç gibi): yalnız emoji.
3. **Mobil kaydırarak alıntı:** mesaj balonu **sağa** kaydırılınca alıntı açılır (WhatsApp deseni).
   - `react-native-gesture-handler` `Gesture.Pan` + `reanimated` (ikisi de kurulu). `activeOffsetX` ~15, `failOffsetY`
     ~±10: dikey kaydırma (liste) her zaman kazanır, yatay niyet net değilse hareket başlamaz.
   - Balon parmağı izler, en fazla ~72px; arkada sol tarafta yanıt simgesi belirir (opaklık kaydırmayla artar).
     Eşik ~56px: eşiği geçince simge tam görünür + kısa titreşim (RN `Vibration`, 10ms, bir kez). Bırakınca balon yayla
     geri döner; eşik geçildiyse **menüdeki Yanıtla ile birebir aynı işlev** çağrılır (kutu odaklanır, klavye açılır).
   - Kaydırma yalnız **menüde Yanıtla görünen** mesajlarda çalışır (aynı koşul tek yerden, kopyalama).
     Sistem mesajı, gönderilmemiş/başarısız, silinmiş mesajda kaydırma yok.
   - Basılı tutma menüsü ve diğer dokunuşlar (yazara dokun, görsele dokun, tepkiler) **değişmez**.
   - Sola kaydırma bir şey yapmaz (yasak değil, boş).
4. i18n: yeni metinler `tr.json` (web) ve mobil i18n kaynağında; gömülü string yok.

**OUT:** GIF kütüphanesi / arama (yarın, ayrı sözleşme) · web'de kaydırma · backend · yeni ek türü · sola kaydırma işlevi.

## §1 Web
- `web/src/views/app/components/MessageArea.vue`: emoji düğmesinin yanına GIF düğmesi; ayrı gizli `<input type="file"
  accept="image/gif">` (veya mevcut input'un `accept`ini geçici değiştir, hangisi temizse) → mevcut `onFileSelected` yolu.
- Erişilebilirlik: `aria-label` + `title` = "GIF gönder".
- DM ekranında da aynı mesaj kutusu kullanılıyorsa iki yerde de görünür; kullanılmıyorsa DM kutusuna da ekle.
- Dar ekran: 390/320px'te kutu taşmamalı (ölç).

## §2 Mobil
- Yeni `mobile/src/components/message/EmojiGifSheet.tsx` (alt sayfa, üstte iki sekmeli bölmeli kontrol).
  `ComposerHost` bugünkü `EmojiPicker` modal'ı yerine bunu açar. Tepki seçici (`MessageActionHost`) **değişmez**.
- Kaydırma: `MessageBubble` (veya onu saran satır) içinde, `onReply` ihtiyacı varsa prop olarak gelir; liste
  (`MessageScreen`) performansı korunur (her satırda ağır state yok, paylaşılan değerler reanimated).
- versionCode 31.

## §3 DoD
- web: `vue-tsc -b` (bilinen 6 önceden-var hata dışında yeni hata yok), lint, build.
- mobil: `tsc --noEmit`, lint, testler (varsa ilgili).
- Sahip turu: web'de GIF düğmesi + gönderim; mobilde sekmeler, GIF yükleme, sağa kaydırma (dikey kaydırmayla çakışmıyor,
  gezinme çubuğu/geri hareketiyle çakışmıyor) **sahibin telefonunda**.
