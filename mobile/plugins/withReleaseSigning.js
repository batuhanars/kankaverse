const { withAppBuildGradle } = require('expo/config-plugins');

// withReleaseSigning — release AAB/APK'yi Play Store upload anahtarıyla imzalar.
//
// 🔴 SORUN. `android/` gitignore'lu, her `expo prebuild` şablondan TAZE üretiyor (bkz.
// withPictureInPicture'daki aynı not) — bu yüzden `android/app/build.gradle`'ı elle düzenlemek
// kalıcı değil, ilk prebuild'de uçar. Play ise upload anahtarıyla imzalanmamış bir bundle'ı kabul
// etmiyor (debug anahtarı = her makinede farklı, geri yüklenemez). Bu plugin `prebuild` sırasında
// çalışıp `signingConfigs.release`'i enjekte ediyor.
//
// NEDEN dosyanın SONUNA ekleniyor, `signingConfigs {}` closure'ının İÇİNE değil: `android { }`
// bloğu Gradle'da lazy değil — dosyanın geri kalanı çalıştığında `android` extension'ı zaten
// `buildTypes.release` dahil tamamen kurulu. Dosya sonuna `android.signingConfigs { release {} }`
// + `android.buildTypes.release.signingConfig = ...` eklemek, var olan `debug`/`release`
// closure'larının metnine dokunmadan (kırılgan satır eşleştirme yok) tek noktadan hedefli bir
// enjeksiyon sağlıyor — `debug` buildType'a hiç dokunulmuyor.
//
// PAROLALAR DEPODA YOK. Dört Gradle property'si (`KV_UPLOAD_STORE_FILE`, `KV_UPLOAD_STORE_PASSWORD`,
// `KV_UPLOAD_KEY_ALIAS`, `KV_UPLOAD_KEY_PASSWORD`) bu makinenin `~/.gradle/gradle.properties`
// dosyasından geliyor — Gradle proje + kullanıcı-home property'lerini birleştirip script içinde
// çıplak isimle erişilebilir kılıyor (RN'in resmi imzalama kılavuzuyla aynı desen).
//
// KOŞULLU ENJEKSİYON — kritik. Property'ler başka bir makinede (yeni bir dev, CI) YOK olabilir.
// O durumda derleme PATLAMAMALI: `project.hasProperty(...)` false ise bu blok hiç çalışmıyor ve
// release bugünkü gibi `signingConfigs.debug` ile imzalanmaya devam ediyor (varsayılan RN şablon
// davranışı, aşağıda dokunulmuyor).
const MARKER = '// [Kankaverse] withReleaseSigning — release imza yapılandırması';

const INJECTED_BLOCK = `
${MARKER}
// Property yoksa (bu makinede upload keystore kurulu değilse) blok atlanır, release debug
// anahtarıyla imzalanmaya devam eder — derleme asla eksik property yüzünden PATLAMAZ.
if (project.hasProperty('KV_UPLOAD_STORE_FILE')) {
    android.signingConfigs {
        release {
            storeFile file(KV_UPLOAD_STORE_FILE)
            storePassword KV_UPLOAD_STORE_PASSWORD
            keyAlias KV_UPLOAD_KEY_ALIAS
            keyPassword KV_UPLOAD_KEY_PASSWORD
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.release
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'withReleaseSigning yalnız Groovy build.gradle için yazıldı (proje Groovy şablonuyla prebuild ediyor); Kotlin DSL görüldü, plugin güncellenmeli.',
      );
    }
    if (config.modResults.contents.includes(MARKER)) {
      return config; // idempotent — prebuild iki kez çalışırsa ikinci kez eklemez
    }
    config.modResults.contents += INJECTED_BLOCK;
    return config;
  });
};
