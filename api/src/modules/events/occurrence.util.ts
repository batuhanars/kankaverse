/**
 * Occurrence hesabı — saf TS util (Sprint V3 Etkinlik Motoru §2).
 *
 * SIFIR job · SIFIR migration. Tekrarlama tamamen READ-TIME türetilir; DB'de
 * tek "seri çapası" satırı (startAt) durur, örnekler okurken hesaplanır.
 *
 * Tüm aritmetik UTC üzerinden (getTime / UTC alanları) → DST/yerel-saat kayması yok.
 */

export type EventRecurrenceValue = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type OccurrenceStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';

export interface OccurrenceInput {
  /** Seri çapası (ilk örnek başlangıcı). */
  startAt: Date;
  /** Tek örnek bitişi (süre kaynağı). null → noktasal (duration = 0). */
  endAt: Date | null;
  recurrence: EventRecurrenceValue;
}

export interface OccurrenceResult {
  occurrenceStartAt: Date;
  occurrenceEndAt: Date;
  status: OccurrenceStatus;
}

const MS_PER_DAY = 86_400_000;

/** UTC'de bir tarihe `months` takvim ayı ekler; hedef ay kısaysa ayın son gününe kıstırır. */
function addMonthsUtc(base: Date, months: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  // Hedef ayın gün sayısı (UTC, sonraki ayın 0. günü = bu ayın son günü)
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds(),
    ),
  );
}

/** k. örneğin başlangıcını döndürür (recurrence'a göre). */
function occStartForK(startAt: Date, recurrence: EventRecurrenceValue, k: number): Date {
  if (k === 0) return new Date(startAt.getTime());
  switch (recurrence) {
    case 'DAILY':
      return new Date(startAt.getTime() + k * MS_PER_DAY);
    case 'WEEKLY':
      return new Date(startAt.getTime() + k * 7 * MS_PER_DAY);
    case 'MONTHLY':
      return addMonthsUtc(startAt, k);
    case 'NONE':
    default:
      return new Date(startAt.getTime());
  }
}

/**
 * İlgili örneği + türetilmiş status'ü hesaplar.
 *
 * İlgili örnek = `occEnd(k) >= now` sağlayan en küçük k≥0 (şu an süren; yoksa
 * bir sonraki gelecek örnek). NONE → k=0 sabit.
 *
 * Status:
 *  - now < occStart            → SCHEDULED
 *  - occStart <= now <= occEnd → ACTIVE
 *  - NONE & now > occEnd       → COMPLETED (tek seferlik bitti)
 *  - tekrarlayan açık-uçlu     → COMPLETED OLMAZ (her zaman sonraki örnek var)
 *
 * Fail-safe: geçersiz/parse-edilemez tarih → occurrence = çapanın kendisi,
 * status MVP türetmesiyle (startAt > now ? SCHEDULED : COMPLETED).
 */
export function computeOccurrence(event: OccurrenceInput, now: Date): OccurrenceResult {
  const startMs = event.startAt instanceof Date ? event.startAt.getTime() : NaN;
  const nowMs = now instanceof Date ? now.getTime() : NaN;

  // Fail-safe: geçersiz çapa/now → çapanın kendisi, MVP status türetmesi
  if (Number.isNaN(startMs) || Number.isNaN(nowMs)) {
    const safeStart = new Date(startMs);
    const endMs = event.endAt ? event.endAt.getTime() : startMs;
    const safeEnd = Number.isNaN(endMs) ? safeStart : new Date(endMs);
    const status: OccurrenceStatus =
      !Number.isNaN(startMs) && !Number.isNaN(nowMs) && startMs > nowMs ? 'SCHEDULED' : 'COMPLETED';
    return { occurrenceStartAt: safeStart, occurrenceEndAt: safeEnd, status };
  }

  const endRaw = event.endAt ? event.endAt.getTime() : NaN;
  // Süre: endAt geçersiz/yok ya da çapadan önce → noktasal (0)
  const duration = !Number.isNaN(endRaw) && endRaw > startMs ? endRaw - startMs : 0;

  const recurrence: EventRecurrenceValue = event.recurrence ?? 'NONE';

  // NONE → tek örnek (k=0)
  if (recurrence === 'NONE') {
    const occStart = new Date(startMs);
    const occEnd = new Date(startMs + duration);
    const status: OccurrenceStatus =
      nowMs < occStart.getTime()
        ? 'SCHEDULED'
        : nowMs <= occEnd.getTime()
          ? 'ACTIVE'
          : 'COMPLETED';
    return { occurrenceStartAt: occStart, occurrenceEndAt: occEnd, status };
  }

  // Tekrarlayan: occEnd(k) >= now sağlayan en küçük k≥0
  const k = findRelevantK(event.startAt, recurrence, duration, nowMs);
  const occStart = occStartForK(event.startAt, recurrence, k);
  const occEnd = new Date(occStart.getTime() + duration);

  // Tekrarlayan açık-uçlu → COMPLETED olmaz (SCHEDULED / ACTIVE döngüsü)
  const status: OccurrenceStatus = nowMs < occStart.getTime() ? 'SCHEDULED' : 'ACTIVE';

  return { occurrenceStartAt: occStart, occurrenceEndAt: occEnd, status };
}

/**
 * occEnd(k) >= now koşulunu sağlayan en küçük k≥0'ı bulur.
 *
 * - DAILY/WEEKLY sabit aralık → doğrudan kapalı-form (taban hesabı + 1 düzeltme).
 * - MONTHLY düzensiz aralık → ay-ay ilerleyen güvenli iterasyon (üst sınırlı).
 */
function findRelevantK(
  startAt: Date,
  recurrence: EventRecurrenceValue,
  duration: number,
  nowMs: number,
): number {
  const startMs = startAt.getTime();

  if (recurrence === 'DAILY' || recurrence === 'WEEKLY') {
    const intervalMs = (recurrence === 'DAILY' ? 1 : 7) * MS_PER_DAY;
    // occEnd(k) = startMs + k*interval + duration >= now
    // k >= (now - duration - startMs) / interval
    const raw = (nowMs - duration - startMs) / intervalMs;
    let k = Math.max(0, Math.ceil(raw));
    // Yuvarlama kenarına karşı güvenlik düzeltmesi
    while (k > 0 && startMs + (k - 1) * intervalMs + duration >= nowMs) k--;
    while (startMs + k * intervalMs + duration < nowMs) k++;
    return k;
  }

  // MONTHLY: takvim ayı düzensiz → iterasyonla ilk occEnd(k) >= now
  // Üst sınır: makul bir tavan (geçmişe çok eski çapa için bile sonlu)
  const MAX_MONTHS = 12_000; // ~1000 yıl güvenlik tavanı
  let k = 0;
  while (k < MAX_MONTHS) {
    const occEnd = addMonthsUtc(startAt, k).getTime() + duration;
    if (occEnd >= nowMs) return k;
    k++;
  }
  return k;
}
