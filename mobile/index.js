// M4a-1 — uygulama giriş noktası. Tek işi: **expo-router'dan ÖNCE** LiveKit'in polyfill'lerini
// kurmak. Rota dosyaları `expo-router/entry` tarafından `require.context` ile TOPLUCA yükleniyor;
// yani `src/app/_layout.tsx`'in gövdesi çalışana kadar `src/stores/voice.ts` çoktan değerlendirilmiş
// oluyor (zincir: auth.ts → realtime/socket.ts → stores/voice.ts → livekit-client).
//
// 🔴 Bu neden önemli: `livekit-client` **modül seviyesinde** `class DeferrableMapAbortError extends
// DOMException` tanımlıyor. Hermes'te `DOMException` YOK; polyfill'i `@livekit/react-native`
// import edilince kuruluyor. `registerGlobals()` çağrısı `_layout.tsx`'te dururken sıra tutmuyordu
// ve uygulama açılışta kırmızı ekranla ölüyordu ("Property 'DOMException' doesn't exist").
// Emülatörde 2026-08-06'da üretildi; cihaza bağlı değil, JS motoru meselesi.
//
// `import` yerine `require` bilinçli: ESM import'ları hoist edilir, aralarına konan kod SONRA çalışır
// — yani `registerGlobals()`in expo-router'dan önce çalışacağı garanti edilemezdi. CommonJS sırası
// deterministik.
// E1 §5: guvenli rastgelelik (expo-crypto) EN ONCE. livekit'in `crypto.randomUUID` polyfill'i
// (Math.random) kripto icin kullanilmaz; o yalniz randomUUID ekler, getRandomValues'a dokunmaz.
require('./src/e2ee/bootRandom').bootSecureRandom();

require('@livekit/react-native').registerGlobals();

// C50: veri-yalniz mesaj push gorevi, headless baslangicta da yuklenmeli.
require('./src/notifications/conversationPush');

// C52: bildirimden Cevapla headless gorevi (kok duzeyde kayit sart).
const { AppRegistry } = require('react-native');
const { runQuickReply } = require('./src/notifications/quickReply');
AppRegistry.registerHeadlessTask('KvQuickReply', () => runQuickReply);

// C72: native arama bildirimindeki Reddet headless gorevi.
const { runCallAction } = require('./src/notifications/callAction');
AppRegistry.registerHeadlessTask('KvCallAction', () => runCallAction);

require('expo-router/entry');
