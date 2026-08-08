const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * withDevMenuFabFix — `expo-dev-menu`in yüzen düğmesini (FAB) PiP penceresinde çökmekten kurtarır.
 *
 * 🔴 SORUN (sahip cihaz turu 2026-08-08). Görüntülü aramada uygulama arka plana alınıp PiP'e
 * geçince dev build'de kırmızı hata ekranı çıkıyordu:
 *
 *   java.lang.IllegalArgumentException: Cannot coerce value to an empty range
 *     at expo.modules.devmenu.fab.FabUtilsKt.calculateTargetPosition
 *
 * Kök neden `MovableFloatingActionButton.kt`te:
 *   val bounds = Offset(constraints.maxWidth - fabW, constraints.maxHeight - fabH)
 * PiP penceresi düğmeden küçük olduğunda bu değerler NEGATİF oluyor; `calculateTargetPosition`
 * sonra `coerceIn(0f, bounds)` çağırıyor ve `min > max` olduğu için Kotlin istisna fırlatıyor.
 * Tetikleyici `LaunchedEffect(bounds.x, bounds.y)` — yani pencere boyutu her değiştiğinde.
 *
 * İki çökme yolu var, ikisi de kapatılıyor:
 *   1. Negatif sınır → `coerceAtLeast(0f)`.
 *   2. Sınır 0 olunca oran hesabı sıfıra bölüp `NaN` üretiyor; `Offset.toIntOffset()` içindeki
 *      `roundToInt()` Kotlin'de `NaN` için de ISTISNA fırlatıyor → sıfır kontrolü eklendi.
 *
 * NEDEN BÖYLE BİR YAMA:
 * - Ayarla kapatılamıyor: `BindingView.kt` bu bileşeni KOŞULSUZ compose ediyor; dev menüdeki
 *   "Action button" anahtarı yalnız `visible` parametresini etkiliyor, konum hesabını durdurmuyor.
 * - Yukarı akışta düzeltme yok: `expo-dev-client@6.0.21` SDK 54 hattının en güncel kararlı sürümü.
 * - Bileşen **yalnız geliştirme derlemesinde** var; mağaza sürümünü hiç ilgilendirmiyor. Yama
 *   tamamen "cihazda PiP'i test edebilelim" içindir.
 *
 * NEDEN `patch-package` DEĞİL: Windows'ta CRLF yüzünden temiz kopyayla diff alırken patlıyor
 * (denendi, 2026-08-08). Bu plugin `prebuild` sırasında dosyayı yerinde düzeltiyor; EAS de sırayla
 * install → prebuild → gradle çalıştırdığı için derlemeye yamalı hali giriyor.
 *
 * ⚠️ SDK/`expo-dev-menu` yükseltmesinde: dosya değişmişse yama SESSİZCE uygulanmaz (aşağıdaki
 * `includes` kontrolleri tutmaz) ve hata geri gelir. O gün bu dosya güncellenmeli — ya da yukarı
 * akış düzeltmişse tamamen silinmeli.
 */

const TARGET = path.join(
  'node_modules',
  'expo-dev-menu',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'devmenu',
  'fab',
  'MovableFloatingActionButton.kt',
);

const BOUNDS_FROM = `    val bounds = Offset(
      x = constraints.maxWidth - totalFabSizePx.x,
      y = constraints.maxHeight - totalFabSizePx.y
    )`;

const BOUNDS_TO = `    // [Kankaverse yaması] PiP penceresi FAB'dan küçükken bu değerler negatife düşüyor ve
    // calculateTargetPosition içindeki coerceIn(0f, bounds) boş aralık istisnası fırlatıyor.
    val bounds = Offset(
      x = (constraints.maxWidth - totalFabSizePx.x).coerceAtLeast(0f),
      y = (constraints.maxHeight - totalFabSizePx.y).coerceAtLeast(0f)
    )`;

const RATIO_FROM = `        val newX = (oldX / previousBounds.x) * bounds.x
        val newY = (oldY / previousBounds.y) * bounds.y`;

const RATIO_TO = `        // [Kankaverse yaması] sınır 0 olabiliyor → sıfıra bölme NaN üretir, Offset.toIntOffset()
        // içindeki roundToInt() Kotlin'de NaN için istisna fırlatır (ikinci çökme yolu).
        val newX = if (previousBounds.x != 0f) (oldX / previousBounds.x) * bounds.x else 0f
        val newY = if (previousBounds.y != 0f) (oldY / previousBounds.y) * bounds.y else 0f`;

module.exports = function withDevMenuFabFix(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.projectRoot, TARGET);
      if (!fs.existsSync(file)) {
        // Paket kurulu değil (ör. dev-menu içermeyen bir profil) → yapacak bir şey yok.
        return cfg;
      }
      let src = fs.readFileSync(file, 'utf8');
      let applied = 0;

      if (src.includes('[Kankaverse yaması]')) {
        return cfg; // idempotent — prebuild iki kez çalışırsa ikinci kez dokunmaz
      }
      if (src.includes(BOUNDS_FROM)) {
        src = src.replace(BOUNDS_FROM, BOUNDS_TO);
        applied++;
      }
      if (src.includes(RATIO_FROM)) {
        src = src.replace(RATIO_FROM, RATIO_TO);
        applied++;
      }

      if (applied === 2) {
        fs.writeFileSync(file, src);
        console.log('[withDevMenuFabFix] expo-dev-menu FAB yaması uygulandı (PiP çökmesi).');
      } else {
        // 🔴 Sessizce geçme: yukarı akış dosyayı değiştirmiş demektir, yama artık tutmuyor.
        console.warn(
          `[withDevMenuFabFix] YAMA UYGULANAMADI (${applied}/2 eşleşme). expo-dev-menu güncellenmiş ` +
            'olabilir; PiP hata ekranı geri gelebilir. plugins/withDevMenuFabFix.js gözden geçirilmeli.',
        );
      }
      return cfg;
    },
  ]);
};
