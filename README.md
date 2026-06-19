<p align="center">
  <img src="web/src/assets/brand/kankaverse-logo-yatay.png" alt="Kankaverse" width="440" />
</p>

<p align="center">
  <b>Türkiye için sıfırdan tasarlanmış, topluluk odaklı gerçek zamanlı iletişim platformu.</b><br/>
  Türkçe moderasyon · KVKK uyumu · <b>çocuk güvenliği mimariye gömülü</b>
</p>

<p align="center">
  <i>Durum: kapalı beta (davetli) — aktif geliştirme · <a href="https://kankaverse.com">kankaverse.com</a></i>
</p>

---

## Kankaverse nedir?

Sesli/görüntülü sohbet, metin kanalları ve topluluk ("Ortam") yönetimi sunan, Discord'a **yerli bir alternatif.** Farkı: Türkiye pazarına (dil, mevzuat, ödeme) ve **çocuk güvenliğine** baştan tasarlanmış olması.

## Öne çıkan özellikler

- 💬 **Gerçek zamanlı metin sohbeti** — kanallar, kategoriler, DM + grup DM, mention, yanıt, sabitleme, arama, reaksiyon
- 🔊 **Sesli kanallar** (LiveKit) — anlık konuşma, sustur/sağırlaştır, cihaz seçimi
- 🎥 **Görüntülü sohbet + ekran paylaşımı** — Discord-tarzı kart ızgarası, sığdır/doldur, tam-ekran
- 🛡️ **Çocuk güvenliği** — yaş-kapılı (18+) kanallar, yetişkin-özel ortamlar, moderasyon araçları (sustur/taşı/çıkar), içerik kapıları
- 👥 **Roller + izinler**, davet kodları, ortam keşfi
- 📥 **Discord sunucu şablonu içe aktarma** — kanal/kategori/rol yapısını Kankaverse'e taşı
- 🖥️ **Masaüstü uygulaması** (Electron) — sistem tepsisi, native bildirim, ekran paylaşımı
- 🌍 **Tam Türkçe arayüz** (vue-i18n) — TR tarih/saat/para biçimi

## Teknoloji

| Katman | Stack |
|---|---|
| Backend (`api/`) | NestJS 11 · Prisma · PostgreSQL · Socket.IO (Redis adapter) |
| Web (`web/`) | Vue 3 · Vite · TypeScript · Pinia · Tailwind |
| Masaüstü (`desktop/`) | Electron |
| Gerçek zamanlı ses/video | LiveKit |
| Altyapı | Docker Compose · Caddy (otomatik TLS) |

## Monorepo yapısı

```
api/        NestJS backend (REST + WebSocket)
web/        Vue 3 SPA — birincil istemci
desktop/    Electron masaüstü sarmalayıcı
contracts/  Sprint sözleşmeleri (PM ↔ geliştirme)
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

## İlkeler

- **Tek doğruluk kaynağı:** API sözleşmesi (OpenAPI) — istemci tipleri buradan türetilir.
- **Tutarlı yanıt zarfı** tüm HTTP uçlarında: `{ success, statusCode, data }` / hata: `{ success:false, message, error }`.
- **i18n gün-1:** kullanıcıya görünen hiçbir metin koda gömülü değildir.
- **Çocuk güvenliği & güven/emniyet (T&S)** mimari kararların merkezindedir; auth/oturum ve T&S karar fonksiyonları satır satır insan incelemesinden geçmeden merge edilmez.

---

> Kankaverse aktif geliştirme aşamasındadır; özellikler ve arayüz değişebilir.
