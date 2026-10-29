# SPRINT C31a: Masaüstü otomatik güncelleme

> Durum: **SÖZLEŞME YAZILDI (2026-10-29), sahip onayı bekliyor.** PM compose (Opus). **Yalnız desktop** (+ DEPLOY belgesi).
> **R7-nötr** (istemci kabuğu, auth/T&S karar fonksiyonu yok). C31b oyun algılamanın ön koşulu: masaüstü ana süreci
> değiştiren her özellik yeni kurulum dosyası ister, güncelleme olmadan herkes elle indirmek zorunda kalır.

---

## §0 Bağlam
- Masaüstü load-remote: web kodu canlıdan gelir, kendiliğinden güncel. Yalnız ana süreç (`desktop/src/main.js`, preload,
  picker) değişince yeni kurulum gerekir.
- Kurulum dosyası bugün elle VPS'e kopyalanıyor: `/home/deploy/kankaverse/downloads/kankaverse-setup.exe`, Caddy
  `/indir/*` ile sunuyor (`Caddyfile:16`, `docker-compose.prod.yml:78`). Adres sabit:
  `https://kankaverse.com/indir/kankaverse-setup.exe` (`landing/utils/links.ts`, `web/.../DownloadAppModal.vue`).
- Hafıza kararı (2026-07-02): `electron-updater`, generic provider = kendi VPS, **bildirimli** (sessiz zorlama yok).

## §1 Desktop
1. Bağımlılık: `electron-updater` (dependencies, devDependencies değil; paket içinde çalışır).
2. `package.json` `build.publish`: `{ provider: "generic", url: "https://kankaverse.com/indir/" }`. `artifactName` sabit kalır
   (`kankaverse-setup.${ext}`), indirme adresi değişmez.
3. Sürüm: `1.0.1 → 1.1.0`. Kural (DEPLOY'a yazılır): her yayında `version` artar, yoksa güncelleyici "yeni yok" der.
4. Akış (`main.js`, yalnız `app.isPackaged`):
   - Açılışta ve sonra 6 saatte bir `checkForUpdates()`. `autoDownload = true`, `autoInstallOnAppQuit = true`.
   - `update-downloaded` → web'e köprü olayı `{ version }`. Hata → yalnız `console.error`, kullanıcıya gösterilmez
     (ağ yoksa uygulama sessizce çalışmaya devam eder).
5. Köprü (`preload.js`, dar API kalıbı korunur, iki yeni üye):
   - `onUpdateReady(cb)` → `cb({ version })`, abonelikten çıkış fonksiyonu döner.
   - `installUpdate()` → ana süreç `quitAndInstall()`. `isQuitting = true` ayarlanır ki tepsiye kapanma devreye girmesin.
6. Tepsi menüsüne "Güncellemeleri denetle" satırı (elle tetik). Yeni sürüm yoksa sessiz kalır.

## §2 Web (yalnız `window.kankaverse?.onUpdateReady` varsa)
1. Uygulama kabuğunun üstünde ince bant: "Kankaverse güncellendi. Yeniden başlatınca yeni sürüm açılır." + **Yeniden başlat**
   düğmesi + kapat (x). Kapatılırsa bu oturumda tekrar gösterilmez; çıkışta zaten kurulur.
2. Tip: `window.kankaverse` tip tanımına iki üye eklenir, isteğe bağlı (eski kurulumlarda yok).
3. Metinler i18n'de, em dash yok.

## §3 Yayın adımı (DEPLOY_VPS.md'ye bölüm)
`npm run dist` çıktısından üç dosya VPS `downloads/` klasörüne: `kankaverse-setup.exe`, `kankaverse-setup.exe.blockmap`,
`latest.yml`. **Sıra: önce exe ve blockmap, en son `latest.yml`** (yarım yüklemede istemci olmayan dosyayı istemesin).

## §4 DoD
- `npm run dist` geçer, `latest.yml` üretilir.
- **Sahip turu:** 1.1.0 kurulur → sunucuya 1.1.1 konur → uygulama bandı gösterir → Yeniden başlat → 1.1.1 açılır.
  Ayrıca bant kapatılıp uygulamadan çıkılınca sonraki açılış 1.1.1.
- **Sınanacak varsayım:** imzasız NSIS'te güncelleme kurulumu SmartScreen'e takılmadan geçiyor mu. Takılıyorsa dur, PM'e gel.
- Eski 1.0.1 kurulumları kendiliğinden güncellenmez (güncelleyici yok). Duyuru metni sahipte: "bir kez yeniden indir".

**OUT:** kod imzası (OV/EV, para) · mac/linux · zorunlu güncelleme · sürüm notu penceresi · CI'dan otomatik yayın.
