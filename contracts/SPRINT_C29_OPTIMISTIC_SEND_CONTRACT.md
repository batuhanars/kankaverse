# SPRINT C29: Mesaj gönderirken anında görünme (iyimser gönderim) + sunucu cevap yolunu hafifletme

> Durum: **TASARIM KİLİTLİ (2026-10-29).** PM compose (Opus). Sahip isteği: "Gönder'e basınca hafif gecikme var,
> kullanıcıların gözüne çarpmasın." **api + web + mobil.** **R7-nötr:** gönderim kapıları (ban, susturma, yavaş mod,
> blok, mesaj isteği, automod) değişmez; geçici mesaj **yalnız gönderenin ekranında** durur, kimseye yayılmaz.

---

## §0 Teşhis (PM, kod okuması)
- Web `MessageArea.vue:send` / `DmConversation.vue:send` ve mobil `useMessageComposer.send` HTTP cevabını `await`
  edip ancak sonra `appendMessage` yapıyor. Mesaj ekrana tam bir gidiş-dönüş sonra düşüyor.
- `messages.controller.ts:sendMessage` HTTP cevabından ÖNCE `notifyDmActivity`, `notifyChannelActivity`,
  `notifyMentions` üçünü de `await` ediyor (her biri kanal/üye sorguları yapıyor). Gönderen bunların bitmesini bekliyor.
  Bu, gerçek gecikmenin bir parçası.

## §1 API
1. `CreateMessageDto`: opsiyonel `nonce?: string` (`@IsOptional() @IsString() @MaxLength(64)`). **DB'ye yazılmaz**,
   migration yok.
2. `create()` dönüşü ve `message.created` WS yayını, istekte gelen `nonce`'u aynen taşır (`MessageDto.nonce?: string`,
   Swagger'da opsiyonel). Nonce yoksa alan hiç yok. Başka hiçbir uçta (liste, arama, düzenleme) nonce dönmez.
3. Controller: `broadcastMessage` senkron kalır (alıcılar için sıra önemli). Üç `notify*` çağrısı **cevabı bloklamaz**:
   tek bir özel metotta sırayla çalışır, `void ...catch(err => logger.error(...))` ile arkaya atılır. Davranış (kim, ne
   bildirim alır) değişmez; yalnız gönderen beklemez. Yutulan hata loglanmalı, sessiz kalmamalı.
4. Test: nonce yankısı (var/yok), notify hatası cevabı bozmaz.

## §2 İstemci davranışı (web ve mobil aynı kural)
1. **Kapsam: yalnız metin mesajı** (yanıt dahil). Ekli gönderim (dosya, GIF, sesli mesaj, video, yapay zeka "Kullan")
   bugünkü gibi kalır.
2. Gönder'e basınca:
   - `nonce = crypto.randomUUID()` (mobilde `expo-crypto` zaten varsa o, yoksa yeni bağımlılık EKLEME, basit
     `Date.now()+Math.random()` tabanlı üretici yeterli).
   - Geçici mesaj listeye eklenir: `id = 'pending:' + nonce`, `nonce`, yazar = ben (oturumdaki kullanıcı), `createdAt =
     şimdi`, `content` = sunucuya gidecek metin (bahsetme token'ları uygulanmış hali, render zaten çözüyor), açık yanıt
     varsa `replyTo` önizlemesi yerel veriden, `localStatus: 'sending'`.
   - Kutu **hemen** temizlenir, yanıt şeridi kapanır, dibe kayılır.
   - `sending` kilidi kalkar: kullanıcı cevap beklemeden art arda yazabilir. Mesajlar gönderim sırasıyla gider; her
     biri kendi isteği.
3. Eşleştirme (store'da, tek yerde):
   - `appendMessage(m)`: `m.nonce` listedeki bir geçici mesajla eşleşirse o geçici mesaj **yerinde** gerçeğiyle
     değiştirilir (sıra kaymaz). Eşleşmezse bugünkü id dedup'ı.
   - HTTP cevabı ve WS yayını hangisi önce gelirse gelsin tek mesaj kalır; ikincisi id dedup'a takılır.
4. Hata (ağ veya sunucu reddi): geçici mesaj `localStatus: 'failed'`, `localError` = sunucunun Türkçe `message`'ı (ağ
   hatasında i18n "Bağlantı yok, gönderilemedi"). Mesajın altında: "Gönderilemedi · Tekrar dene · Sil". Tekrar dene
   **aynı nonce** ile yeniden gönderir; Sil yalnız yerelden kaldırır. Bugünkü kutu üstü `sendError` metni metin
   gönderiminde artık kullanılmaz (ekli gönderimde kalır). Yavaş mod: mevcut `slowModeSeconds` göstergesi beslenmeye
   devam eder.
5. Geçici veya başarısız mesajda: menü, tepki, düzenle, sil (sunucu), sabitle, yanıtla, ilet, kaydırarak yanıt
   **kapalı**. Yalnız Tekrar dene / Sil.
6. Görünüm: `sending` → içerik %55 opaklık, başka işaret yok (Discord gibi; spinner yok, yanıp sönme olmasın).
   `failed` → içerik normal, alt satır tehlike renginde (tasarım token'ı). Gruplama (aynı yazar ardışık) normal çalışır.
7. Geçici mesajlar yalnız bellekte. Sayfa yenilenirse/uygulama kapanırsa kaybolur (çevrimdışı kuyruk OUT).
8. DM listesi son mesaj önizlemesi / okunmamış sayacı geçici mesajdan etkilenmemeli (gerçeği gelince güncellenir).
   Etkileniyorsa geçici mesajı o hesaplardan hariç tut.
9. Tipler: istemci `MessageDto`'ya `nonce?: string`; yalnız yerel `localStatus?: 'sending' | 'failed'`,
   `localError?: string`.
10. Tüm yeni metinler i18n'de (web `vue-i18n`, mobil mevcut sözlük). Em dash yok.

## §3 Dosyalar (beklenen)
- api: `messages/dto/create-message.dto.ts`, `messages.service.ts` (dönüşe nonce), `messages.controller.ts`, spec.
- web: `stores/messages.ts` (ekle/eşle/hata), `api/messages.ts` (`send`'e nonce), `MessageArea.vue`, `DmConversation.vue`,
  `MessageItem.vue` (durum görünümü + kapalı eylemler), `types/index.ts`, i18n. `ComposerBar` yalnız gerekiyorsa.
  Kanal ve DM'deki gönderim mantığı ikinci kopya olmasın: ortak parça composable'a (ör. `useOptimisticSend`).
- mobil: `stores/messages.ts`, `api/messages.ts`, `useMessageComposer.ts`, `MessageBubble.tsx` (+ eylem menüsü kapısı),
  i18n.

## §4 DoD
- api: `npm run build`, test, lint temiz.
- web: `vue-tsc -b` (bilinen 6 dışında yeni yok), lint, `vite build`.
- mobil: typecheck + lint; versionCode +1.
- Ölçüm: yerelde POST süresi önce/sonra (notify'lar arkaya alınınca) rapora yazılır.
- Sahip turu: hızlı art arda 5 mesaj sıra bozulmadan ve çiftlenmeden; ağ kapalıyken gönder → Gönderilemedi → ağ açık →
  Tekrar dene; yavaş modlu kanalda reddedilen mesaj; automod'a takılan mesaj; yanıtla + gönder; ikinci cihazda tek kopya.

**OUT:** ekli mesajların iyimser gönderimi (ilerleme çubuğu) · çevrimdışı kuyruk · düzenleme/silme/tepkinin iyimser hali.
