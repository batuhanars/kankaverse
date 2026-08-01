/**
 * Altıgen silüetin köşe noktaları — `design-tokens.md` §3'ün imza öğesi.
 *
 * Web'de bu bir CSS `clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`;
 * `react-native-svg`'de clip-path CSS'i olmadığı için aynı altı nokta viewBox'a taşınır.
 *
 * Neden ortak dosya: şekil artık üç yerde çiziliyor (ray ortam ikonu · ray "+" düğmesi · davetiye
 * kartı). Noktaları üçüncü kez kopyalamak, tasarım dilinin tek kaynağını üçe bölmek olurdu — bir
 * gün altıgenin oranı değişirse üç yerin biri geride kalır. Rule of Three tam burada doldu.
 *
 * **Kullanıcı avatarları DAİRE kalır** (`design-tokens.md`): bu yalnız ortam görselleri içindir.
 */
export function hexPoints(size: number): string {
  return [
    `${size * 0.5},0`,
    `${size},${size * 0.25}`,
    `${size},${size * 0.75}`,
    `${size * 0.5},${size}`,
    `0,${size * 0.75}`,
    `0,${size * 0.25}`,
  ].join(' ');
}
