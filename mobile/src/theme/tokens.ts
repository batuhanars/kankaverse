// Sprint M0 contract §7 — design token tek kaynağı `web/src/styles/tokens.css` (+ web/CLAUDE.md
// tipografi ölçeği). Renk/ölçü/yarıçap DEĞERLERİ buradan birebir port edilir; bileşenler bu
// dosyadan okur, değeri kendi içine gömmez. Web'de olmayan yeni bir token uydurulmadı.

export const colors = {
  // nötr
  bgRail: '#131110',
  bgSidebar: '#1A1817',
  bgContent: '#211E1C',
  bgElevated: '#2A2724',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
  // metin
  textPrimary: '#F4F1ED',
  textBody: '#D6D0C8',
  textSecondary: '#B6AFA6',
  textMuted: '#847C71',
  // aksan: kor
  accent400: '#FF845E',
  accent500: '#FF6B3D',
  accent600: '#E5552A',
  accentSubtle: 'rgba(255, 107, 61, 0.12)',
  // semantik
  danger: '#F23B4B',
  dangerSubtle: 'rgba(242, 59, 75, 0.12)',
  success: '#3DB46E',
  warning: '#E8A33D',
  // Sprint M1c — e-posta doğrulama bandı için. Web'in karşılığı (`EmailVerificationBanner.vue`)
  // token değil, o bileşene özel bir ad-hoc rgba fallback (`--kv-warning-subtle, #3D2E0E`)
  // kullanıyor; burada uydurulmadı — `dangerSubtle`/`accentSubtle` ile AYNI formül (base rengin
  // %12 opaklığı) `warning` rengine uygulanarak türetildi.
  warningSubtle: 'rgba(232, 163, 61, 0.12)',
  info: '#4E9CF5',
  // presence
  online: '#3DB46E',
  idle: '#E8A33D',
  dnd: '#F23B4B',
  offline: '#6E675E',
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

// web/CLAUDE.md "Tasarım Sistemi" — 11/13/14/15/16/18/22 px ölçeği
export const fontSize = {
  xs: 11,
  sm: 13,
  md: 14,
  base: 15,
  lg: 16,
  xl: 18,
  xxl: 22,
} as const;

// tokens.css layout değerleri — çoğu (rail/panel genişliği) masaüstü app-shell'e ait ve
// M0'ın 3 ekranında kullanılmıyor; yine de tek kaynaktan birebir taşındı (gelecek fazlar
// için hazır, uydurma değil).
export const layout = {
  railWidth: 72,
  panelWidth: 264,
  headerHeight: 64,
  panelGap: 16,
  inputMinHeight: 44,
  control: 32,
  controlSm: 28,
  // Sprint M1b R2 (§13) — FAB (Yeni Mesaj girişi). Web'de karşılığı yok (mobil-özel yüzen buton
  // deseni); 56dp standart Material dokunma hedefi, uydurma bir marka ölçüsü değil.
  fabSize: 56,
} as const;

// NOT: Figtree/JetBrains Mono font dosyaları mobile/assets'e henüz eklenmedi (yeni bağımlılık +
// asset gerektirir, M0 kapsamı dışı — PM onayı gerekir). Sistem fontu kullanılıyor; aile adı
// burada saklı tutuluyor ki font eklenince tek yerden değişsin.
export const fontFamily = {
  ui: undefined, // sistem varsayılanı (Figtree eklenene kadar)
  mono: undefined,
} as const;
