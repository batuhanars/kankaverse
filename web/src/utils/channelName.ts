/**
 * C21: kanal adı kuralı, istemci kopyası (sunucu `api/src/common/utils/channel-name.util.ts` otoritedir).
 * Discord deseni: boşluk -> '-', büyük harf -> küçük (Türkçe I->ı, İ->i), art arda tire teke iner.
 * ICU'ya bağlı olmamak için I/İ elle çevrilir.
 */

/** Yazarken uygulanır: baş/son tire KORUNUR (kullanıcı "oyun-" yazarken tire silinmesin). */
export function normalizeChannelNameLive(input: string): string {
  return (input ?? '')
    .normalize('NFC')
    .replace(/I/g, 'ı')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Kaydederken uygulanır: yazarken kuralı + baştaki/sondaki tire temizliği. */
export function normalizeChannelName(input: string): string {
  return normalizeChannelNameLive(input).replace(/^-|-$/g, '')
}
