const { withGradleProperties } = require('expo/config-plugins');

// withGradleMemory — release derlemesi için Gradle JVM belleğini yükseltir.
//
// 🔴 SORUN (2026-09-19, Sprint M5f release turu). `./gradlew assembleRelease` şununla düştü:
//
//     Execution failed for task ':livekit_react-native:lintVitalAnalyzeRelease'.
//     > A failure occurred while executing AndroidLintWorkAction
//        > Metaspace
//
// `lintVitalRelease` YALNIZ release derlemesinde koşuyor; bu yüzden debug derlemesi (aynı gün,
// aynı makine) sorunsuz geçmişti ve kusur ancak mağaza paketi alınırken ortaya çıktı. Expo
// şablonunun varsayılanı `-Xmx2048m -XX:MaxMetaspaceSize=512m`; LiveKit'in lint analizi bu
// metaspace'e sığmıyor.
//
// NEDEN `android/gradle.properties` ELLE DÜZENLENMİYOR: `mobile/.gitignore` `android/`i
// yoksayıyor, `expo prebuild` klasörü şablondan TAZE üretiyor. Oraya yazılan değer ilk
// prebuild'de sessizce uçar ve bir sonraki release turu aynı hatayı yeniden yer — üstelik
// "düzeltmiştik" sanıldığı için teşhis daha pahalıya gelir. Aynı ders `PLAN.md` D68'de
// (R8 anahtarı için) ve `withReleaseSigning` başlığında yazılı.
//
// NEDEN `~/.gradle/gradle.properties` DEĞİL: orası makineye bağlı. Gradle'da
// GRADLE_USER_HOME projeyi EZDİĞİ için çalışırdı, ama ayar depoda görünmez olurdu; EAS'ta ve
// yeni bir makinede aynı hata geri gelirdi. Ayar projenin kendisine ait.
//
// Lint'i KAPATMAK (`checkReleaseBuilds false`) bilerek tercih EDİLMEDİ: bellek yetmediği için
// bir denetimi susturmak, denetimin bulacağı gerçek kusurları da susturur. Sorun lint değil,
// ona verilen bellekti.
const JVM_ARGS_KEY = 'org.gradle.jvmargs';
const JVM_ARGS_VALUE = '-Xmx4096m -XX:MaxMetaspaceSize=1536m';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (config) => {
    const existing = config.modResults.find(
      (item) => item.type === 'property' && item.key === JVM_ARGS_KEY,
    );
    // Şablon bu anahtarı HER ZAMAN yazıyor (varsayılan değerle), yani normal yol üzerine yazmak.
    // Yoksa da ekleriz — şablon değişirse plugin sessizce etkisiz kalmasın.
    if (existing) {
      existing.value = JVM_ARGS_VALUE;
    } else {
      config.modResults.push({ type: 'property', key: JVM_ARGS_KEY, value: JVM_ARGS_VALUE });
    }
    return config;
  });
};
