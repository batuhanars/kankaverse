# Kankaverse — Deploy Rehberi (kapalı beta)

> Karar (2026-06-14): **web → Vercel · api → Railway · Postgres → Neon/Railway · Redis → Upstash/Railway ·
> S3 → Cloudflare R2 (veya S3-uyumlu) · LiveKit → Cloud.** Domain: ortak kök + alt-domain
> (`app.kankaverse.com` = web, `api.kankaverse.com` = api) → refresh cookie `sameSite:'lax'` aynen çalışır.
>
> **Neden api Vercel'de değil:** Socket.IO (kalıcı WS) + Redis pub/sub + uzun-ömürlü sunucu; Vercel serverless desteklemez.

---

## 1. Altyapı (managed servisler)

| Servis | Sağlayıcı | Çıktı |
|---|---|---|
| PostgreSQL | Neon / Railway Postgres | `DATABASE_URL` |
| Redis | Upstash / Railway Redis | `REDIS_URL` |
| Object storage | Cloudflare R2 / AWS S3 | `S3_*` (endpoint, bucket, key, secret, public url) |
| LiveKit | Cloud (mevcut) | `LIVEKIT_*` (var) |
| E-posta | Resend | `RESEND_API_KEY` |

---

## 2. Backend — Railway (`api/`)

- **Root directory:** `api`
- **Build:** Nixpacks otomatik (`npm install` → `postinstall: prisma generate` → `npm run build`).
- **Start:** `npm run start:prod` (`node dist/main`).
- **Release/migration (her deploy):** `npx prisma migrate deploy` (Railway "release command" veya start öncesi). **Asla `migrate dev` değil.**
- **Env değişkenleri (NODE_ENV=production fail-fast'leri ZORUNLU kılar):**
  ```
  NODE_ENV=production
  DATABASE_URL=...           REDIS_URL=...
  JWT_ACCESS_SECRET=...      JWT_REFRESH_SECRET=...   (uzun rastgele)
  TOTP_ENC_KEY=...           (openssl rand -base64 32 → tam 32 byte)
  RESEND_API_KEY=...         EMAIL_FROM=noreply@kankaverse.app
  FRONTEND_URL=https://app.kankaverse.com   (CORS + WS origin + e-posta linkleri)
  LIVEKIT_API_KEY=...  LIVEKIT_API_SECRET=...  LIVEKIT_URL=wss://...livekit.cloud
  S3_ENDPOINT=...  S3_REGION=...  S3_BUCKET=...  S3_ACCESS_KEY=...  S3_SECRET_KEY=...  S3_PUBLIC_URL=...
  PORT=  (Railway otomatik verir; main.ts process.env.PORT okur)
  ```
- **Custom domain:** `api.kankaverse.com` → Railway service.
- CORS + Socket.IO origin zaten `FRONTEND_URL`'den okunur (main.ts) — ekstra kod yok.

## 3. Frontend — Vercel (`web/`)

- **Root directory:** `web` · **Framework:** Vite · `vercel.json` SPA rewrite + build hazır.
- **Env:** `VITE_API_URL=https://api.kankaverse.com` (Production). Dev'de tanımsız → vite proxy.
- **Custom domain:** `app.kankaverse.com`.

## 4. LiveKit webhook (artık çalışır — public URL var)

- LiveKit Cloud → Settings → Webhooks → `https://api.kankaverse.com/voice/webhook` (imza otomatik doğrulanır).
- Bununla canlı katılımcı presence (kanalda kim var) tam çalışır.

## 5. Sıra (ilk deploy)

1. Postgres + Redis + R2 + Resend hesapları → bağlantı dizeleri.
2. Railway: api deploy + env'ler + `migrate deploy` + `api.` domain.
3. Vercel: web deploy + `VITE_API_URL` + `app.` domain.
4. LiveKit webhook URL'i ekle.
5. Duman testi: kayıt → giriş (refresh cookie) → mesaj (WS) → ses (LiveKit) → DM arama.

## 6. Açık kalemler / dikkat

- **CSAM tarama (R5):** `ATTACHMENT_SCAN_ENABLED` gerçek tarayıcı olmadan `true` yapılmaz; kapalı beta'da dosya/medya riskini sınırla.
- **KVKK/gizlilik politikası (R6):** kapalı beta öncesi en az taslak metin (mesaj içeriği rutin okunmaz; medya hash/ses metadata).
- **Maliyet:** LiveKit eşzamanlı ses dakikası faturayla doğrusal — beta'da kullanım izle.
