/**
 * C13b R7 — kırpma matematiği (SAF fonksiyonlar, I/O yok).
 *
 * İstemci kaynağın boyutuna oranla 0-1 kesirleri gönderir (§2.1). Sunucu bunları kaynak piksellerine
 * çevirir, dikdörtgeni hedef oranına MERKEZİ KORUYARAK küçültür ve kaynak sınırına kıstırır. İstemcinin
 * yuvarlama hatası reddedilmez, düzeltilir. Çıkan sayılar sonlu tamsayıdır: ffmpeg filtresine ve
 * sharp.extract'a doğrudan girebilir.
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
  return (
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= FRACTION_TOLERANCE &&
    y + height <= FRACTION_TOLERANCE
  );
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
