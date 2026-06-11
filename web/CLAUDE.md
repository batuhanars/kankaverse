# Kankaverse Web — Frontend CLAUDE.md (Vue 3 SPA)

> Bu dosya **kök `../CLAUDE.md` ile birlikte** yüklenir (cascade). Cross-cutting kurallar kökte; burada
> yalnızca web-spesifik kurallar var.

Stack: **Vue 3 + Vite + TypeScript + Pinia + vue-router + vue-i18n + Tailwind**.
Referans: `knowledge/stack/frontend/component-organization.md`.

---

## Paket Yığını (kilitli)

Vue 3 + Vite zaten scaffold'da. Eklenecekler:

- **State / routing / i18n:** `pinia`, `vue-router`, `vue-i18n`
- **HTTP / realtime:** `axios` (envelope-aware interceptor + 401 refresh), `socket.io-client`
- **Stil:** `tailwindcss` **v4** + `@tailwindcss/vite` (CSS-first config — token'larımız CSS değişkeni
  tabanlı olduğu için doğal uyum; ayrı `postcss`/`autoprefixer` yapılandırması gerekmez)
- **Font:** `@fontsource/figtree` + `@fontsource/jetbrains-mono` (self-host; CDN bağımlılığı yok)
- **Form & validasyon:** `vee-validate` + `zod` (**v4**) + `@vee-validate/zod` (`useForm` + `toTypedSchema`)
- **Composable yardımcıları:** `@vueuse/core` (breakpoint/clipboard/onClickOutside vb. — elle reaktif logic yazmak yerine)
- **UI primitive (a11y):** `reka-ui` + shadcn-vue (CLI ile kopyalanan primitive'ler) + `clsx` + `tailwind-merge` (`cn` util)

Sürümler kurulum anında en güncel kararlıdan; **Tailwind 4.x** kilitli. **Yeni bağımlılık = PM onayı.**

> **zod sürüm notu (önemli):** zod **v4** bilinçli — şemalar v4 syntax'ı kullanır (`z.string({ error })`; v3'te `required_error`).
> `@vee-validate/zod`'un peer metadata'sı bayat (en yeni 4.15.1 bile hâlâ `zod@^3.24` ister) ama runtime'da v4 ile sorunsuz
> çalışır. Yanlış-pozitif peer hatası `package.json` `overrides` (`@vee-validate/zod → zod: $zod`) ile çözüldü.
> **zod'u v3'e DÜŞÜRME** — tüm form şemaları kırılır. Override'ı kaldırma; yeni `npm install`'lar patlar.

### UI primitive & form konvansiyonu

