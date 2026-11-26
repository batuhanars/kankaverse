# Sprint C80 — Mobilde panodaki görseli gönderme

> 2026-11-26 · yalnız mobile · R7 değil (yükleme hattı ve kapıları aynı). Envelope değişmez.

## Sorun

Kullanıcı ekran görüntüsü alıyor, görsel klavyenin "Pano" bölmesine düşüyor; oradan sohbete yapıştırmak
istiyor. Klavye "Kankaverse uygulaması buraya resim yapıştırılmasını desteklemiyor" diyor. Web ve masaüstünde
Ctrl+V ile görsel yapıştırma zaten var (`useComposerFileIntake`).

Klavye panosundan doğrudan yapıştırma, mesaj kutusunun zengin içerik (Android `commitContent`) kabul etmesini
ister; React Native çekirdeği bunu desteklemiyor, native modül + yeni bağımlılık + yeni build gerekir. Kapsam dışı.

## Çözüm

- `+` panelinin (AttachmentSheet) satır grubunda, panoda görsel VARSA en üstte "Panodaki görseli ekle" satırı.
  Görsel yoksa satır çizilmez (boş yüzey yok).
- Pano yalnız satıra dokununca okunur. Satırın görünürlüğü için yalnız "görsel var mı" sorulur
  (`Clipboard.hasImageAsync`), içerik okunmaz.
- Görsel PNG olarak önbelleğe yazılır ve galeri/kamera ile AYNI huniden (`confirmFiles`) geçer: sayı sınırı,
  tür/boyut süzgeci, taslak şeridi. Otorite yine sunucu (tür allowlist, boyut, medya kapıları).
- `expo-clipboard` zaten kurulu: yeni bağımlılık ve native değişiklik yok.

i18n: `mobile.attach.clipboard`, `mobile.attach.clipboardEmpty`.

## Doğrulama

typecheck + eslint. Cihaz: ekran görüntüsü al → sohbette `+` → satır görünür → dokun → görsel şeride düşer →
gönder. Panoda yalnız metin varken satır görünmez. DM ve ortam kanalında ayrı ayrı.

## Rev.1 (2026-11-26, sahip turu) — klavye panosundan doğrudan yapıştırma

Tur bulgusu: `+` panelindeki satır hiç görünmedi. Kök: Gboard ekran görüntüsünü SİSTEM panosuna değil kendi pano
geçmişine koyuyor; `Clipboard.hasImageAsync` bu yüzden false. Kullanıcının gerçek akışı klavyenin Pano bölmesi.

- Yeni yerel native modül `modules/rich-paste` (Kotlin, yeni dış bağımlılık YOK; androidx.core zaten var):
  `attach(viewTag)` mesaj kutusunun native görünümüne `ViewCompat.setOnReceiveContentListener(image/*)` bağlar.
  Klavye görseli `commitContent` ile gönderir; görsel önbelleğe kopyalanır, `onImage` olayıyla JS'e gelir.
  Metin yapıştırma değişmez (görsel olmayan kısım varsayılan işleyiciye döner).
- JS `useImagePaste`: görsel aynı huniden (`buildDraftAttachment`) geçip taslak şeridine düşer, gönderilmez.
- `+` panelindeki satır KALIR (sistem panosuna kopyalanan görseller için, ör. tarayıcıdan "Görseli kopyala").
- Native değişiklik: yeni dev build + AAB. Cihaz turu: Gboard Pano'dan ekran görüntüsü, tarayıcıdan kopyalanan
  görsel, normal metin yapıştırma (bozulmamalı).
