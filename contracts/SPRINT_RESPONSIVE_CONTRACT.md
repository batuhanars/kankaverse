# Responsive Contract — Web Tam Responsive Yapı (frontend-only)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + `web/CLAUDE.md` geçerli. Bu bir **sprint değil**, app-shell + ekranlar-arası responsive layout işi.
> Plan/kapsam kaynağı: PM planı (onaylı 2026-06-23). PLAN.md teknik borç **D22**'nin gerçekleştirimi.
>
> **R7 kapsamı YOK** — saf görsel/layout. Backend'e, auth'a, T&S karar fonksiyonuna **dokunulmaz**. SIFIR endpoint/DTO/şema değişikliği.

---

## 1. Hedef & Gerekçe

Web SPA bugün **desktop-first**; app-shell ~768px altında daralmıyor (ray 72px + panel 264px sabit `shrink-0`
→ telefonda içeriğe ~75px kalıyor, kullanılamaz). Landing + auth responsive, app-shell **değil**.

**Model (sahip kararı 2026-06-23):** Discord masaüstü web modeli — panel daraldıkça düşer, içerik gridleri
yeniden akar. Gerçek telefon kullanımı için **tek bir sol-drawer** eklenir (mobil-web'i "kullanılamaz"dan
"idare eder"e taşır). Tam mobil deneyim ileride **Flutter** (F2). Hedef: açık kayıt (TR mobil-ağırlık) öncesi
mobil-web ayağa kalksın.

---

## 2. Kapsam — ÇİZGİ NET

- **Frontend-only, SIFIR backend.** Yeni endpoint/DTO/şema YOK. Gerekiyor sanılırsa → dur, PM'e dön.
- **Kapsam DAHİL:** app-shell drawer + hamburger + panel gizleme/overlay + içerik grid reflow + modallar + ayar ekranları mobil.
- **Kapsam DIŞI (V2 — §7):** ses/video tile grid responsive · swipe-ile-drawer-aç jesti · dokunmatik sürükle-sırala.
- **Renk/şekil DAİMA `web/src/styles/tokens.css`.** Tüm metin i18n (`tr.json`) — yeni görünür string gömme.
- **Mevcut akışlar regresyonsuz** kalır (geniş ekranda bugünkü görünüm birebir korunur — responsive yalnızca daralınca devreye girer).

---

## 3. Breakpoint Sabitleri (KİLİTLİ — tek doğruluk)

Tailwind v4 varsayılan `md/lg/xl` = **768 / 1024 / 1280** → `web/CLAUDE.md` ile birebir. Ekstra screen config GEREKMEZ.
`@vueuse/core` `breakpointsTailwind` preset'i kullanılır.

| Zone | mobile `<768` | tablet `768–1023` | desktop `1024–1279` | wide `≥1280` |
|---|---|---|---|---|
| Sol kolon (rail+sidebar+UserCard) | **off-canvas drawer** (hamburger) | inline | inline | inline |
| Ana içerik | tam genişlik | esnek | esnek | esnek |
| Üye/sağ panel | overlay drawer (toggle) | overlay drawer (toggle) | overlay drawer (toggle) | **inline görünür** |
| Modallar | **tam-ekran / bottom-sheet** | ortalı | ortalı | ortalı |

Kural: **sol-drawer YALNIZ mobil** (`<768`); **üye paneli inline YALNIZ `≥1280`**, altında toggle ile sağdan overlay.

### Composable API (KİLİTLİ — bu imzalardan sapma)

`composables/useResponsive.ts` — modül-seviyesi tek `useBreakpoints(breakpointsTailwind)` örneği sarmalar:
```ts
isMobile     // smaller('md')        → < 768
isTablet     // between('md','lg')   → 768–1023
isDesktop    // between('lg','xl')   → 1024–1279
isWide       // greaterOrEqual('xl') → ≥ 1280
```

`composables/useAppShellNav.ts` — modül-seviyesi reactive state (`useAppModals.ts` deseni örnek):
```ts
leftDrawerOpen   // ref<boolean>  — mobil sol drawer
rightPanelOpen   // ref<boolean>  — üye/sağ panel overlay (<1280)
toggleLeftDrawer() / closeLeftDrawer()
toggleRightPanel() / closeRightPanel()
// Router watch: her route değişiminde ikisini de kapat (bir kez kurulur).
```

---

## 4. Contract A — Temel + App-shell drawer · ÖNCE (çekirdek, tek session)

Foundation + shell sıkı bağlı. Bunsuz B/C başlamaz.

