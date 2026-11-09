# SPRINT C56: Markdown başlıkları, mobil markdown, 16.000 karakter, video hazır toast'ı

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip istekleri (aynı gün). api + web + mobile. R7 dışı
> (sanitize allowlist'i değişiyor ama yalnız başlık etiketi ekleniyor; PM satır satır inceler).

## §0 Kararlar
1. **Başlıklar açılır**: `#`, `##`, `###`. `####`-`######` yazılırsa **h3 gibi** görünür (kanalı kaplamasın). Boyut ölçeği token'dan: h1 22px, h2 18px, h3 16px, hepsi kalın, satır arası sıkı, üst/alt boşluk küçük (mesaj akışını bozmasın).
2. **Mobil markdown**: web ile **aynı ayrıştırıcı** (`markdown-it`, aynı kurallar: `html: false`, `linkify: true`, `breaks: true`, `image` ve `table` kapalı, link yalnız http/https). Davranış birebir aynı olmalı, kural uydurulmaz. `** mesaj **` (boşluklu) standart gereği biçimlenmez; gevşetilmez.
3. **Mesaj sınırı 4000 → 16.000** (sahip kararı, "tamamen kaldır" yerine). Sabit tek yerde.
4. **Video hazır toast'ı (mobil)**: uygulama açıkken üretim bitince Android toast'ı (Android 12+ solunda uygulama logosu çıkar; "üretiliyor" toast'ının aynısı). Toast dokunulamaz; metin videonun **nerede** olduğunu söyler.

## §1 API
- `messages/dto/create-message.dto.ts` ve `update-message.dto.ts`: `@MaxLength(4000, …)` → paylaşılan tek sabit `MESSAGE_CONTENT_MAX = 16000` (messages modülünde bir constants dosyası; varsa oraya). Mesaj metni: "Mesaj en fazla 16.000 karakter olabilir." Swagger `maxLength` de güncellenir.
- Başka bir yerde mesaj içeriği için 4000 sınırı (webhook yürütme DTO'su, soket yolu, automod, önizleme) varsa raporla; **webhook içerik sınırını değiştirme**, yalnız bildir.
- Express gövde sınırı (100 KB) 16.000 karakter için yeterli (Türkçe çok baytlı karakterle bile ~32 KB); dokunulmaz.
- İlgili spec varsa güncellenir. DoD: `npx tsc -p tsconfig.build.json --noEmit` + ilgili `jest`.

## §2 Web
- `utils/markdown.ts`: `md.disable('heading')` kalkar. h4-h6 → h3 kıstırması bir core kuralıyla (`heading_open`/`heading_close` token'larının `tag`'i `h3`'e çekilir). Lheading (`Başlık\n===`) **kapalı kalır** (`md.disable('lheading')`): alt satıra `---`/`===` yazan kullanıcı yanlışlıkla dev başlık üretmesin.
- DOMPurify `ALLOWED_TAGS`'a yalnız `h1`, `h2`, `h3` eklenir. Başka etiket/öznitelik eklenmez.
- `styles/main.css` `.kv-md h1/h2/h3`: §0.1 ölçüleri, `--kv-*` token'larıyla; ilk/son çocukta dış boşluk sıfır.
- Dosya başı yorumundaki "başlık KAPALI" notu güncellenir. Etkinlik açıklamaları ve embed'ler aynı boru hattını kullandığı için başlığı otomatik alır: bu kabul edilir.
- `tr.json`'a **dokunma** (mobil dev anahtar ekleyecek). DoD: `npx vue-tsc -b` (bilinen 6 hata, fazlası yok), dokunulan dosyalarda `eslint`, `npx vite build`.

## §3 Mobil: markdown
- Bağımlılık: `markdown-it` (+ `@types/markdown-it` dev). Saf JS, yeni dev build gerekmez. PM onaylı. Web'deki sürüm hattıyla aynı major (14).
- `src/utils/markdown.ts`: web'deki md örneği ayarlarının aynısı + §2 başlık kuralları. Çıktı HTML **değil**, token akışı: `md.parse()` → RN ağacı. `dangerouslySetInnerHTML`/WebView yok.
- Bileşen `components/message/MarkdownText.tsx` (ad serbest): desteklenen bloklar paragraf, başlık (h1-h3), alıntı (sol çizgi, ton farkı), madde/numaralı liste (iç içe en az 2 seviye), kod bloğu (mono font, `src/theme`'den; yatay taşma kaydırılır ya da sarılır), satır içi kalın/italik/üstü çizili/kod, link (`Linking.openURL`, yalnız http/https; mevcut `styles.link`/`linkMine` görünümü), `breaks` satır sonu.
- **Bahsetmeler**: mevcut `splitMentions` davranışı korunur. Web'deki yer-tutucu yöntemi örnek alınır: parse öncesi `<@id>`/`<@&id>` → kontrol karakterli yer-tutucu, metin düğümünde geri çözülüp mevcut `mention`/`mentionMine` stiliyle çizilir. Kod bloğu/satır içi kod içindeki token da web nasıl davranıyorsa öyle (web kaynağından doğrula).
- `MessageBubble.tsx` içerik bloğu yeni bileşene geçer; `isMine` renkleri, `onLongPress` (link üzerinde uzun basma menüyü açar, mevcut davranış), `MetaSpacer`/son satır meta yerleşimi **bozulmaz**. Webhook `EmbedCard` açıklaması web'de markdown'sa aynı bileşeni kullanır.
- Performans: parse sonucu `useMemo` (içerik + çözümleyici bağımlılığı). 16.000 karakterlik mesaj listede kaydırmayı kilitlememeli.
- Tema: renk/ölçü `src/theme`'den.
- **Baloncuk revizesi (sahip endişesi, 2026-11-09):** §0.1 web ölçüleri mobilde UYGULANMAZ. Başlıklar gövde boyutundan en fazla 1-2 kademe büyük + kalın, dikey boşluk çok küçük. Kod bloğu baloncuk genişliğini aşmaz, yatay kaydırma yok, satır sarılır. Alıntı/liste girintisi dar. İçerik web ile aynı, yalnız ölçü baloncuğa uyarlanır.

## §4 Mobil: video hazır toast'ı
- `realtime/socket.ts` `notification` dinleyicisi: `AI_VIDEO_READY` / `AI_VIDEO_FAILED` geldiğinde, `useAiVideoViewerStore.getState().sheetOpen === 0` ise (kullanıcı üretim sayfasında değilse) `ToastAndroid.show(…, LONG)`. Yalnız Android (iOS ertelendi; `Platform.OS` kontrolü).
- Metinler `web/src/i18n/tr.json` → `mobile.aiVideo.*` altına (tr.generated.json mevcut üretim yoluyla yenilenir):
  - hazır: "Videon hazır. Bildirimler sekmesinden izleyebilirsin."
  - başarısız: "Videon üretilemedi, kredin düşülmedi."
  - (Bildirim kaydını açan yer `app/(app)/(tabs)/notifications.tsx`; metin bu yeri doğru tarif etmeli. Farklıysa PM'e bildir.)
- Çift bildirim olmasın: uygulama ön plandayken aynı olayın sistem push banner'ı da düşüyorsa (`push.ts` `setNotificationHandler`, ve C50 veri-yalnız push yolu yapay zeka videosunu da işliyorsa o yol) ön planda banner **gösterilmez**; çan kaydı kalır. Kapalı/arka planda push davranışı **değişmez**. Hangi yolun ön planda ne gösterdiğini kaynaktan doğrula, raporda yaz.

## §5 DoD (mobil)
`npm run typecheck`, `npm run lint`. Sahip turu:
1. Web/masaüstü: `# Başlık`, `## Alt`, `#### Küçük` (h3 boyutunda), `**kalın**`, `> alıntı`, liste, kod bloğu; `Metin\n---` başlığa dönmüyor.
2. Mobil: aynı mesajlar web'le aynı biçimde; bahsetme vurgulu, link açılıyor, link üzerinde uzun basma menüyü açıyor, saat/okundu tiki son satırda yerinde.
3. 4001 karakterlik mesaj gidiyor; 16.001 karakter "16.000" hatası veriyor.
4. Uygulama açık, sohbet ekranında, video bitiyor → logolu toast "Videon hazır. Bildirimler sekmesinden izleyebilirsin.", çift banner yok. Üretim sayfası açıkken toast yok. Uygulama kapalıyken push eskisi gibi.
