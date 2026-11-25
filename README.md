<p align="center">
  <img src="web/src/assets/brand/kankaverse-logo-yatay.png" alt="Kankaverse" width="440" />
</p>

<p align="center">
  <b>Türkiye için sıfırdan tasarlanmış, topluluk odaklı gerçek zamanlı iletişim platformu.</b><br/>
  Türkçe moderasyon · KVKK uyumu · <b>çocuk güvenliği mimariye gömülü</b>
</p>

<p align="center">
  <i>Durum: yayında. Web, masaüstü ve Android (Google Play) · aktif geliştirme · <a href="https://kankaverse.com">kankaverse.com</a></i>
</p>

---

## Kankaverse nedir?

Sesli/görüntülü sohbet, metin kanalları ve topluluk ("Ortam") yönetimi sunan, Discord'a **yerli bir alternatif.** Farkı: Türkçe ve Türkiye mevzuatı (KVKK) için baştan tasarlanmış olması, ve **çocuk güvenliğinin** sonradan eklenen bir özellik değil, mimarinin parçası olması.

Backend, web, masaüstü ve Android istemcisi tek kişi tarafından tasarlanıp geliştirildi ve kendi sunucusunda (self-host) işletiliyor.

## Öne çıkan özellikler

**İletişim**
- 💬 **Gerçek zamanlı metin sohbeti:** kanallar, kategoriler, DM + grup DM, mention, yanıt, sabitleme, arama, reaksiyon
- 🔐 **Uçtan uca şifreli DM:** MLS (IETF RFC 9420) ile, çoklu cihaz destekli; sunucu mesaj içeriğini göremez. Kademeli olarak açılıyor
- 🔊 **Sesli kanallar** (LiveKit): anlık konuşma, sustur/sağırlaştır, cihaz seçimi
- 🎥 **Görüntülü sohbet + ekran paylaşımı:** kart ızgarası, sığdır/doldur, tam ekran
- 🔔 **Push bildirim:** mesaj önizlemesi, bildirimden hızlı cevap, gelen arama ekranı

**Topluluk**
- 👥 **Roller + izinler**, davet kodları, ortam keşfi
- 📅 **Ortam etkinlikleri:** tekrar eden etkinlikler, katılım ilgisi
- 🪝 **Webhook'lar** ve Kick/Twitch yayın duyuruları
- 📥 **Discord sunucu şablonu içe aktarma:** kanal/kategori/rol yapısını Kankaverse'e taşı
- 🎬 **AI video:** metinden ya da görselden kısa video üretimi

**Güven ve emniyet**
- 🛡️ **Çocuk güvenliği:** yaş kapılı (18+) kanallar, yetişkinlere özel ortamlar, içerik kapıları
- 🚨 **Acil yardım butonu:** her kullanıcı tetikleyebilir, moderasyon ekibine öncelikli düşer
- ⚖️ **Moderasyon araçları:** şikâyet kuyruğu, kanıt saklama (süreli, otomatik silinir), sustur/taşı/çıkar/yasakla
- 🗑️ **Veri saklama süreleri:** silinmesi gereken veriler zamanlanmış işlerle otomatik temizlenir (KVKK)

**İstemciler**
- 🌐 **Web** (Vue 3): birincil istemci
- 🖥️ **Masaüstü** (Electron): sistem tepsisi, native bildirim, ekran paylaşımı, otomatik güncelleme
- 📱 **Android** (React Native + Expo): Google Play'de yayında
- 🌍 **Tam Türkçe arayüz** (vue-i18n): TR tarih/saat/para biçimi

## Teknoloji

| Katman | Stack |
|---|---|
| Backend (`api/`) | NestJS 11 · Prisma · PostgreSQL · Redis · Socket.IO (Redis adapter) |
| Web (`web/`) | Vue 3 · Vite · TypeScript · Pinia · Tailwind |
| Masaüstü (`desktop/`) | Electron |
| Mobil (`mobile/`) | React Native · Expo · Expo Router · EAS Build · FCM |
| Uçtan uca şifreleme (`shared/`) | MLS (`ts-mls`) · `@noble` kripto ilkelleri · web ve mobilde ortak çekirdek |
| Gerçek zamanlı ses/video | LiveKit (WebRTC SFU) |
| Altyapı | Docker Compose · Caddy (otomatik TLS) · GitHub Actions → GHCR → VPS |

## Mimari notlar

- **Tek origin:** Caddy, web uygulamasını, API'yi (`/api`) ve WebSocket'i (`/socket.io`) aynı alan adından sunar. CORS preflight yok, frontend'de API adresi gerekmez.
- **Yalnız Caddy dışarıya açık:** PostgreSQL, Redis, API ve web yalnız Docker iç ağında çalışır.
- **Derleme sunucuda değil:** imajlar GitHub Actions'ta derlenip GHCR'ye itilir; VPS'teki runner yalnız çeker ve başlatır. Her imaj commit SHA'sıyla etiketlenir, geri dönüş tek komut.
- **Yatay ölçeklemeye hazır gerçek zamanlı katman:** Socket.IO, Redis adapter ile birden fazla API kopyası arasında yayın yapabilir.
- **Eşzamanlılık:** kritik yarışlar veritabanında çözülür (ör. tek kullanımlık anahtarlar için `FOR UPDATE SKIP LOCKED`, grup sırası için koşullu UPDATE ile iyimser kilit).
- **Platforma göre kripto:** E2EE çekirdeği WebCrypto'yu çalışırken sınar, eksikse (React Native / Hermes, eski Electron) saf JS uygulamasına geçer.

## Monorepo yapısı

```
api/        NestJS backend (REST + WebSocket)
web/        Vue 3 SPA, birincil istemci
desktop/    Electron masaüstü sarmalayıcı
mobile/     React Native + Expo Android uygulaması
shared/     Ortak paketler (E2EE çekirdeği ve istemcisi)
landing/    Tanıtım sitesi (Nuxt, statik)
contracts/  Sprint sözleşmeleri (PM ↔ geliştirme)
docs/       Yol haritası taslakları, gizlilik metni taslağı, çalışma notları
PLAN.md     yol haritası + mimari kararlar
CLAUDE.md   çalışma kuralları (tier'lara cascade yüklenir)
```

## Geliştirme

Yerel altyapı (PostgreSQL + Redis) Docker Compose ile:

```bash
cp .env.example .env
docker compose up -d        # postgres:16 + redis:7
```

Backend ve web:

```bash
cd api && npm install && npm run start:dev    # http://localhost:3001
cd web && npm install && npm run dev           # http://localhost:5173
```

API belgeleri (Swagger) backend çalışırken: `http://localhost:3001/api/docs`

## İlkeler

- **API belgeli:** tüm uçlar Swagger/OpenAPI ile belgelenir, belge koddan (controller ve DTO'lardan) üretilir.
- **Tutarlı yanıt zarfı** tüm HTTP uçlarında: `{ success, statusCode, data }` / hata: `{ success:false, message, error }`.
- **i18n gün-1:** kullanıcıya görünen hiçbir metin koda gömülü değildir.
- **Güvenlik mantığının tek kopyası olur:** E2EE motoru web ve mobilde aynı pakettir; platformlar yalnız depolama ve ağ katmanını takar.
- **Çocuk güvenliği & güven/emniyet (T&S)** mimari kararların merkezindedir; auth/oturum ve T&S karar fonksiyonları satır satır insan incelemesinden geçmeden merge edilmez.

---

> Kankaverse aktif geliştirme aşamasındadır; özellikler ve arayüz değişebilir.

---

© 2026 Batuhan Arslan. Tüm hakları saklıdır.
