const { withAndroidManifest, withMainActivity, AndroidConfig, CodeGenerator } = require('expo/config-plugins');

// M4p sözleşme §2 — PiP'in native köprüsü ("Kotlin modülü") yalnız `PictureInPictureModule`e sabit
// çağrı yüzeyi sağlıyor (`tryEnterPip`/`notifyModeChanged`); bir Expo modülü kendi başına app'in
// `MainActivity.kt`sini veya `AndroidManifest.xml`ini DEĞİŞTİREMEZ (manifest merger yalnız EKLER,
// var olan `.MainActivity` etiketinin ATTRIBUTE'larını değiştiremez; Activity yaşam döngüsü
// override'ları da hiç manifest merger'ın işi değil). Bu yüzden bu config plugin gerekiyor —
// `expo prebuild` sırasında çalışır, `app.json` `plugins`e eklenir.
//
// 🔴 `android/` gitignore'lu (bkz. `.gitignore` "generated native folders") — her `expo prebuild`
// şablondan TAZE üretiliyor, bu yüzden `CodeGenerator.mergeContents`in idempotency kontrolü asıl
// güvenlik ağı DEĞİL (şablon zaten enjeksiyonsuz geliyor); yine de aynı desen (`@generated begin/end`
// etiketleri) kullanıldı çünkü community config plugin'lerinin standart, kanıtlanmış yolu bu.

const CONFIG_CHANGES_PARTS = ['keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'uiMode'];

function withPictureInPictureManifest(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    // §2 — Android aktivitesi PiP'i BİLDİRİR (manifest attribute, izin DEĞİL — PiP izni MIUI gibi
    // OEM'lerde ayrı bir sistem ayarı, burada verilemez; §6 o yüzden native tarafta try/catch'e
    // dayanıyor). `smallestScreenSize` mevcut listeye EKLENDİ (diğerleri zaten vardı) — Android'in
    // resmi PiP kılavuzu bunu önerir: eksikse pencere PiP'e küçülürken Activity YENİDEN BAŞLAR
    // (`onCreate`), açık aramanın state'i (LiveKit `Room`, RN component ağacı) sıfırlanabilirdi.
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    const existing = (mainActivity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    const merged = Array.from(new Set([...existing, ...CONFIG_CHANGES_PARTS]));
    mainActivity.$['android:configChanges'] = merged.join('|');
    return config;
  });
}

function withPictureInPictureActivity(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error(
        'withPictureInPicture yalnız Kotlin MainActivity için yazıldı (proje Kotlin şablonuyla prebuild ediyor); .java template görüldü, plugin güncellenmeli.',
      );
    }
    let { contents } = config.modResults;

    contents = CodeGenerator.mergeContents({
      src: contents,
      newSrc: [
        'import android.content.res.Configuration',
        'import expo.modules.pictureinpicture.PictureInPictureModule',
      ].join('\n'),
      tag: 'picture-in-picture-import',
      anchor: /^package /,
      offset: 1,
      comment: '//',
    }).contents;

    // §2/§4 — `onUserLeaveHint` (kullanıcı uygulamadan çıkarken, ör. Home tuşu) PiP'e girmeyi
    // DENER (native taraf `callActive` bayrağıyla kapılıyor); `onPictureInPictureModeChanged`
    // JS'e ve modülün senkron `isInPip()` durumuna köprü. `/^}$/` — dosyadaki TEK sütun-0 (girintisiz)
    // kapanış parantezi sınıfın kendisi (tüm metot gövdeleri girintili); anchor bunu hedefliyor.
    contents = CodeGenerator.mergeContents({
      src: contents,
      newSrc: [
        '  override fun onUserLeaveHint() {',
        '    super.onUserLeaveHint()',
        '    PictureInPictureModule.tryEnterPip(this)',
        '  }',
        '',
        '  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {',
        '    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)',
        '    PictureInPictureModule.notifyModeChanged(isInPictureInPictureMode)',
        '  }',
      ].join('\n'),
      tag: 'picture-in-picture-activity',
      anchor: /^}$/,
      offset: 0,
      comment: '//',
    }).contents;

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withPictureInPicture(config) {
  config = withPictureInPictureManifest(config);
  config = withPictureInPictureActivity(config);
  return config;
};
