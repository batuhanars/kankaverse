# SPRINT C32: Sesli mesaj ses seviyesi eşitleme

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-29).** PM compose (Opus). **Yalnız api** (+ canlıda bir kez geriye dönük komut).
> R7-nötr (erişim/görünürlük kuralı yok). Sahip: "masaüstünden dinliyorum, ses çok kısık, sonuna kadar açmak zorunda kalıyorum".

---

## §0 Teşhis + karar
- Sesli mesaj yalnız mobilden gönderiliyor (D73). Android kaynağı `voice_communication` (otomatik kazanç) 2026-10-02'de açıldı,
  ama kazanç cihaza göre değişiyor; ölçülen kayıtlar -18 ile -33 dB arasıydı.
- İstemci dosyayı presign ile **doğrudan depolamaya** yüklüyor; sunucu baytlara hiç dokunmuyor. Telefon oynatıcısı sesi 1.0'ın üstüne
  çıkaramıyor, yani oynatma tarafında yükseltme mobilde imkânsız. **Karar: dosyanın kendisi sunucuda eşitlenir**, her istemci aynı
  dosyayı çalar. Web oynatıcısına yükseltme EKLENMEZ.
- Sunucuda ffmpeg kurulu (`api/Dockerfile`, C13) ve güvenli çalıştırıcı var (`api/src/shared/media/run-binary.ts`: shell yok, argüman dizisi).

## §1 Şema
- `Attachment.audioNormalizedAt DateTime?` (idempotency: dolu olan bir daha işlenmez). Migration yazılır, yerel DB'ye uygulanır.

## §2 Eşitleme servisi (`api/src/shared/media/` altında, mevcut kalıpla)
1. Girdi: attachment id. Koşullar: `contentType` `audio/*`, `scanStatus` CLEAN, `messageId` dolu, mesaj silinmemiş, `audioNormalizedAt` null.
   Aksi halde sessizce çık.
2. Depodan oku (mevcut storage servisi) → geçici dosya (os tmpdir, iş bitince her durumda silinir).
3. ffmpeg: `loudnorm=I=-16:TP=-2:LRA=11` (sahip turu öncesi PM: tek geçişte tepe -1.5 hedefini ~1.2 dB aşıyordu, pay büyütüldü), mono, 64 kbps, **aynı kap/kodek** (m4a → AAC/mp4, webm → Opus/webm, mpeg → mp3).
   Zaman aşımı (ör. 60 sn), çıktı boyut sınırı (girdi boyutunun 3 katı).
4. **Güvenlik kapısı:** ffprobe ile çıktı süresi girdiyle ±500 ms içinde değilse ya da çıktı boşsa YAZMA, logla, orijinal kalır.
5. Geçerliyse **aynı depolama anahtarına** aynı `contentType` ile yaz; `size` ve `audioNormalizedAt` güncelle. `durationMs` ve `waveform`
   değişmez (dalga biçimi göreli).
6. Kuyruk: süreç içi, eşzamanlılık 1 (VPS CPU'su korunur). Hata API'yi düşürmez; `logger.error`, orijinal dosya kalır.

## §3 Tetikleyici
- Mesaj oluşturma yolu bir `audio/*` eki mesaja bağladığında (C29 `notifyAfterSend` gibi cevaptan SONRA, `void ... .catch`), ek kuyruğa
  girer. Cevap süresi değişmez. İletilen kopyalar (C30) da mesaja bağlandıkları için aynı yoldan geçer.
- İlk birkaç saniyede dinleyen orijinali duyabilir; kabul edilen bedel.

## §4 Geriye dönük komut
- `npm run audio:normalize-backfill` (Nest standalone context ya da mevcut script kalıbı): §2 koşullarını sağlayan tüm eski ekleri
  sırayla işler, sonunda "işlenen / atlanan / hatalı" sayısını yazar. Tekrar çalıştırmak güvenli (idempotent). `--dry-run` sayıyı gösterir.
- Canlıda bir kez PM çalıştırır (sahip onayıyla), API konteyneri içinden.

## §5 Test
- Mutlu yol (ffmpeg/ffprobe çağrıları taklit: doğru argümanlar, aynı anahtara yazım, alanlar güncellendi).
- Süre uyuşmazlığında yazım yok · audio olmayan / CLEAN olmayan / silinmiş mesaj / zaten işlenmiş atlanır · geçici dosya hata yolunda da siliniyor ·
  tetikleyici cevabı bekletmiyor.
- **Gerçek ölçüm (yerelde):** yerel ffmpeg ile kısık bir örnek dosya üret (ör. `-af volume=-25dB`), servisten geçir, öncesi/sonrası
  `ebur128`/`volumedetect` değerlerini raporla. Hedef: entegre ses yüksekliği ≈ -16 LUFS.

## §6 DoD
- api: build, ilgili jest + tam koşu, değişen dosyalara `npx eslint`, `migrate status` temiz. Mobil/web değişmez.
- Canlı: deploy sonrası backfill `--dry-run` sayısı → sahip onayı → gerçek koşu → sonuç sayıları sahibe.
- **Sahip turu:** telefondan yeni bir sesli mesaj gönder, masaüstünde normal ses seviyesinde dinle; daha önce kısık olan eski bir mesajı
  backfill sonrası yeniden dinle.

**OUT:** web/mobil oynatıcıda yükseltme · kayıt tarafında (mobil) işleme · gürültü bastırma · video seslerinin eşitlenmesi.
