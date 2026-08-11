import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { notificationsApi } from '@/api/notifications';
import { resolvePushTarget } from '@/utils/pushNavigation';
import { isChannelRinging } from '@/notifications/incomingCall';
import { useGatedNotificationResponder } from '@/notifications/responseGate';
import { useDmStore } from '@/stores/dm';

/**
 * Sprint M3 §3 — mobil push istemci ayağı.
 *
 * Ön plan bildirimi bastırılır (contract §3 "uygulama ön plandayken push banner'ı gösterilmez —
 * kullanıcı zaten içeride, rozetler var"). `shouldShowList: true` bırakıldı: bildirim sistem
 * geçmişinde/merkezinde kalabilir, yalnız anlık drop-down/ses ASILMAZ. Modül yüklenir yüklenmez
 * BİR KEZ ayarlanır — React yaşam döngüsüne bağlı değil (Expo'nun kendi önerdiği kalıp).
 *
 * 🔴 M4a-2 istisnası (sözleşme §8.2) — `expo-notifications` global TEK bir handler kabul ediyor,
 * push ile gelen arama bildirimi aynı fonksiyondan geçiyor. Gelen arama bildirimi (`notifications/
 * incomingCall.ts`, `data.type === 'incoming_call'`) uygulama ön plandayken de ÜSTTE (heads-up)
 * görünmeli — sözleşme bunu açıkça istiyor ("Discord'un yaptığı gibi").
 *
 * 🔴 M4a-3 (sözleşme §9.2.1 + §9.2.5) — zil artık kanal sesi (bkz. `incomingCall.ts` CHANNEL_ID),
 * `shouldPlaySound: true` gelen arama için: hem WS'in yerel bildirimi hem foreground'da gelen push
 * bu yolu paylaşıyor, ikisi de kanalın gömülü sesini çalsın. `data.channelId` için ZATEN bir bildirim
 * çalıyorsa (`isChannelRinging`, `incomingCall.ts`) bu ikinci kopya TAMAMEN bastırılır (banner/liste/
 * ses hiçbiri çıkmaz) — sahip cihaz turunda (2026-08-07) görülen "iki 'Gelen Arama' kartı yan yana"
 * kusuru budur (WS yolu + push aynı anda, `api/` M4a-3 ile push ayağı bugün canlıya girdi).
 *
 * 🔴 REGRESYON DÜZELTMESİ (PM bulgusu, 2026-08-07 ikinci tur) — bastırma koşulu YALNIZ
 * `isChannelRinging` iken KENDİ ürettiğimiz bildirimi de bastırıyordu: `incomingCall.ts`
 * `presentIncomingCall`'da `current` state'i `scheduleNotificationAsync` çözüldükten hemen sonra
 * SENKRON yazılıyor, ama BU handler native köprüden bir SONRAKİ tick'te çağrılıyor — yani kendi
 * bildirimimiz değerlendirildiğinde `current` çoktan doluydu, `isChannelRinging(channelId)` `true`
 * dönüyordu ve WS'in TEK bildirimi de sessizce yutuluyordu (titreşim vardı çünkü o ayrı bir yoldan,
 * `Vibration.vibrate` ile geliyor — semptom birebir buydu: "titriyor ama bildirim yok"). `api/`nin
 * push payload'ı ve bu yerel bildirim AYNI `data.type`/`data.channelId` taşıdığı için ikisini ayırt
 * etmenin başka yolu yoktu. Çözüm: `incomingCall.ts` kendi ürettiği bildirime `data.source: 'ws'`
 * damgası basıyor, `api/` payload'ında bu alan YOK (ve eklenmeyecek). Bastırma artık YALNIZ
 * `source !== 'ws'` (yani "bu push, bizim yerel bildirimimiz değil") VE `isChannelRinging` ikisi
 * birden doğruyken tetikleniyor — kendi bildirimimiz zamanlamadan bağımsız her zaman geçer.
 *
 * 🔴 §2 (M5c, testçi geri bildirimi) — banner artık yalnız gelen aramada değil, mesaj
 * bildirimlerinde de (`MENTION`/`DM_MESSAGE`) düşer: sesli görüşmedeyken veya başka bir ekrandayken
 * gelen mesaj artık durum çubuğuna gizlice düşmüyor, kullanıcı elle çekmek zorunda kalmıyor.
 * İSTİSNA (sahip kararı 2026-08-10): kullanıcı O DM'in kendi ekranındaysa banner çıkmaz — okuduğu
 * mesaj için bildirim almak saçma. Sinyal `dm` store'daki `activeDmChannelId` (mevcut alan, yeni
 * altyapı YOK). Bu alan yalnız DM kanallarını kapsadığı için ortam kanalı mesajları (`MENTION` +
 * `guildId`) için istisna KENDİLİĞİNDEN uygulanmaz — `channelId` hiçbir zaman bir DM id'sine eşit
 * olmayacağından karşılaştırma hep `false` döner; kullanıcı o kanaldayken de banner çıkabilir. Bunu
 * daraltmak ayrı bir tasarım sorusu (bkz. contract §2 sınır koşulu), bu sprintin işi değil.
 * Ses hâlâ YALNIZ aramada çalar (`shouldPlaySound: isIncomingCall`) — görüşme ortasında sesli mesaj
 * bildirimi rahatsız edici olurdu, banner yeterli. `shouldSetBadge` değişmedi.
 *
 * 🔴 §1 (M5e, sahip geri bildirimi 2026-08-11) — yukarıdaki §2 notu yalnız `shouldShowBanner`ı
 * ele almıştı, `shouldShowList` HER ZAMAN `true` kalıyordu. Banner düşmese bile bildirim gölgeye
 * (sistem bildirim merkezi) giriyor ve kullanıcı o DM'in ekranındayken bile "gölgede bekleyen"
 * bildirim yığılmaya katkı veriyordu. Artık `isActiveDm` iken liste de kapalı — o DM ekranındayken
 * hiçbir şey gösterilmiyor (banner da liste de), tıpkı sesin zaten kapalı olması gibi. Gelen arama
 * dalına dokunulmadı.
 *
 * 🔴 §3 (M5e) — Android'de aynı sohbetin bildirimini SDK 54'te tekilleştirmenin native/desteklenen
 * yolu bir SUNUCU alanı: Expo Push API'nin Android'e özel `tag` alanı ("An identifier for replacing
 * notifications already displayed on the device", https://docs.expo.dev/push-notifications/sending-notifications/)
 * — bu, uygulama tamamen kapalıyken bile OS seviyesinde çalışır çünkü FCM bildirimi JS hiç
 * çalışmadan otomatik gösterir. `expo-notifications` istemci SDK'sı (v54 sürümlü doküman,
 * https://docs.expo.dev/versions/v54.0.0/sdk/notifications/) gelen bir push bildirimine BÖYLE bir
 * kalıcı etiket/grup ATAMA yolu SUNMUYOR — `NotificationContentInput`/`NotificationContent`'in
 * Android alanları yalnız `badge`/`color`/`priority`/`vibrate` (bkz. `Notifications.types.d.ts`),
 * `tag`/`group` yok. Bu `api/` değişikliği gerektirir → sözleşme §4 gereği BU SPRINTTE YAPILMADI,
 * PM'e raporlandı.
 *
 * İstemci SDK'sının sunduğu iki uç (`getPresentedNotificationsAsync` + `dismissNotificationAsync`)
 * JS çalışırken (ön planda veya arka planda, süreç canlıyken) tray'i elle yönetmeye izin veriyor —
 * bu yüzden burada YENİ bir mesaj bildirimi işlenirken AYNI kanalın eski bildirimleri elle
 * düşürülüyor (`dismissStaleChannelNotifications`, aşağıda). Bu, "öncekinin üstüne yazma" görsel
 * etkisini JS canlıyken taklit eder (eski düşer, yeni tek başına kalır) ama uygulama TAMAMEN
 * kapalıyken (süreç yok) çalışmaz — o durumda FCM bildirimi JS'e hiç uğramadan doğrudan gösterir,
 * yığılma boşluğu kapanmadan kalır (D62 ödünleşmesi gereği veri-yalnız push/native task bu sprintte
 * denenmedi).
 */
