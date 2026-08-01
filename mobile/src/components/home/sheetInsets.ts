import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 🔴 Alt panellerin sistem gezinme çubuğu payı (sahip bulgusu 2026-08-01, ÜÇ TUŞLU gezinmeli cihaz).
 *
 * SDK 54'te edge-to-edge varsayılan AÇIK: uygulama gezinme çubuğunun ALTINA da çiziyor. Paneller
 * ekranın en altına yaslandığı için son satır tuşların arkasında kalıyordu. Jest gezinmeli cihazda
 * (sahibin telefonu) çubuk ince olduğundan sabit `paddingBottom: 28` kazara yetiyordu; üç tuşlu
 * cihazda (48dp) yetmiyor. Aynı kusurun mesaj kutusu hâli `MessageScreen`'de düzeltildi.
 *
 * Neden ayrı dosya: dört panel (Ortam · Kanal · Kategori · Ortam Ekle) aynı payı hesaplıyor —
 * sabiti dört yere kopyalamak, sonraki cihaz bulgusunda dördünü de tek tek düzeltmek demekti
 * (Rule of Three fazlasıyla doldu). Panellerin GÖRSEL kabuğu hâlâ ayrı ayrı duruyor; onu ortak
 * bileşene çıkarmak ayrı bir karar (PM'e borç olarak yazıldı), burada yalnız hesap paylaşılıyor.
 *
 * Taban değer: `Modal` Android'de ayrı bir pencerede çizilir ve bazı cihazlarda inset 0 dönebilir;
 * o durumda panel eskisinden DAR kalmasın diye 16dp taban veriliyor.
 */
export function useSheetInsets(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom;
}

export function sheetBottomPadding(bottomInset: number): number {
  return Math.max(bottomInset, 16) + 12;
}
