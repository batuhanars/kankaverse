import { useEffect } from 'react';
import { Alert, Linking, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useVoiceStore } from '@/stores/voice';
import { callAccept, callReject } from '@/realtime/socket';
import { dmTarget } from '@/utils/pushNavigation';
import { t } from '@/i18n';

/**
 * M4a-2 sözleşme §8 — mobilde **gelen** arama, uygulama açıkken. Sunum TAM EKRAN DEĞİL, bildirim
 * (§8.1, sahip görselleri `design-refs/m4-ses/13-14`): "Gelen Arama" / "<ad> seni arıyor!" + Reddet ·
 * Aramaya Katıl. `voice.incoming_call` yalnız WS'ten gelir (`realtime/socket.ts`) — bu sprintte push
 * YOK (M4a-3), yani bu akış zaten yalnız uygulama ÖN PLANDAYKEN çalışır (`useBackgroundSocket.ts`
 * arka plana düşünce soketi kapatıyor, WS event'i arka planda hiç gelmiyor — §8'in "açıkken" sınırı
 * bu yüzden koda hiç yazılmak ZORUNDA kalmadı, doğal sonuç).
 *
 * §8.3 🔴 — zil `expo-audio` ile DÖNGÜDE çalınır, bildirim kanalının sesiyle DEĞİL (kanal tek atış
 * çalar). Kanal burada `sound: null` ile sessiz kurulur; döngü + titreşim tamamen bu modülün elinde,
 * dört bitiş yolunun (kabul · reddet · zaman aşımı · arayan iptal) HEPSİ `dismiss()`e çıkar — M4a-1
 * dersi #1 ("kapanış yollarını tek noktadan yönet") burada da uygulanıyor.
 *
 * ⚠️ Bilinen sınır (rapor edildi, PM/sahip kararı bekliyor): Android'in "cihaz sessiz/rahatsız
 * etmeyin kipinde ÇALMASIN" davranışı normalde sistemin kendi ringtone/notification akışını
 * kullanınca otomatik gelir (ringer modunu okur). `expo-audio`/`expo-notifications` (kurulu paket
 * seti) ringer modunu SORGULAYAN bir API sunmuyor — bunu native koda inmeden yapmanın bilinen bir
 * yolu yok. Bu yüzden zil BURADA koşulsuz çalınıyor (media stream, ringer'dan bağımsız); yalnız
 * TİTREŞİM garanti (`Vibration.vibrate` ringer modundan bağımsız çalışır, RN çekirdek API'si — bu
 * kısım tam istenen gibi). Yeni native modül bu sprintte YASAK olduğu için düzeltme burada durduruldu.
 */

const VIBRATE_PATTERN = [0, 400, 200, 400, 2000]; // web ringCycle ile aynı ritim (0.4s+0.2s+0.4s+2s=3s)
const RING_TIMEOUT_MS = 30_000; // §8.2 — 30 sn cevapsız

// 🔴 Kanal kimliği SÜRÜMLÜ. Android bildirim kanalı bir kez kurulduktan sonra ayarları
// (ses/titreşim/önem) **değiştirilemez**; `setNotificationChannelAsync` aynı kimlikle çağrılınca
// sessizce hiçbir şey yapmaz. Ayar değişince kimlik de artırılır, yoksa telefonunda eski kanal
// duran herkes eski davranışı yaşar. (v1: sessiz + titreşimsiz → heads-up çıkmıyordu, bkz. aşağısı.)
const CHANNEL_ID = 'incoming_call_v2';
const CATEGORY_ID = 'incoming_call';
const NOTIFICATION_DATA_TYPE = 'incoming_call';

let setupDone = false;
let ringPlayer: AudioPlayer | null = null;

interface RingingCall {
  channelId: string;
  notificationId: string;
  timeoutTimer: ReturnType<typeof setTimeout>;
}

let current: RingingCall | null = null;

async function ensureSetup(): Promise<void> {
  if (setupDone) return;
  setupDone = true;
  // §8.2 — ayrı ve YÜKSEK önemli kanal; M4a-1'in "Sesli arama sürüyor" bildirimi (native
  // `call-foreground-service` modülü, kendi kanalını Kotlin tarafında kurar) düşük önemli — ikisi
  // karışmaz, burası tamamen ayrı bir kanal kimliği.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t('mobile.call.incomingNotifChannel'),
    importance: Notifications.AndroidImportance.MAX,
    sound: null, // §8.3 — kanal sesi YOK; zil `expo-audio` ile döngüde (kanal sesi tek atış)
    // 🔴 Titreşim kanalda AÇIK ama deseni neredeyse yok (1 ms). Gerçek titreşimi biz yönetiyoruz
    // (`Vibration.vibrate` döngüde, §8.3). Buradaki tek amaç kanalın "sessiz kanal" sayılmaması:
    // sesi ve titreşimi kapalı bir kanal, önemi HIGH olsa bile birçok cihazda (özellikle MIUI)
    // **heads-up olarak ekranın üstünde belirmez**, doğrudan bildirim gölgesine düşer. Sahip tam
    // bunu bildirdi (2026-08-06): "sadece üstteki bildirim yerinde görünüyor, ekranda belirmiyor".
    enableVibrate: true,
    vibrationPattern: [0, 1],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: 'reject', buttonTitle: t('call.reject'), options: { opensAppToForeground: false } },
    { identifier: 'accept', buttonTitle: t('mobile.call.joinAction'), options: { opensAppToForeground: true } },
  ]);
}