async function dismissStaleChannelNotifications(channelId: string, excludeIdentifier?: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      const data = n.request.content.data as Record<string, unknown> | undefined;
      const isMessage = data?.type === 'MENTION' || data?.type === 'DM_MESSAGE';
      if (isMessage && data?.channelId === channelId && n.request.identifier !== excludeIdentifier) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
  } catch {
    // sessiz — bildirim altyapısı ana akışı ASLA bloke etmez (dosyadaki genel ilke, bkz. syncPushToken)
  }
}

/**
 * §2 (M5e) — kullanıcı bir DM'i açtığında o kanala ait gölgede bekleyen mesaj bildirimlerini düşürür.
 * `dm/[id].tsx`'teki odak kancasından (`useFocusEffect`, M5d §1) çağrılır — yeni bir yaşam döngüsü
 * mekanizması KURULMADI, var olan tetikleyici kullanıldı. Yalnız `DM_MESSAGE`/`MENTION` tipini
 * hedefler; arama bildirimleri (`incoming_call`) ve başka kanalların bildirimleri dokunulmadan kalır.
 */
export async function clearChannelNotifications(channelId: string): Promise<void> {
  await dismissStaleChannelNotifications(channelId);
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const isIncomingCall = data?.type === 'incoming_call';
    if (isIncomingCall) {
      const channelId = typeof data?.channelId === 'string' ? data.channelId : null;
      const isOwnLocalNotification = data?.source === 'ws';
      if (channelId && !isOwnLocalNotification && isChannelRinging(channelId)) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
    }

    const isMessage = data?.type === 'MENTION' || data?.type === 'DM_MESSAGE';
    const messageChannelId = typeof data?.channelId === 'string' ? data.channelId : null;
    const isActiveDm =
      isMessage && messageChannelId !== null && messageChannelId === useDmStore.getState().activeDmChannelId;

    // §3 — yeni bildirim ekrana düşmeden ÖNCE aynı kanalın eski bildirimlerini tray'den düşür
    // (JS canlıyken çalışan kısmi yığılma önleme, yukarıdaki blok yorumuna bkz.).
    if (isMessage && messageChannelId) {
      await dismissStaleChannelNotifications(messageChannelId, notification.request.identifier);
    }

    return {
      shouldShowBanner: isIncomingCall || (isMessage && !isActiveDm),
      // §1 — o DM'in ekranındayken (isActiveDm) liste de kapalı: banner zaten düşmüyordu, artık
      // gölgeye de girmiyor. Diğer tüm dallarda (arama, aktif olmayan DM/mention) davranış AYNI.
      shouldShowList: isIncomingCall || !isActiveDm,
      // 🔴 M5e ek (sahip kararı 2026-08-11, CİHAZDA ÖLÇÜLEREK bulundu) — mesaj bildirimlerinde de
      // ses açık. Bu bir tercih değil, banner'ın ÖN KOŞULU: sessiz sunulan bildirimi Android
      // "sessiz" sınıfına koyuyor (`dumpsys`: `sound=null defaults=0x0 groupKey=silent`) ve
      // üstten İNDİRMİYOR — yalnız gölgeye giriyor. Kanal (`messages_v1`) önemi 4/HIGH ve renk
      // doğruydu; tek fark sesti. Arka planda bildirimi FCM kurduğu için kanalın kendi sesini
      // kullanıyor, o yüzden orada zaten iniyordu; tutarsızlığın kaynağı buydu.
      //
      // Önceki karar (yalnız aramada ses) "görüşme ortasında mesaj sesi rahatsız eder"
      // varsayımına dayanıyordu; ölçüm bunun bedelini gösterdi: sessiz = görünmez. Sahip kararı:
      // görünürlük ağır basıyor, rahatsız olan kullanıcı sohbeti kendi susturur.
      // `isActiveDm` dalında zaten hiçbir şey gösterilmiyor → orada ses de çalmaz.
      shouldPlaySound: isIncomingCall || (isMessage && !isActiveDm),
      shouldSetBadge: false,
    };
  },
});

