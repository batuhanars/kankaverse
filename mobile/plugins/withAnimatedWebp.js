const { withGradleProperties } = require('expo/config-plugins');

// withAnimatedWebp: Android'de hareketli WebP gosterimini acar (Sprint C13 §6.1).
//
// Expo sablonunun `android/gradle.properties` dosyasinda `expo.webp.animated` anahtari varsayilan
// olarak `false`: Fresco hareketli WebP kod cozucusu pakete girmiyor ve hareketli avatar/afis
// tek kare (ilk kare) gorunuyor. `true` olunca RN `Image` hareketli WebP'yi oynatir.
//
// NEDEN `android/gradle.properties` ELLE DUZENLENMIYOR: `android/` gitignore'lu ve `expo prebuild`
// sablondan taze uretiyor; elle yazilan deger sessizce ucar (bkz. withGradleMemory ayni ders).
// Bedel: kod cozucu APK'ya girer, boyut kucuk bir miktar artar.
const KEY = 'expo.webp.animated';

module.exports = function withAnimatedWebp(config) {
  return withGradleProperties(config, (config) => {
    const existing = config.modResults.find((item) => item.type === 'property' && item.key === KEY);
    if (existing) {
      existing.value = 'true';
    } else {
      config.modResults.push({ type: 'property', key: KEY, value: 'true' });
    }
    return config;
  });
};