- **Kv\* basit primitive'ler kalır** (`KvButton`, `KvInput`, `KvModal`) — çalışıyor, tasarımla uyumlu; yeniden yazılmaz.
- **shadcn-vue / Reka UI yalnız karmaşık/a11y primitive için** kullanılır (`Select`, `Calendar`, `Dropdown`,
  `Tooltip`, `Dialog`, `ContextMenu`) — `components/ui/` altında, `--kv-*` token'larıyla temalanır
  (shadcn semantic değişkenleri → `--kv-*` eşlemesi `styles/`'da).
- **Formlar vee-validate + zod ile** yönetilir; manuel `reactive` form state yeni formlarda kullanılmaz.
  zod şemaları `contracts/SPRINT_X_CONTRACT.md` §4 sabitlerini (uzunluk/pattern kuralları) uygular.
- **Frontend validasyon yalnız UX'tir; güvenlik otoritesi backend** (`class-validator`). İkisi de contract
  sabitlerini kaynak alır (R7).

---

## Klasör Yapısı

```
src/
├── views/<x>/                  # auth, app (sohbet), settings, ...
│   ├── XView.vue               # SADECE compose eder, state yönetmez (50-100 satır)
│   └── components/             # o view'a özel component'lar (inline yazma)
├── components/
│   ├── ui/                     # primitive'ler (buton, input, modal) — dokunulmaz tabaka
│   ├── layout/                 # AppShell, ServerRail, ChannelPanel, MemberPanel, TopBar
│   └── shared/                 # birden fazla view'da kullanılan (ConfirmDialog, Avatar, ...)
├── composables/                # useAuth, useSocket, useConfirm — tekrar eden reactive logic
├── stores/                     # Pinia: auth, guilds, channels, messages
├── router/                     # vue-router
├── api/                        # axios instance + interceptor + (OpenAPI'dan üretilen) client
├── i18n/                       # vue-i18n; tr.json tek kaynak
├── styles/                     # tokens.css (--kv-* değişkenleri), tailwind giriş
└── main.ts
```

## Kurallar

- **View sadece compose eder.** Render mantığı component'lara dağılır; state Pinia store'a / composable'a çıkar.
  Component prop alır + emit yapar.
- **Inline component yazma.** Sezgi: "bu component'a isim vermek istiyor muyum?" → evetse ayrı dosya.
  3-5 satırlık, tek yerde kullanılan parça inline kalabilir (over-abstraction tuzağı).
- **Promosyon (Rule of Three):** component 2. view'da gerekince `components/shared/`'a taşı, ismini view-bağımsız
  yap, konfigürasyonu prop'a çevir. 3. kullanımda promote et, 2'de bekle.
- **Composable eşiği:** bir component'ın `<script setup>`'ı 80+ satıra ulaşınca reactive logic'i composable'a böl.

---

## API Katmanı

- Tek axios instance (`api/`); base URL config'ten.
- **Interceptor (envelope-aware):** gerçek payload `response.data.data`'dan çıkar; hata mesajı `response.data.message`
  (Türkçe) gösterilir, `error` kodu loglanır.
- **401 → otomatik refresh:** in-flight refresh promise pattern (eş zamanlı 401'lerde tek refresh). Refresh
  başarısız → login'e yönlendir.
- Tipler/client OpenAPI spec'ten üretilir (kök CLAUDE.md "tek doğruluk kaynağı").

## Gerçek Zamanlı

- `useSocket` composable: Socket.IO client, handshake'te access token, kanal room'una join/leave.
- `message.created` event'i → ilgili Pinia store'a yazılır, UI reaktif güncellenir.

## i18n

- vue-i18n; **görünen hiçbir string template'e gömülü değil** → `i18n/tr.json`. Tarih "25 Ekim 2023", saat "18.42".

---

## Tasarım Sistemi (token = tek kaynak)

Kaynak: `knowledge/projects/kankaverse/kankaverse-design-tokens.md`. Tailwind config + `styles/tokens.css`
oradan türetilir.

- **Tema:** koyu varsayılan (sıcak kömür nötrler — Discord'un soğuk mavi-grisinden bilinçli ayrışma).
- **Aksan "Kor"** `#FF6B3D` (`--kv-accent-500`): birincil buton/aktif kanal/seçim. **Saf kırmızı yalnızca
  hata/tehlike/DnD** (`--kv-danger #F23B4B`) — aksanla karıştırma.
- **Font:** Figtree (UI/gövde), JetBrains Mono (kod blokları). Ölçek: 11/13/14/15/16/18/22 px.
- **İmza öğesi — altıgen:** sunucu ikonları `clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)`.
  **Kullanıcı avatarları daire kalır.**
- **Gölge YOK.** Katman ayrımı arka plan tonu (`--kv-bg-rail/sidebar/content/elevated`) + ince kenarlık ile.
- **App shell ölçüleri:** sunucu rayı 72px sabit · kanal paneli 248px · mesaj alanı esnek (min 480) · üye paneli 248px ·
  üst bar 48px · mesaj input min 44px (max 50vh). Breakpoint: 768 (drawer) · 1024 (üye paneli yok) · 1280 (tam).
- Presence renkleri: çevrimiçi `#3DB46E` · boşta `#E8A33D` · DnD `#F23B4B` · çevrimdışı `#6E675E`.

## Sapma Kuralı

Contract'taki endpoint/DTO/enum'a uymuyorsa kod yazma → **dur, kullanıcıya bildir, PM'e dön.**
