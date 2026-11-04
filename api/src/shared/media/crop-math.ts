/**
 * C13b R7 — kırpma matematiği (SAF fonksiyonlar, I/O yok).
 *
 * İstemci kaynağın boyutuna oranla 0-1 kesirleri gönderir (§2.1). Sunucu bunları kaynak piksellerine
 * çevirir, dikdörtgeni hedef oranına MERKEZİ KORUYARAK küçültür ve kaynak sınırına kıstırır. İstemcinin
 * yuvarlama hatası reddedilmez, düzeltilir. Çıkan sayılar sonlu tamsayıdır: ffmpeg filtresine ve
 * sharp.extract'a doğrudan girebilir.
 *
 * Uzaklaştırma: pencere kaynaktan büyük olabilir (width/height > 1, x/y < 0). Bu durumda kaynak tuvale
 * küçültülerek yerleşir, kalan alan saydam kalır (`placeZoomedOutCrop`).
 */

export interface CropFractions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** x+width / y+height için kayan nokta payı (sözleşme §2.1). */
const FRACTION_TOLERANCE = 1.0001;
/** Uzaklaştırmada pencere kaynağın kaç katı olabilir. Çıktı boyutu sabit, bu yalnız saçma girdiyi eler. */
const MAX_WINDOW_FRACTION = 10_000;

/**
 * Tek eksen: pencere ya kaynağın içindedir (kırpma) ya da kaynağı tümüyle kapsar (uzaklaştırma).
 * İkisinin arası (kaynağın bir kenarı dışarıda, öteki pencereye sığmıyor) istemcide oluşmaz, reddedilir.
 */
function isValidAxis(start: number, length: number): boolean {
  if (!(length > 0) || length > MAX_WINDOW_FRACTION) return false;
  if (start >= 0 && start + length <= FRACTION_TOLERANCE) return true;
  const slack = FRACTION_TOLERANCE - 1;
  return length > 1 && start <= slack && start + length >= 1 - slack;
}

/** Kesirler geçerli mi? (tür, sonluluk, aralık). Bilinmeyen/yanlış tür → false. */
export function isValidCrop(value: unknown): value is CropFractions {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const { x, y, width, height } = c;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return false;
  }
  if (![x, y, width, height].every(Number.isFinite)) return false;
  return isValidAxis(x, width) && isValidAxis(y, height);
}

/** Pencere kaynaktan büyük mü? (kullanıcı uzaklaştırdı: çıktıda boş alan kalır) */
export function isZoomedOut(crop: CropFractions): boolean {
  return crop.width > FRACTION_TOLERANCE || crop.height > FRACTION_TOLERANCE;
}

/** Uzaklaştırmada kırpılan kaynağın çıktı tuvalindeki yeri. Kalan alan saydam kalır. */
export interface CanvasPad {
  innerWidth: number;
  innerHeight: number;
  left: number;
  top: number;
}

export interface ZoomedOutPlacement {
  rect: PixelRect;
  pad: CanvasPad;
}

/** Tuval üzerinde çift tamsayı: yuva420p'de renk örneklemesi tek sayıda bir piksel kaydırır. */
function evenWithin(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, 2 * Math.round(value / 2)));
}

/**
 * Uzaklaştırılmış pencere → kaynaktan alınacak dikdörtgen + tuval yerleşimi. Pencere merkezi korunarak
 * tuval oranına genişletilir (kaynak hiçbir zaman ek olarak kırpılmaz). Tuval boyutu sunucu sabiti.
 */
export function placeZoomedOutCrop(
  crop: CropFractions,
  srcWidth: number,
  srcHeight: number,
  canvas: { width: number; height: number },
): ZoomedOutPlacement {
  if (
    !Number.isInteger(srcWidth) ||
    !Number.isInteger(srcHeight) ||
    srcWidth < 1 ||
    srcHeight < 1
  ) {
    throw new Error('kırpma girdisi geçersiz');
  }
  const aspect = canvas.width / canvas.height;
  let windowW = crop.width * srcWidth;
  let windowH = crop.height * srcHeight;
  const centerX = (crop.x + crop.width / 2) * srcWidth;
  const centerY = (crop.y + crop.height / 2) * srcHeight;
  if (windowW / windowH > aspect) windowH = windowW / aspect;
  else windowW = windowH * aspect;
  const windowX = centerX - windowW / 2;
  const windowY = centerY - windowH / 2;

  const left = Math.min(Math.max(Math.round(windowX), 0), srcWidth - 1);
  const top = Math.min(Math.max(Math.round(windowY), 0), srcHeight - 1);
  const right = Math.min(Math.max(Math.round(windowX + windowW), left + 1), srcWidth);
  const bottom = Math.min(Math.max(Math.round(windowY + windowH), top + 1), srcHeight);
  const rect = { left, top, width: right - left, height: bottom - top };

  const scale = canvas.width / windowW;
  const innerWidth = evenWithin(rect.width * scale, 2, canvas.width);
  const innerHeight = evenWithin(rect.height * scale, 2, canvas.height);
  return {
    rect,
    pad: {
      innerWidth,
      innerHeight,
      left: evenWithin((left - windowX) * scale, 0, canvas.width - innerWidth),
      top: evenWithin((top - windowY) * scale, 0, canvas.height - innerHeight),
    },
  };
}

/**
 * Kesirleri (yoksa tüm kareyi) kaynak pikseline çevirir ve hedef oranına (genişlik/yükseklik) oturtur.
 * Tüm kare + oran = "cover" merkez kırpması: crop verilmeyen eski istemcilerin davranışı.
 */
export function fitCropToAspect(
  crop: CropFractions | undefined,
  srcWidth: number,
  srcHeight: number,
  aspect: number,
): PixelRect {
  if (
    !Number.isInteger(srcWidth) ||
    !Number.isInteger(srcHeight) ||
    srcWidth < 1 ||
    srcHeight < 1 ||
    !(aspect > 0)
  ) {
    throw new Error('kırpma girdisi geçersiz');
  }
  const f = crop ?? { x: 0, y: 0, width: 1, height: 1 };

  // Kesir → piksel (kaynak sınırına kıstırılmış, ondalıklı)
  let w = Math.min(f.width * srcWidth, srcWidth);
  let h = Math.min(f.height * srcHeight, srcHeight);
  const cx = Math.min(Math.max(f.x * srcWidth + w / 2, 0), srcWidth);
  const cy = Math.min(Math.max(f.y * srcHeight + h / 2, 0), srcHeight);

  // Oran düzeltmesi: uzun kenarı kısalt, merkez (cx, cy) sabit
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;

  // Tamsayı + en az 1px; yuvarlama oranı en fazla 1px bozar (scale sonrası fark edilmez)
  let pw = Math.min(Math.max(Math.round(w), 1), srcWidth);
  let ph = Math.min(Math.max(Math.round(h), 1), srcHeight);
  // Yuvarlama sonrası kaynak sınırını aşmayacak şekilde oranı tekrar koru
  if (pw / ph > aspect) pw = Math.min(pw, Math.max(1, Math.round(ph * aspect)));
  else ph = Math.min(ph, Math.max(1, Math.round(pw / aspect)));

  const left = Math.min(Math.max(Math.round(cx - pw / 2), 0), srcWidth - pw);
  const top = Math.min(Math.max(Math.round(cy - ph / 2), 0), srcHeight - ph);
  return { left, top, width: pw, height: ph };
}
