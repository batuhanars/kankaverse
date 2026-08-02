/**
 * Sprint M2a §2 — rozet sayıları `>99` iken `"99+"` gösterir (web `ServerRail.vue` `badgeLabel()`
 * ile birebir aynı kural). Bu sprintte rail bahsetme rozeti, kanal listesi bahsetme rozeti ve
 * toplam ping rozeti (tab + iki sohbet ekranı geri oku) aynı ternary'i tekrarlıyordu — Rule of
 * Three, tek yardımcıya çıkarıldı.
 */
export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
