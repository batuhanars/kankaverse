# Sprint D63 — Dağıtım Sonrası Bayat Parça Öz-Onarımı

> **Tier:** yalnız `web/`. `api/`, `mobile/`, `desktop/` diffi **sıfır**.
> **Kaynak:** sahip cihaz turu 2026-08-10 — masaüstünde ortam ekranına hiç girilemedi; "Disable cache"
> ile açıldı. TASK.md "Dağıtım sonrası bayat parça sorunu (KÖK NEDEN, sınıf düzeyinde)".
> **R7 yüzeyi yok** (auth ve T&S karar fonksiyonlarına dokunulmuyor).

## §0 Bugünkü durum (okundu, doğrulandı)

- `web/src/router/index.ts` — 20+ rota, hepsi `() => import(...)` ile tembel yüklüyor. Vite bunları
  içerik-hash'li ayrı parçalara böler (`/assets/GuildChannelView-<hash>.js`).
- `web/nginx.conf` — `/assets/` **1 yıl `immutable`**, `index.html` `no-cache`. Doğru yapılandırma;
  değiştirilmeyecek.
- `web/src/main.ts` — parça yükleme hatası için **hiçbir dinleyici yok**. `router.onError` de yok.
- Yeni dağıtım eski parça dosyalarını sunucudan siler.

## §1 Kök neden

Kullanıcının açık duran sekmesi/penceresi **eski `index.html`'i** çalıştırmaya devam eder ve elindeki
parça adları eskidir. O ana kadar girmediği bir ekrana tıkladığında tembel `import()` çalışır, dosya
artık sunucuda yoktur → `Failed to fetch dynamically imported module`.

Sonuç kullanıcı için: **ekran hiç açılmıyor, hiçbir hata mesajı yok.** Tıklıyor, bir şey olmuyor.
Tablo "uygulama bozuldu" gibi görünüyor.

En sert vurduğu yer masaüstü: tepside günlerce açık kaldığı için her dağıtımda tekrarlar. Webde de
sekmeyi açık bırakan herkeste olur.

## §2 Çözüm — tek seferlik öz-onarım

Yeni dosya: **`web/src/lib/chunkReload.ts`** (~40 satır). `main.ts` içinde `app.mount()`'tan **sonra**
bir kez çağrılır (`installChunkReload(router)` gerekmiyorsa parametresiz).

Vite'ın derlenmiş `__vitePreload` yardımcısı, tembel import zinciri patladığında `window` üzerinde
iptal edilebilir bir **`vite:preloadError`** olayı yayar; `preventDefault()` çağrılmazsa hatayı
yeniden fırlatır. Davranış:

1. Olay yakalanır.
2. **Yenilenebilir mi** diye bakılır (§2.1 + §2.2).
3. Yenilenecekse: `event.preventDefault()` → damga yazılır → **hedefe** tam sayfa gezinmesi
   (`location.assign`, bkz. §2.3).
4. Yenilenmeyecekse: `preventDefault` **çağrılmaz** (hata normal yolundan yükselsin, sessiz kalmasın)
   ve kullanıcıya Türkçe toast gösterilir (§4).

### §2.1 🔴 Döngü koruması (zorunlu)

`sessionStorage` anahtarı `kv.chunkReload.at` → son yenilemenin `Date.now()` damgası.

- Damga varsa ve **`now - damga < 15000`** ise **yenileme YAPILMAZ.** Yenileme sorunu çözmediyse
  (ör. sunucu gerçekten bozuk) uygulama sonsuz yenilenmemeli.
- Yenilemeden önce damga yazılır.
- 15 sn'den eski damga geçersizdir; ayrıca temizlemeye gerek yok, karşılaştırma yeterli.

Sekme başına (`sessionStorage`) olması bilinçli: bir sekmedeki başarısız deneme diğer sekmeyi
kilitlemesin.

### §2.2 🔴 Ses/görüntü aramasındaki kullanıcıyı DÜŞÜRME (PM kararı)

`useVoiceStore().connectedChannelId` doluysa **anında yenileme yapılmaz.** Sebep: masaüstü günlerce
açık kalan istemci, yani aramada olma ihtimali en yüksek olan istemci; ortasında sayfayı yenilemek
kullanıcı için çökme demektir ve şu an düzeltmeye çalıştığımız kusurdan daha kötü bir tablodur.

Bunun yerine:
- `pendingReload` bayrağı kurulur, kullanıcıya bilgi toast'ı gösterilir (§4).
- `connectedChannelId` `null`'a düştüğü anda (`watch`) yenileme yapılır — **§2.1 damga kontrolü
  burada da geçerlidir.**

Yani arama biter bitmez uygulama kendini onarır; kullanıcı hiçbir şey yapmaz.

### §2.3 🔴 Yenileme HEDEFE yapılır, aynı adrese değil (addendum — sahip onayladı 2026-08-11)

Sözleşmenin ilk hâli `location.reload()` diyordu. Sınamada ölçüldü ve yetersiz çıktı: import
patladığında gezinme commit edilmediği için URL hâlâ ESKİ ekranı gösteriyor, dolayısıyla `reload()`
kullanıcıyı bulunduğu yere geri koyuyor. Kullanıcı hedefe varmak için **ikinci kez tıklamak**
zorunda kalıyordu; ölçüm: yenileme sonrası `path` hâlâ `/login`, kayıt ekranı ancak ikinci
tıklamada açıldı. İkinci tıklamayı akıl etmeyen kullanıcı için kusur pratikte hiç düzelmemiş olur.