**Temel:**
- `composables/useResponsive.ts` + `composables/useAppShellNav.ts` — §3 imzaları birebir.
- Tailwind v4 `md/lg/xl` değerlerini teyit (zaten 768/1024/1280; gerekirse `styles`'ta `@theme` ile sabitle, değiştirme).

**App-shell — `web/src/views/app/AppShell.vue`:**
- `<768`: sol kolon (`ServerRail` + `RouterView name="sidebar"` + `UserCard`) **off-canvas drawer** (`translate-x` + transition); arka-plan **backdrop** (tıkla-kapat); `body` **scroll-lock** drawer açıkken. `≥768`: bugünkü inline davranış **birebir korunur**.
- **Hamburger** düğmesi → `TopBar` / `GuildTopBar` / `HomeTopBar`'a, **yalnız `<768`** görünür, `toggleLeftDrawer`.
- Drawer içinden bir item seçilince / route değişince drawer kapanır (§3 router watch).

**Üye/sağ panel:**
- `≥1280`: inline (mevcut yerinde). `<1280`: default gizli, `toggleRightPanel` → **sağdan overlay drawer** + backdrop.
- `TopBar.vue`'daki mevcut `showMemberPanel` prop + `toggleMembers` emit'i `useAppShellNav`'a bağla (yeni paralel state kurma — mevcut toggle'ı yeniden-kullan).
- Üye paneli bugün `TextChannelView` içinde sağda render ediliyor; inline↔overlay geçişini orada/AppShell'de çöz.

**Erişilebilirlik:** drawer açıkken focus-trap + ESC-kapat + uygun `aria-*`; backdrop yalnız mobil/overlay'de.

**DoD-A:** 360/768/1024/1440'da: hamburger→sol drawer aç/kapa, route seçince kapanır, içerik tam genişlik; `≥1280` üye paneli inline, `<1280` toggle ile overlay; geniş ekran regresyonsuz; `npx vite build` temiz.

---

## 5. Contract B — İçerik reflow · A'dan sonra

- `web/src/views/home/components/HomeDashboard.vue`:
  - Hızlı aksiyon grid (`:57`): `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (+ Discord-import bayrağı açıkken `xl:grid-cols-4`). Mevcut sabit `grid-cols-3/4` kaldırılır.
  - Ortam kartları (`:130`): `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Liste/panel bileşenleri dar genişlikte taşmasız + tam-yükseklik scroll (drawer/overlay bağlamında): `MemberPanel`, `HomeSidebar`, `DmList`, `FriendsRightPanel`, `DmProfilePanel`.
- Mesaj alanı + mesaj input: `min-w-0` zinciri kontrol (dar genişlikte yatay taşma yok).

**DoD-B:** home / guild metin kanalı / DM ekranları **360px'de yatay-scroll YOK**; geniş ekran regresyonsuz; build temiz.

---

## 6. Contract C — Modallar + ayar ekranları · A'dan sonra (B ile paralel olabilir)

- `web/src/components/ui/KvModal.vue` (`:13`): `<768` **tam-ekran/bottom-sheet** (`max-w-md` yerine mobilde `w-full h-full` + radius düşür). Türeyen tüm modallar tek dokunuşla düzelir.
- `web/src/views/settings/UserSettingsView.vue` + `web/src/views/app/components/GuildSettingsView.vue`: mobilde sol ayar-sidebar'ı → üst sekme/drawer, içerik tek kolon.
- KvModal **türevi olmayan** modalları ayrıca doğrula/uyumla: `ServerModal`, `FriendAddModal`, `InvitePeopleModal`, `StartChatModal`.

**DoD-C:** ayar ekranları + tüm modallar **360px'de kullanılabilir** (taşma/kesik yok); geniş ekran regresyonsuz; build temiz.

---

## 7. Ertelenenler (bu kapsam DIŞI → V2)

Ses/video tile grid responsive (oda *layout olarak* shell'e uyar; tile iç-grid'i ayrı) · swipe-ile-drawer-aç jesti ·
dokunmatik sürükle-sırala. Dev bunlara dokunursa = scope creep → dur, PM'e dön.

---

## 8. Sıralama & Delege

`A (temel+shell)` **önce** → tamamlanınca `B (reflow)` ve `C (modal/ayar)` **paralel** dev session'larına verilebilir.
Her biri ayrı Sonnet session, `cd web/`, yalnız bu tier. Her session bu contract'ı tek doğruluk kabul eder.

## 9. Doğrulama (her contract sonu — ortak)

- `cd web && npm run dev` → DevTools cihaz çubuğu **360 / 768 / 1024 / 1440px**: home, guild metin kanalı, DM, ayar modalı, ortam ayarları, davet modalı gezilir.
- `cd web && npx vite build` temiz (uyarılar `@vueuse` node_modules kaynaklı — zararsız; deploy `vite build` kullanır, `vue-tsc` mevcut hatalarını gate etmez).
- Geniş ekran (≥1280) görünümü değişikliklerden **önce/sonra birebir** (regresyon yok).
