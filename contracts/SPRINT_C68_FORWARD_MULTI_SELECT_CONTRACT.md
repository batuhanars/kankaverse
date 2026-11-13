# SPRINT C68: İletmede çoklu seçim + tek hedefte sohbete geçiş

> Durum: **KİLİTLİ (2026-11-13, sahip kararı).** PM compose (Opus). web + mobile. **api değişmez.** R7 değil
> (gönderim mevcut `attachmentsApi.forward` + E2EE `send` yolundan, kapılar sunucuda aynen).

## §0 Hedef
Bugün iletme penceresinde her satırın kendi "gönder"i var, pencere açık kalıyor, kullanıcı hedef sohbete elle gidiyor.
Yeni model: kişiler **işaretlenir**, alttaki tek **Gönder** ile gönderilir.
- **1 hedef seçildiyse:** gönder → pencere kapanır → **o sohbet açılır.**
- **2+ hedef seçildiyse:** her birine ayrı gönder → pencere kapanır → toast "{n} sohbete iletildi", ekranda kalınır.
- "Grup kur" seçeneği **YOK** (sahip kararı; gerekçe: nadir kullanım, grup kurmanın tek kapısı bozulmasın).

## §1 Seçim
- Satıra dokunmak seçimi açar/kapar; satırın sağında onay kutusu (seçili: `--kv-accent-500` dolu daire + tik).
- **En fazla 5 hedef.** 6.'ya dokununca seçilmez, toast "En fazla 5 sohbet seçebilirsin". (T&S: toplu yayma/spam
  sınırı; bugünkü satır-satır modelde de pratikte tek tek gidiyordu.)
- Arama süzgeci seçimi silmez (süzülüp gizlenen seçili satır seçili kalır).
- Alt buton: seçim yokken pasif; varken "Gönder" (1) / "Gönder ({n})" (2+). Gönderim sürerken pasif + yükleniyor.
- Metin de ek de yoksa (bugünkü boş durum) liste ve buton pasif, değişmez.

## §2 Gönderim
- Hedefler **paralel** gönderilir (`Promise.allSettled`); her hedef bugünkü gibi kendi ek kopyalarını alır
  (`attachmentsApi.forward` her ek için) sonra E2EE `send`/`sendMessage`. Gönderim kodu bugünkü `forwardTo` ile aynı,
  yalnız hedef başına çağrılır.
- **Hepsi başarılı:** §0 davranışı.
- **Kısmi/tam başarısızlık:** pencere AÇIK kalır. Başarılı satırlar "İletildi" etiketi alır ve seçimden düşer,
  tekrar seçilemez. Başarısız satırlar seçili kalır; sunucunun Türkçe mesajı gösterilir (web toast, mobil bugünkü
  satır üstü hata alanı; birden çok farklı hata varsa ilki). Buton "Gönder ({kalan})" olur, tekrar denenebilir.
  Bu durumda otomatik sohbete geçiş YOK (kullanıcı ne olduğunu görsün).

## §3 Sohbete geçiş (yalnız tek hedef, başarılı)
- **Web/masaüstü:** pencere kapanır, uygulamanın mevcut DM açma yolu (store/router, yeni yol yazılmaz) ile hedef DM açılır.
  Hedef zaten açık olan sohbetse yalnız pencere kapanır.
- **Mobil:** `dmRouteParams(channel)` ile hedef sohbet. Kaynak ekran bir DM sohbetiyse `router.replace` (geri tuşu
  sohbet listesine döner, iki sohbet üst üste birikmez); başka bir ekransa (ortam kanalı vb.) `router.push`.
  Hedef = kaynak sohbetse yalnız kapanır.
- Geçişte toast yok (mesaj zaten görünür).

## §4 Kapsam sınırı
- **Web:** `DmTargetList.vue` seçim modunu **opt-in prop** ile alır (ör. `selectable` + `v-model` seçili id'ler +
  `max`). Varsayılan davranış DEĞİŞMEZ: `AiVideoSendTargetModal` bugünkü tek dokunuşla gönderme modelinde kalır.
  `ForwardMessageModal.vue` seçim + alt buton + §2/§3.
- **Mobil:** `ForwardMessageModal.tsx` (liste bu dosyanın içinde). `ShareTargetList` (YZ video) DOKUNULMAZ.
- **i18n (web `tr.json` + mobil karşılığı, aynı anahtarlar):** `message.forwardSend` "Gönder",
  `message.forwardSendCount` "Gönder ({n})", `message.forwardedMany` "{n} sohbete iletildi",
  `message.forwardLimit` "En fazla 5 sohbet seçebilirsin". Mevcut `forwarded`/`forwardedShort` korunur.
  Kullanılmaz kalan anahtar silinmez (masaüstü/eski sürüm riski yok ama gereksiz iş).
- **OUT:** grup kurma, ortam kanalı hedefleri, iletmeye not ekleme, "İletildi" mesaj etiketi, api değişikliği.

## §5 DoD
1. Web: `vue-tsc -b` yalnız bilinen 6 hata; `npm run build` yeşil. 390px ve 320px genişlikte pencere taşmıyor, alt buton görünür.
2. Mobil: `npx tsc --noEmit` yeşil; küçük ekranda alt buton klavye açıkken de erişilebilir (`keyboardShouldPersistTaps`).
3. YZ video gönderim penceresi (web) davranışı değişmedi.
4. Cihaz turu (sahip): tek hedef → sohbete geçti, geri tuşu listeye; 3 hedef → toast, ekranda kaldı, üçüne de geldi;
   engellenmiş kişiyle karışık seçim → kısmi hata akışı; 6. seçim reddi; şifreli (izin listesi) ve şifresiz hesapta ekli
   mesaj iletimi.