// Son başarıyla alınan/kaydedilen token — çıkışta DELETE'e taşınır (§3: "Çıkışta DELETE çağrılır").
// Modül seviyesinde tutulur (auth store deseniyle aynı gerekçe: `stores/auth.ts` `bootstrapPromise`
// yorumuna bkz. — render'a bağlı olmaması gerekiyor, store state'i olmasına gerek yok).
let registeredToken: string | null = null;

async function readExpoPushToken(): Promise<string | null> {
  // Emülatörde/simülatörde push token alınamaz — contract §3 "sessizce geç, uygulama çalışsın".
  if (!Device.isDevice) return null;

  // İzin akışı: oturum açıldıktan sonra (çağıran taraf — `(app)/_layout.tsx` — bunu garanti eder),
  // açılışta DEĞİL. Zaten reddedilmişse (`canAskAgain === false`) yeniden SORULMAZ — contract'ın
  // "ısrarlı ikinci sorma yok" kuralı: OS'un kendi "bir daha sorma" bayrağına saygı duyulur.
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted' && current.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    // Android 8+'ta kanal olmadan bildirim sessizce (heads-up olmadan) düşebilir. Sistem
    // varsayılanı (§1 OUT — özel ses/titreşim YOK), tek bir "default" kanal yeterli.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    // 🔴 Sahip cihaz turu 2026-08-10 — mesaj bildirimleri geliyordu ama EKRANDA BELİRMİYORDU.
    // Sebep: sunucu mesaj push'ında kanal adı GÖNDERMİYORDU, FCM de kendi
    // `fcm_fallback_notification_channel` kanalını kullanıyordu (önem DEFAULT → heads-up yok,
    // sessizce bildirim gölgesine düşüyor). Cihazın `dumpsys notification` kaydında birebir
    // bu görüldü. Aramalar etkilenmemişti çünkü onlar `incoming_call_v4` (önem MAX) ile gidiyor.
    //
    // ⚠️ Yeni kanal kimliği ZORUNLU: Android'de bir kanalın önemi kurulduktan SONRA
    // değiştirilemez (bkz. `incomingCall.ts` aynı ders, `incoming_call_v4`e çıkma sebebi).
    // Var olan `default` kanalının importance'ını yükseltmek, onu çoktan oluşturmuş cihazlarda
    // HİÇBİR ŞEY yapmaz. Bu yüzden `default` olduğu gibi bırakılıyor, yenisi ayrıca açılıyor.
    await Notifications.setNotificationChannelAsync('messages_v1', {
      name: 'Mesajlar',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  // app.json'daki `extra.eas.projectId` — hardcode YOK (contract §3).
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || projectId.length === 0) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

/** Token al + sunucuya kaydet. Her adım sessiz hata yutar (§2.3 ilkesiyle aynı ruh: bildirim
 *  altyapısı ana akışı ASLA bloke etmez) — izin yoksa/ağ hatasıysa uygulama normal çalışmaya devam eder. */
export async function syncPushToken(): Promise<void> {
  try {
    const token = await readExpoPushToken();
    if (!token) return;
    registeredToken = token;
    await notificationsApi.registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceName: Device.deviceName ?? undefined,
    });
  } catch {
    // sessiz — bkz. yukarıdaki not
  }
}

