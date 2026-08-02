/**
 * Kök CLAUDE.md TR tarih/saat formatı: "25 Ekim 2023 18.42".
 *
 * Sprint M2c — üçüncü kullanım yerinde (`pins.tsx`/`SearchResultGroup.tsx`'te zaten aynı fonksiyon
 * yerel olarak vardı, kanal detay Bağlantılar sekmesi üçüncüsü oldu — Rule of Three doldu) tek
 * kaynağa çıkarıldı. `pins.tsx` bu dosyadan okuyacak şekilde taşındı; `SearchResultGroup.tsx`
 * kapsam dışı bırakıldı (çalışan, sözleşme dışı bir dosyaya dokunmamak için).
 */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  );
}
