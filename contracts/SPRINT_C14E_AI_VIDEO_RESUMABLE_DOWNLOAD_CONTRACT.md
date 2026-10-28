# SPRINT C14e: Yapay zeka video, kaldığı yerden indirme

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). Yalnız `api/`. R7-nötr (kapı/oturum dokunulmaz).
> Tetik: sahibin 480p 30 sn üretimi (`cmvs4uf2q000401r0asfli87u`, 28,3 MB) "Kaydediliyor"da kaldı.

## §0 Teşhis (ölçüldü)
- Sunucu ağı sağlam: Cloudflare 26 MB/s, Hetzner 6,7 MB/s, OVH 16 MB/s.
- `cdn.pika.art` her yerden yavaş: sunucudan curl ~88 KB/s, Node fetch 15-34 KB/s, sahibin evinden ~73 KB/s;
  chunk arası boşluk 17 sn'ye çıkıyor. Range destekli (`accept-ranges: bytes`, 206 dönüyor).
- Kusur bizde: `PikaClient.downloadVideo` her denemede baştan başlıyor; 30 sn boşta veya 30 dk toplam sınırda
  inen bayt çöpe gidiyor. 28 MB bu hızda 30 dk'ya sığmıyor → her deneme "This operation was aborted", sonsuza dek.

## §1 Değişiklik
1. `downloadVideo` kaldığı yerden devam eder: deneme içinde bağlantı koparsa / boşta kalırsa (abort, `terminated`,
   ağ hatası) `Range: bytes=<inen>-` ile yeniden bağlanır ve ekler. 206 → ekle; 200 → baştan (tampon sıfırla);
   416/4xx-5xx → fırlat. İlk istek Range'siz (mevcut tür denetimi korunur; devam isteklerinde de 200/206 türü denetlenir).
2. Denemeler arası kalıcılık: kısmi tampon süreç belleğinde `generationId` (veya çıktı URL'si) anahtarlı tutulur; sonraki
   poller denemesi kaldığı bayttan sürer. Başarı/vazgeçme/silmede tampon atılır. Süreç yeniden başlarsa baştan (kabul).
   Bellek üst sınırı mevcut `AI_OUTPUT_MAX_BYTES` (50 MB); aynı anda birkaç iş olabilir, map'i başarı/hata yolunda temizle.
3. Sınırlar: boşta kalma 30 sn kalır (yeniden bağlanma tetiği olarak). Tek denemenin toplam sınırı 30 dk → **60 dk**.
   Deneme içinde art arda ilerlemesiz yeniden bağlanma en çok 5 kez (sonra fırlat, poller sonraki denemede sürer).
4. Anahtar çıktı adresine ASLA gitmez (mevcut kural). Log yalnız id + inen/toplam bayt.
5. Tamamlanınca bayt sayısı `content-length`/`content-range` toplamıyla eşleşmeli; eşleşmezse fırlat (bozuk mp4 yazma).

6. **(Revizyon, PM incelemesi)** İndirme yoklama turunu BLOKLAMAZ: `tick` sıralı `await` ettiği için 60 dk'lık bir
   indirme tüm kullanıcıların üretim yoklamasını durduruyor (önceden de 30 dk vardı). `complete()` içindeki indirme +
   depolama + DB yazımı turdan ayrılıp arka planda koşar; poller'da bellek içi `inFlight` kümesi (id) aynı satır için ikinci
   indirmeyi başlatmaz (tur o satırı atlar). Bitince/hata olunca kümeden çıkar; hata yolu mevcut DOWNLOAD_PENDING davranışı.
   `onModuleDestroy` süren indirmeleri bekleme zorunluluğu yok (yeniden başlatma = baştan, kabul).
7. **(Revizyon)** İndirme bitince satır o arada silinmişse (`deletedAt` dolu ya da satır yok) çıktı yüklenmez/yazılmaz,
   COMPLETED'a çekilmez.

## §2 Test
- `pika.client.spec.ts`: (a) ortada kopma → Range ile devam, sonuç birleşik; (b) devamda 200 → baştan; (c) 5 ilerlemesiz
  yeniden bağlanma → fırlat; (d) boyut uyuşmazlığı → fırlat. Poller spec: denemeler arası tamponun sürmesi + başarıda silinmesi.

## §3 DoD
- [ ] `npx tsc --noEmit -p tsconfig.build.json` (bilinen 2 spec hatası dışında temiz), ai-video spec'leri yeşil
- [ ] Deploy sonrası takılı `cmvs4uf2q000401r0asfli87u` kendiliğinden COMPLETED olur (canlıda doğrulanır)

## §4 Sapma kuralı
Poller'ın genel yapısı ve hata kodları değişmez. Daha büyük değişiklik gerekirse dev durur, raporlar.