Bu yüzden:
- `router.beforeEach` içinde son denenen rota (`to.fullPath`) tutulur. Guard hiçbir şey döndürmez,
  gezinmeyi etkilemez.
- Yenileme `window.location.assign(hedef)` ile yapılır → kullanıcı **tek tıklamayla** hedefe varır.
- §2.2'nin ertelenmiş dalında (arama bitince) hedef geçilmez, bulunulan sayfa yeniden yüklenir:
  orada kullanıcı zaten bulunduğu ekranda kalmış durumda.

## §3 Kapsam dışı (bilerek yapılmayacak)

- `nginx.conf` / `Caddyfile` **değişmez.** Önbellek başlıkları zaten doğru; sorun sunucuda değil.
- Service worker, sürüm anketi (`/version.json` polling), "yeni sürüm var" banner'ı **yok.**
  Bu sprint bir kusuru kapatıyor, güncelleme bildirim sistemi kurmuyor.
- Eski parçaları sunucuda saklama (grace window) **yok** — dağıtım yolunu karmaşıklaştırır.
- Masaüstü auto-update ayrı ve ertelenmiş bir iş; bu sprint ona dokunmaz.

## §4 i18n (kök CLAUDE.md — kodda gömülü string YOK)

`web/src/i18n/tr.json` içine iki anahtar (mevcut ad düzenine uy, ör. `common.*` ya da `app.*`):

| Durum | Metin (uzun çizgi kullanma) |
|---|---|
| Aramadayken ertelendi (§2.2) | "Uygulamanın yeni bir sürümü yayınlandı. Görüşme bitince otomatik yenilenecek." |
| Yenileme çözmedi (§2.1) | "Bir ekran yüklenemedi. Sayfayı yenilemeyi dene, sürerse bize bildir." |

Toast için mevcut `stores/toast.ts` kullanılır (`info` / `error`). **Yeni UI bileşeni yazılmayacak.**

## §5 Sınır koşulları

- Handler `app.mount()` sonrasında kurulur → Pinia hazırdır, `useToastStore()` / `useVoiceStore()`
  handler içinde güvenle çağrılır (modül tepesinde DEĞİL).
- `location.reload()` yeterlidir: `index.html` `no-cache` ile servis edilir, yenileme yeni parça
  adlarını getirir.
- Olay dev sunucusunda **hiç oluşmaz** (preload yardımcısı yalnız derlemede var) → doğrulama §6'daki
  gibi derleme üzerinden yapılır.

## §6 Doğrulama

```
npx vue-tsc -b     # bilinen 6 önceden-var hata; fazlası senin
npm run lint
npx vite build     # ŞART
```

Davranış sınaması (dev tarafından yapılacak, ekran çıktısı/log ile raporlanacak):

1. `npx vite build` → `npx vite preview` → uygulamayı aç, giriş yap, **ana ekranda kal**
   (ortam ekranına girme, o parça yüklenmemiş olsun).
2. `dist/assets/` içinden `GuildChannelView-*.js` ve `ChannelPanel-*.js` dosyalarını **sil**
   (dağıtımın eski parçayı silmesini birebir taklit eder).
3. Uygulamada bir ortam kanalına tıkla.
   - **Beklenen:** sayfa bir kez kendini yeniler ve ekran açılır.
   - Konsolda sonsuz yenileme **olmamalı**.
4. Aynı adımı bu kez sekmeyi silinmiş parçalarla **ikinci kez** tetikleyerek dene (15 sn içinde):
   - **Beklenen:** ikinci yenileme yok, §4'teki hata toast'ı çıkıyor.

## §7 Ayrı kalem — masaüstü `ERR_TOO_MANY_REDIRECTS` (bu sprintte KOD YOK)

TASK.md'deki masaüstü kaydı: `/assets/GuildChannelView-*.js` için yönlendirme döngüsü. Sunucu tarafı
temiz doğrulandı (curl 200 + geçerli JS), `desktop/src/main.js` içinde `webRequest`/`onBeforeRequest`
türü **hiçbir yönlendirme kancası yok** (PM taradı). Yani kaynak istemci önbelleğinde duran eski bir
kalıcı yönlendirme.

Bu sprintin öz-onarımı semptomu büyük olasılıkla kapatır (yenileme → yeni parça adları → önbellekte
karşılığı olmayan taze URL). **Ama kanıtlanmadı.** Sahip turunda hâlâ görülürse istenecek kanıt:
Network sekmesinde ilgili isteğin `Location` başlığı + aynı turdaki 502'nin isteği. Kanıt gelmeden
kod yazılmayacak.

## §8 Sapma kuralı

Sözleşme dışına çıkma ihtiyacı doğarsa **dur, PM'e bildir.** Özellikle: yeni bağımlılık, yeni bileşen,
`nginx.conf`/`Caddyfile` değişikliği ya da başka bir tier'a dokunma ihtiyacı → önce onay.
