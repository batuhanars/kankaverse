# SPRINT C67: Görüldü avatarları (DM ve grup DM), çift tik kalkar

> Durum: **KİLİTLİ (2026-11-13, sahip kararı).** PM compose (Opus). api + web + mobile.
> 🔴 **R7:** okundu karar yüzeyi (C12 `readReceiptDecision`, C34 `groupReadReceiptDecision`). C34 §1.2 "bireysel okuma
> anları ASLA gönderilmez" kararı sahip tarafından KALDIRILDI (2026-11-13): uygun üyelerin bireysel okuma anı gider.

## §0 Hedef
Mesajı kimin nereye kadar gördüğü, okuyanın küçük avatarıyla gösterilir: avatar, o kişinin okuduğu SON mesajın
altında durur; daha yeni mesajları okudukça yumuşak animasyonla aşağı kayar. **Çift tik kalkar**; kendi mesajında
**tek tik = gönderildi** kalır. 1-1 DM ve grup DM aynı sistem. Ortam kanallarında hiçbir şey yok (C34 kararı aynen).

## §1 Kim görünür (değişmeyen kurallar, R7)
- Uygun okuyucu: izleyici hariç, `readReceipts` açık, izleyiciyle iki yönde engel YOK, kanalın güncel üyesi.
- **Karşılıklılık:** izleyicinin kendi `readReceipts`'i kapalıysa hiçbir okuyucu görünmez (C12 ile aynı).
- PENDING mesaj isteği kanalında yok (C12). Eski grupta (C62 departed) yok. Ayrılan/çıkarılan üye listeden düşer.

## §2 Sunucu (api/)
- Saf karar fonksiyonu `seenReadersDecision` (C12/C34 ile aynı dosya, testli): girdi izleyici + üyeler (readReceipts,
  engel, lastReadAt) → `{ visible: boolean, readers: { userId, readAt: string }[] }` (yalnız `lastReadAt` dolu olanlar).
- DTO: 1-1 ve grup DM öğesine (liste + tek kanal) `seenBy: { userId, readAt }[]` eklenir. Eski alanlar
  (`receiptsEnabled`, `otherReadAt`, `groupAllReadAt`) GERİYE UYUM için aynen kalır (Play'deki eski mobil sürüm).
- Canlı: bir üye `markRead` yaptığında, onu görebilen her izleyiciye (karar fonksiyonuyla) yeni olay
  `dm:seen { channelId, userId, readAt }`. Mevcut `dm:read` / `dm:groupRead` yayınları geriye uyum için kalır.
- Testler: ayarı kapalı üye yok; engelli yok; izleyici kapalıysa boş; olay yalnız görebilenlere; eski alanlar aynı;
  PENDING ve departed'da boş.

## §3 Yerleşim kuralı (web + mobil ortak)
- Okuyucunun avatarı, mesaj listesinde `createdAt <= readAt` olan EN SON mesajın altına konur (yazarı kim olursa olsun).
- Aynı mesajda birden çok okuyucu: sağa hizalı yatay sıra, en çok 5 avatar + "+N". Sıra: en yeni okuyan sağda.
- Okuyucunun avatarı kendisinin yazdığı en son mesajın altına konacaksa da gösterilir (sade kural, istisna yok).
- Boyut: web 16px, mobil 16dp, daire, `--kv-*` token renkleri; gölge yok.
- Erişilebilirlik: web'de üzerine gelince, mobilde uzun basınca "{ad} gördü · 18.42" (i18n, TR saat biçimi).
- Kendi mesajında tek tik kalır (gönderildi); çift tik (`ReceiptTick` "okundu" durumu) HİÇ çizilmez.

## §4 Animasyon
- Web: avatar konumu değişince FLIP (önceki konumdan yeni konuma `transform` geçişi, 250 ms, ease-out);
  `prefers-reduced-motion` açıksa animasyonsuz. Yeni bir bağımlılık YOK.
- Mobil: `react-native-reanimated` (kurulu) ile aynı davranış, 250 ms; sistem "animasyonları azalt" açıksa animasyonsuz.
- Kaydırma (scroll) konumu animasyon yüzünden zıplamaz; liste dipteyse dipte kalır (C sohbet kaydırma kuralı).

## §5 Web (web/)
`DmConversation` + `MessageRow` (render eden dosyayı teyit et), store'da kanal başına `seenBy` haritası, `dm:seen`
dinleyicisi, `ReceiptTick` yalnız "gönderildi". i18n. Doğrulama: `vue-tsc -b` (6), eslint dokunulan, `vite build`;
immediate izleyicide TDZ kuralı (bkz. C62 dersi).

## §6 Mobil (mobile/)
Aynısı: mesaj listesi bileşeni, `dm:seen` dinleyicisi, store, tik yalnız "gönderildi", Reanimated. Doğrulama: tsc (4),
eslint dokunulan, `npm run test:e2ee`.

## §7 Cihaz turu
1-1: karşı taraf okudukça avatar son okunan mesajın altına kayar; ayarı kapatınca iki tarafta da avatar yok.
Grup (3 kişi): her okuyanın avatarı kendi okuduğu son mesajda; biri okudukça yalnız onunki kayar; 6+ okuyucuda "+N";
çift tik hiçbir yerde yok; ortam kanalında hiçbir şey yok. Eski telefon sürümü (Play) bozulmaz (tik eski davranışla).

## §8 Kapsam dışı
"Kim okudu" ayrıntı listesi ekranı; ortam kanalları.
