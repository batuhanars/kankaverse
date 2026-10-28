# SPRINT D78a: Web mesaj kutusu giriş satırı tek bileşen

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). Sahip onayı: "önerdiğin şekilde başlayabiliriz".
> Yalnız `web/`. **Saf yeniden düzenleme: davranış, görünüm, metin birebir aynı kalır.** R7-nötr.
> Gerekçe: kanal (`MessageArea.vue`) ve DM (`DmConversation.vue`) giriş satırı iki kopya; her özellik (✨, GIF, Kor rengi)
> iki kez yapıldı. Sıradaki Klipy GIF kütüphanesi tek yere dokunsun diye önce bu (PLAN D78'in dar ilk adımı).

## §1 Kapsam
Yeni `web/src/components/shared/ComposerBar.vue`: bugün iki dosyada kopya duran **giriş satırı kutusu**:
kenarlıklı satır kabı (yanıt varken alt köşe yuvarlak, yoksa tam yuvarlak) · ataç düğmesi · @bahsetme açılır listesi ·
`textarea` · `AiVideoButton` · GIF düğmesi · emoji düğmesi + `EmojiPicker`.

**Kapsam DIŞI (yerinde kalır):** yanıt şeridi, sürükle-bırak katmanı, gizli dosya/GIF input'ları, gönderme/yazıyor/
bahsetme mantığı, düzenleme `textarea`'sı (DM satır 1012), `AttachmentComposeModal`, mobil.

## §2 Arayüz (öneri; dev eşdeğer daha sade bir biçim bulursa raporlar)
- `v-model` → içerik metni. Prop'lar: `placeholder: string`, `mention` (mevcut bahsetme composable'ının dönüşü, iki
  dosyada aynı tip), `rounded-bottom-only: boolean` (yanıt şeridi açık mı).
- Emit'ler: `keydown(e)`, `input(e)`, `blur`, `pick-file`, `pick-gif`, `emoji(emoji)`, `ai-attachment(id)`.
- `defineExpose({ textarea })`: ebeveynler bugünkü `textareaEl` / `dmTextareaEl` ref'iyle odak, otomatik boy ve imleç
  işi yapıyor. Bu kullanım kırılmadan sürmeli.
- Emoji seçici aç/kapa durumu bileşenin içine taşınabilir (iki kopya aynıysa). Seçilen emojiyi imlece yerleştirme
  ebeveynde kalır (`emoji` emit'i).
- @bahsetme listesi kanaldaki tam sürüm (everyone / rol / üye dalları). DM önerileri bu dalları üretmediği için DM'de
  görünüm değişmez. Bunu `mention` önerilerinin tipinden doğrula, varsayma.

## §3 Kurallar
- Satır satır aynı sınıflar/stiller/aria/i18n anahtarları; yorumlar taşınır. Yeni token, metin, bağımlılık yok.
- Her iki ebeveyn bileşeni yeni bileşeni kullanır; eski kopya şablon ve artık kullanılmayan script parçaları silinir.
- `MessageArea.vue` ve `DmConversation.vue` satır sayısı düşer (rapora yaz: önce/sonra).

## §4 DoD
- [ ] `npx vue-tsc -b` → yalnız bilinen 6 hata · `npx eslint` dokunulan dosyalar temiz · `npx vite build` geçer
- [ ] Sahip gezintisi (kanal + DM, ikisi de): gönder · Enter gönderir / Shift+Enter satır · @bahsetme (kanalda @everyone + rol
  + üye; DM'de üye) ok tuşu + Enter + tıklama · emoji imlece · GIF dosyası · ataç ek · ✨ Kaydet ve gönder · yanıtla
  (şerit + köşe yuvarlaklığı) · yazıyor göstergesi · uzun metinde kutu büyür (50vh sınırı)

## §5 Sapma kuralı
İki kopya arasında §2'nin karşılamadığı bir davranış farkı bulunursa dev farkı KORUR (bayrak/prop ile) ve raporlar;
birini diğerine "düzeltmez".
