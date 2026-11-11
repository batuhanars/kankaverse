/**
 * D94: bildirimde görünecek mesaj metnini seçen saf yardımcı (JS yolu; native yedek çizim aynı kuralı
 * önbellekten uygular). Ayar kapalıyken (`hidePreview`) çözülmüş ya da genel hiçbir metin sızmaz.
 * `decrypted`: çevrimdışı çözülen gerçek metin (çözülemedi / şifresiz ise null).
 */
export function notificationText(
  generic: string,
  decrypted: string | null,
  hidePreview: boolean,
  hiddenText: string,
): string {
  if (hidePreview) return hiddenText;
  return decrypted ?? generic;
}
