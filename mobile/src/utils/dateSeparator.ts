/**
 * Sprint C11 — mesaj listesinde tarih ayracı (Bugün · Dün · 25 Ekim 2026).
 *
 * Web'deki `web/src/utils/dateSeparator.ts` ile AYNI kuralları uygular; kod paylaşılamıyor
 * (Metro proje kökü dışını çözemiyor — i18n'deki aynı sınır), davranış paylaşılıyor:
 *
 * 1. Gün karşılaştırması **yerel yıl-ay-gün** üzerinden yapılır, saat farkı üzerinden DEĞİL.
 *    `diff < 24h` yanlış olurdu: 23.50'de atılan mesaj 00.10'da hâlâ "bugün" sayılırdı.
 * 2. "Bugün"/"Dün" metni **render anında** hesaplanır, mesaja iliştirilip saklanmaz. Gece
 *    yarısı geçince kayması için `useTodayStart()` bileşeni yeniden çizer: tek bir dakikalık
 *    zamanlayıcı gün DEĞİŞTİĞİNDE haber verir (her dakika render yok). Zamanlayıcı ilk abone
 *    ile başlar, son abone gidince durur — sohbet ekranı kapalıyken çalışmaz.
 */
import { useSyncExternalStore } from 'react';
import { t } from '@/i18n';

/** Verilen anın yerel gününün başlangıcı (00.00) — gün kimliği bu damgadır. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Bu mesaj yeni bir güne mi ait? (ayraç bu soruya "evet" dendiğinde girer)
 * `prevIso` yoksa (listenin en üstü) → evet, o gün orada başlıyor.
 */
export function isNewDay(iso: string, prevIso?: string | null): boolean {
  if (!prevIso) return true;
  return startOfLocalDay(new Date(iso)) !== startOfLocalDay(new Date(prevIso));
}

let currentDay = startOfLocalDay(new Date());
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (!timer) {
    timer = setInterval(() => {
      const day = startOfLocalDay(new Date());
      if (day === currentDay) return;
      currentDay = day;
      listeners.forEach((listener) => listener());
    }, 60_000);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return currentDay;
}

/** Bugünün gün damgası — gece yarısı geçince değişir ve okuyan bileşen yeniden çizilir. */
export function useTodayStart(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Ayraç metni. `todayStart` dışarıdan gelir ki metin gün değişiminde tazelensin. */
export function dayDividerLabel(iso: string, todayStart: number): string {
  const d = new Date(iso);
  const day = startOfLocalDay(d);
  if (day === todayStart) return t('message.dateDivider.today');
  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === startOfLocalDay(yesterday)) return t('message.dateDivider.yesterday');
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}