/**
 * 🔴 Push kaydı yapıldı mı (sahip cihaz turu 2026-08-11). `syncPushToken` YALNIZ uygulama
 * açılışında çalışıyordu; açılışta bildirim izni yoksa token hiç alınmıyor ve kimse yeniden
 * denemiyordu. Kullanıcı sonradan sistem ayarlarından izin verince (ki bildirimler sekmesindeki
 * uyarı şeridi tam olarak oraya yönlendiriyor) şerit kayboluyor, kullanıcı düzeldi sanıyor ama
 * push ÖLÜ kalıyordu. Arama bildirimi çalışmaya devam ettiği için kusur daha da gizleniyordu:
 * o bildirim uygulama içinde üretiliyor, sunucu push'una hiç ihtiyaç duymuyor.
 */
export function isPushTokenRegistered(): boolean {
  return registeredToken !== null;
}

/** Çıkışta çağrılır (contract §3 "Çıkışta DELETE çağrılır — yoksa cihazı bırakan kullanıcının
 *  bildirimleri gelmeye devam eder"). Token hiç alınmadıysa no-op. */
export async function clearPushToken(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await notificationsApi.deletePushToken(token);
  } catch {
    // sessiz — `stores/auth.ts` logout() ile aynı desen: sunucu hatası yerel akışı durdurmaz
  }
}

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as Record<string, unknown>;
  const target = resolvePushTarget(data);
  // Hedef çözülemiyorsa yalnız uygulamayı aç (§3) — router.push ÇAĞRILMAZ, zaten açık olan
  // ekranda kalınır (kırık navigasyon vaat etme).
  if (target) router.push(target);
}

/**
 * Bildirime dokunma → yönlendirme. Kök layout'ta BİR KEZ mount edilir (oturumdan bağımsız —
 * dokunuş uygulama kapalıyken/arka plandayken de gelebilir). Soğuk açılış (`getLastNotificationResponse`)
 * DE kontrol edilir: DoD'daki "uygulama kapalıyken bahsedilince bildirim geliyor, dokununca doğru
 * kanala gidiyor" tam olarak bu senaryo.
 *
 * KUSUR 1/KUSUR 2 düzeltmesi (M3 sonrası, sahip bulgusu — cihazda dev build testi): navigasyon
 * container mount olmadan / auth bootstrap bitmeden gelen soğuk-açılış yanıtını bekletme deseni artık
 * `notifications/responseGate.ts`'te (`useGatedNotificationResponder`) — M4a-3 sözleşme §9.2.3 ile
 * `useIncomingCallResponder` (`incomingCall.ts`) AYNI problemi paylaştığı için oraya çıkarıldı.
 * Ayrıntılı iki kusurun tam anlatımı o dosyanın başındaki yorumda.
 */
export function usePushNotificationResponder(): void {
  useGatedNotificationResponder(handleNotificationResponse);
}
