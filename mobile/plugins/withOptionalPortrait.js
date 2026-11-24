const { withAndroidManifest } = require('expo/config-plugins');

// withOptionalPortrait: D117 (Play uyarısı, sahip 2026-11-23, vc87).
//
// `app.json` `orientation: portrait` manifestte `screenOrientation="portrait"` üretiyor; Play bundan
// `android.hardware.screen.portrait` özelliğini ZORUNLU sayıyor ve her AAB yüklemesinde "1 sorun"
// gösteriyor (tablet/Chromebook gibi dikey ekranı olmayan cihazlar kurulamıyor). Telefonlar etkilenmez.
// Çözüm özelliği açıkça `required="false"` beyan etmek; uygulama yine dikey açılır.
//
// `android/` prebuild ile taze üretildiği için manifest elle düzenlenmez (bkz. withAnimatedWebp).
const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = (manifest['uses-feature'] = manifest['uses-feature'] ?? []);
    const existing = features.find((f) => f.$?.['android:name'] === FEATURE);
    if (existing) existing.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    return config;
  });
};
