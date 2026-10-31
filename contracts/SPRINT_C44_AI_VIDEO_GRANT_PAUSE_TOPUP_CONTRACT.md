# SPRINT C44: Yapay zeka: hakkı biten kullanıcı kendi videolarını kullanır + web kilitli notunda en az 100 kredi

> Durum: **TASARIM KİLİTLİ (2026-10-31).** PM compose (Opus). Sahip isteği. **api + web**. Mobil kod değişmez (Play kuralı, §2).
> **R7:** yapay zeka erişim kapısının kapsamı değişir (hangi uçlar hak ister). Diff sahip onayına sunulur.
> Revizyon geçmişi: ilk taslaktaki "Kredi ekle" ve "Askıya al" DÜŞTÜ (sahip 2026-10-31: ek kredi satışı yok, tek araç Yenile;
> ek kredi ileride abonelik modeliyle gelir). Bitiş tarihi formdan kalktı (066cee7).

## §0 Sorun ve karar
`AiVideoController` sınıf düzeyinde `AiVideoAccessGuard` taşıyor. Kredisi biten (ya da hakkı iptal edilen) kullanıcı **kendi**
üretimlerini listeleyemiyor, indiremiyor, sohbete ekleyemiyor ve silemiyor. Sahip: "üretmeden para alıyoruz, ürettiğini kullansın".
Kendi verisini silememe ayrıca KVKK sorunu.

**Karar:** hak yalnız **para harcayan** uçlarda aranır. Kullanıcının kendi ürettikleri üzerindeki işlemler hak istemez.

## §1 API (`api/src/modules/ai-video/`)
1. Hak İSTEYEN (mevcut `AiVideoAccessGuard`): `POST /ai-video/input/presign`, `POST /ai-video/estimate`, `POST /ai-video`.
2. Hak İSTEMEYEN, yalnız oturum + e-posta doğrulaması + **reşit olmama** + **özellik bayrağı açık** (`aiVideo.enabled`):
   `GET /ai-video`, `GET /ai-video/:id`, `POST /ai-video/:id/attachment`, `DELETE /ai-video`, `DELETE /ai-video/:id`.
   Sahiplik servisteki `findOwned` ile zaten zorunlu (başkasının videosuna erişim yok); bunu test et.
   Yeni küçük guard ya da mevcut guard'a uç bazlı bir mod: dev en sade yolu seçer, `canUseAiVideo` ile aynı minör/bayrak kontrolünü
   tekrar yazmaz (ortak parça ayrılır).
3. `GET /ai-video/options`: bugünkü kilitli mod davranışı aynen (hak yoksa `allowed=false`). Değişiklik yok.
4. `POST /ai-video/:id/attachment` (sohbete ekleme) mevcut ek/mesaj kapılarından geçmeye devam eder (kanal yetkisi, minör DM kuralları);
   yalnız yapay zeka hakkı şartı kalkar.
5. Testler: hakkı biten kullanıcı kendi listesini/videosunu alır, siler, sohbete ekler; başkasınınkini alamaz (404); hak yokken
   `POST /ai-video` / estimate / presign 403; minör hepsinde red; bayrak kapalıyken hepsinde red.

## §1b Yenilemede kalan kredi devri (sahip 2026-10-31, api + web admin)
1. `PUT` yenileme (`ai-video-grants.service.ts` upsert): mevcut kayıt varsa ve **iptal edilmemişse**, `kalan = max(0, bütçe - kullanılan)`
   (kullanılan = `spentSinceMicro(startsAt)`, mevcut kural) hesaplanır; yeni bütçe = **girilen + kalan**. `startsAt` yine sıfırlanır.
   İptal edilmiş kayıtta devir YOK (girilen bütçe). İlk verişte devir yok. INT4 tavan kontrolü toplam üzerinden.
2. Devir aynı transaction içinde ve C43'teki kullanıcıya özgü advisory kilitle (`'ai-video:' || userId`) yapılır: yenileme sırasında
   süren bir üretimin rezervi kaçmasın. Süren (QUEUED/RUNNING) üretimin teklifi "kullanılan"a zaten sayılıyor (mevcut kural); yeni dönem
   `startsAt` sonrasını saydığı için o rezerv yeni dönemde görünmez: **yenilemede süren üretim varsa 409** (mesaj: "Kullanıcının süren
   bir üretimi var. Bitince yenile."). Sade ve kaçaksız.
3. `AuditLog` metadata'sına `carriedCredits` eklenir.
4. Liste satırı DTO'suna (admin) `remainingCredits` eklenir (formun önizlemesi için; zaten hesaplanıyorsa yeniden kullan).
5. Web yenileme formu: kredi alanının altında "Kalan {n} kredi devredilecek. Yeni limit: {toplam}." (n = 0 ise satır yok; iptal edilmiş
   hakta "İptal edilmiş hak devretmez." ). `renewHint` metni: "Yenileme yeni dönem başlatır; kalan kredi yeni limite eklenir."
6. Testler: 98/100 + 100 → bütçe 102 ve kullanılan 0; 100/100 + 100 → 100; iptal edilmiş + 100 → 100; süren üretim varken 409;
   audit `carriedCredits`.

## §2 Web
1. Kilitli modda (hak yok) form **Son üretimler**'i gösterir; indir / sohbete ekle / sil çalışır. Oluştur kapalı (bugünkü gibi).
   Kilitli modda Son üretimler bugün gizleniyorsa açılır; liste boşsa bölüm görünmez.
2. Kilitli not (`aiVideo.lockedNoteInvite`) yeni metin:
   "Yapay zeka ile video şu an yalnız erişim verilen kullanıcılara açık. En az 100 kredilik erişim alabilirsin. Bilgi için Kankaverse
   Belediyesi ortamına katılıp yöneticilerle görüşebilirsin."
   Fiyat (TL) yazılmaz.
3. **Mobil metin değişmez** (`lockedNoteMobile` nötr kalır): Play kuralı, mobilde fiyat/ödeme/satın alma yönlendirmesi yok.
   Mobil kilitli modda Son üretimler'in görünüp görünmediğini kontrol et ve raporla; kod değişikliği gerekiyorsa DUR, PM'e dön
   (vc43'e girip girmeyeceğine sahip karar verir).

## §3 DoD
api build + tüm testler + `tsc -p tsconfig.build.json --noEmit`; web `vue-tsc -b` (6 önceden-var dışında yeni hata yok) + dokunulan
dosyalarda eslint + `vite build`. Şema değişikliği yok. Sahip R7 onayı.

## §4 OUT
Abonelik modeli (aylık ücret, yapay zeka + hareketli profil/ortam görselleri ayrıcalığı, abonelikte ek kredi), ek kredi satışı,
askıya al/sürdür, Pika bakiyesi gösterimi.