function startRing() {
  if (!ringPlayer) {
    ringPlayer = createAudioPlayer(require('../../assets/sounds/incoming-call.wav'));
    ringPlayer.loop = true;
  }
  try {
    ringPlayer.seekTo(0);
  } catch {
    // yoksay — yeniden başta çalmak kozmetik, oynatmayı engellemez
  }
  ringPlayer.play();
  Vibration.vibrate(VIBRATE_PATTERN, true);
}

function stopRing() {
  ringPlayer?.pause();
  Vibration.cancel();
}

/**
 * `voice.incoming_call` (WS) alınınca çağrılır (`realtime/socket.ts`). Aynı kanal için ikinci bir
 * bildirim/zil AÇILMAZ (M4a-1'in "yeniden giriş" dersi #2 — burada "aynı çağrı için iki bildirim"
 * sınıfı kusur olurdu). Farklı bir kanaldan eş zamanlı ikinci bir arama gelirse öncekinin yerini alır.
 */
export async function presentIncomingCall(
  channelId: string,
  caller: { id: string; username: string; avatarUrl: string | null },
): Promise<void> {
  if (current?.channelId === channelId) return; // aynı çağrı — yinelenen event, no-op
  if (current) await dismissIncomingCall(current.channelId);

  await ensureSetup();

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: t('mobile.call.incomingTitle'),
      body: t('mobile.call.incomingBody', { name: caller.username }),
      data: { type: NOTIFICATION_DATA_TYPE, channelId, callerId: caller.id, callerName: caller.username },
      categoryIdentifier: CATEGORY_ID,
      sound: false, // §8.3 — bildirimin KENDİ sesi de yok, zil expo-audio'dan
      // Heads-up için kanal önemi tek başına yetmiyor; bildirimin kendi önceliği de en üstte olmalı.
      priority: Notifications.AndroidNotificationPriority.MAX,
      // Gövdeye dokunma yalnız DM'e götürür (§8.2) — bildirim otomatik SİLİNMEZ, kullanıcı hâlâ
      // Reddet/Aramaya Katıl'a basabilmeli (kabul/reddet/zaman aşımı/iptal `dismissIncomingCall`
      // ile elle kaldırıyor — tek kapanış noktası, dosya başı yorumu).
      autoDismiss: false,
    },
    trigger: null,
  });

  const timeoutTimer = setTimeout(() => {
    void dismissIncomingCall(channelId); // §8.2 — 30 sn cevapsız, YALNIZ yerel temizlik (WS'e bir şey gönderilmez)
  }, RING_TIMEOUT_MS);

  current = { channelId, notificationId, timeoutTimer };
  startRing();
}

/** Dört bitiş yolunun (kabul · reddet · zaman aşımı · arayan iptal) ORTAK çıkışı. */
export async function dismissIncomingCall(channelId: string): Promise<void> {
  if (current?.channelId !== channelId) return;
  clearTimeout(current.timeoutTimer);
  const { notificationId } = current;
  current = null;
  stopRing();
  try {
    await Notifications.dismissNotificationAsync(notificationId);
  } catch {
    // yoksay — bildirim zaten kullanıcı tarafından temizlenmiş olabilir
  }
}

/**
 * Kök layout'ta BİR KEZ mount edilir (`_layout.tsx`, `usePushNotificationResponder` ile aynı yer).
 * Reddet/Aramaya Katıl eylemleri ve gövde dokunuşu burada çözülür; push yanıt dinleyicisiyle
 * (`notifications/push.ts`) AYNI native event akışını paylaşır ama `data.type` süzgeciyle ayrışır —
 * ikisi de aynı response'u alır, kendi ilgilenmediğini sessizce atlar (çakışma yok).
 */
export function useIncomingCallResponder(): void {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type !== NOTIFICATION_DATA_TYPE) return;
      const channelId = typeof data.channelId === 'string' ? data.channelId : null;
      if (!channelId) return;
      const callerName = typeof data.callerName === 'string' ? data.callerName : '';

      if (response.actionIdentifier === 'reject') {
        void dismissIncomingCall(channelId);
        callReject(channelId);
        return;
      }

      if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // §8.2 — gövdeye dokunma yalnız DM'e götürür; arama ekranı AÇILMAZ, zil de durmaz
        // (kullanıcı henüz kabul/reddetmedi).
        router.push(dmTarget(channelId));
        return;
      }

      if (response.actionIdentifier === 'accept') {
        void dismissIncomingCall(channelId);
        callAccept(channelId);
        // §0.1/§8.2 — davet KESİNLİKLE gönderilmez (`invite: false`): arayan zaten odada, biz
        // yalnız katılıyoruz. Presence store'a hiç bakılmıyor (dev'in DM ekranında olmadığı senaryo).
        void useVoiceStore
          .getState()
          .startOrJoin(channelId, callerName, { invite: false })
          .then((res) => {
            if (res.ok) {
              router.push({ pathname: '/call', params: { channelId } });
              return;
            }
            if (res.reason === 'mic_denied') {
              Alert.alert(res.message ?? t('common.error'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('mobile.call.micPermissionSettings'), onPress: () => Linking.openSettings() },
              ]);
              return;
            }
            if (res.message) Alert.alert(res.message);
          });
      }
    });

    return () => sub.remove();
  }, []);
}
