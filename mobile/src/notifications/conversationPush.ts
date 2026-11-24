import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { t } from '@/i18n';
import { useDmStore } from '@/stores/dm';
import { getActiveChannelId } from '@/realtime/socket';
import {
  dismissConversationNotification,
  isPushHoldActive,
  pushHandled,
  showConversationNotification,
  updateNotificationMessageText,
} from '../../modules/conversation-notification';
import { MESSAGE_CHANNEL_ID } from './push';
import { accentColor, cacheNotificationDefaults } from './notificationDefaults';
import { notificationText } from './notificationText';
import { loadHidePreview } from './previewSetting';
import { loadOwnAvatarUrl } from './ownAvatar';
import { decryptOfflineForPush } from './offlineDecrypt';
import { parseE2eePayload, type PushE2ee } from './e2eePayload';

/**
 * C50 — veri-yalnız (v2) mesaj push'u. Sunucu v2 destekleyen cihaza `title`/`body` olmadan yalnız
 * `data` yollar; bu arka plan görevi veriyi alır, yerel Kotlin modülü `MessagingStyle` ile çizer.
 * Veri biçimi: contracts/SPRINT_C50_CONVERSATION_PUSH_CONTRACT.md §1.
 *
 * `index.js`ten import edilir: headless başlangıçta `defineTask` modül seviyesinde var olmalı.
 *
 * Görev, uygulama JS'i çalışıyorken (ön plan dahil) UI ile AYNI JS ortamında koşar: expo-task-manager
 * TaskService.executeTask, uygulamanın TaskManager'ı kayıtlıysa olayı onun olay yayıcısından teslim
 * eder; yeni ortam (headless yükleyici) yalnız uygulama JS'i hiç yokken açılır. Bu yüzden aşağıdaki
 * store okumaları ön planda gerçek durumu görür.
 */

const TASK_NAME = 'KV-DATA-ONLY-MESSAGE-TASK';
const MAX_TEXT = 200;

type MessageData = {
  type: string | null;
  conversationId: string;
  guildId: string | null;
  messageId: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  isGroup: boolean;
  conversationTitle: string | null;
  conversationIconUrl: string | null;
  text: string;
  timestamp: number;
  /** E3: şifreli DM yükü (yalnız sunucu bayrağı açık ve yük sığıyorsa). `text` genel metin kalır. */
  e2ee: PushE2ee | null;
};

type ReadData = { conversationIds: string[] };

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Android: nesne `data.dataString` altında JSON metni olarak gelir (yedek: `body`, düz `data`). */
function extractV2(raw: unknown): Record<string, unknown> | null {
  const top = asObject(raw);
  if (!top) return null;
  const data = asObject(top.data) ?? top;
  const candidates = [asObject(data.dataString), asObject(data.body), asObject(data.data), data];
  for (const c of candidates) {
    if (c && (c.v === 2 || c.v === '2')) return c;
  }
  return null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function parseMessage(p: Record<string, unknown>): MessageData | null {
  const conversationId = str(p.conversationId);
  if (!conversationId) return null;
  return {
    type: str(p.type),
    conversationId,
    guildId: str(p.guildId),
    messageId: str(p.messageId),
    senderId: str(p.senderId) ?? conversationId,
    senderName: str(p.senderName) ?? '',
    senderAvatarUrl: str(p.senderAvatarUrl),
    isGroup: p.isGroup === true || p.isGroup === 'true',
    conversationTitle: str(p.conversationTitle),
    conversationIconUrl: str(p.conversationIconUrl),
    text: (str(p.text) ?? '').slice(0, MAX_TEXT),
    timestamp: Number(p.timestamp) || Date.now(),
    e2ee: parseE2eePayload(p.e2ee),
  };
}

function parseRead(p: Record<string, unknown>): ReadData {
  const ids = Array.isArray(p.conversationIds) ? p.conversationIds : [];
  return { conversationIds: ids.filter((i): i is string => typeof i === 'string' && i.length > 0) };
}

/**
 * Simgesiz grup için baş harf: başlık "#kanal · Ortam" ise Ortam adı, değilse tüm başlık; baştaki
 * '#' atılır, ilk grafem büyük harfe (tr-TR) çevrilir. Çizimi Kotlin yapar, karar burada.
 */
function groupInitialOf(m: MessageData): string | null {
  if (!m.isGroup || m.conversationIconUrl || !m.conversationTitle) return null;
  const title = m.conversationTitle;
  const sep = ' · ';
  const idx = title.lastIndexOf(sep);
  const name = (idx >= 0 ? title.slice(idx + sep.length) : title).replace(/^#/, '').trim();
  const first = Array.from(name)[0];
  return first ? first.toLocaleUpperCase('tr-TR') : null;
}

/** Uygulama ön planda ve kullanıcı bu sohbeti okuyorsa bildirim gösterilmez. */
function isConversationInView(conversationId: string): boolean {
  if (AppState.currentState !== 'active') return false;
  return (
    conversationId === useDmStore.getState().activeDmChannelId || conversationId === getActiveChannelId()
  );
}

function logUndecodable(error: unknown, data: unknown): void {
  if (__DEV__) console.warn('[conversationPush] çözülemedi', error ? String(error) : '', JSON.stringify(data));
}

/**
 * C53: gelen arama modülü görev İÇİNDE yüklenir (D70: açılışta modül gövdesi sorunu; `index.js`
 * kök importlarına eklenmez). Dinamik require, modülü yalnız bir arama olayında değerlendirir.
 */
function incomingCallModule(): typeof import('./incomingCall') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./incomingCall') as typeof import('./incomingCall');
}

const CALL_DATA_TYPE = 'incoming_call';

type CallResponse = { actionIdentifier: string; channelId: string; isGroup: boolean };

/**
 * Bildirim düğmesi yanıtı (expo-notifications 0.32 `NotificationSerializer.toBundle(response)`):
 * `{ actionIdentifier, userText?, notification: { date, request: { identifier, trigger,
 * content: { title, body, categoryIdentifier, data? | dataString? } } } }`. Yerel (JS'ten
 * `scheduleNotificationAsync`) bildirimin `data`sı `content.dataString` altında JSON metni gelir.
 */
function parseCallResponse(raw: unknown): CallResponse | null {
  const top = asObject(raw);
  const actionIdentifier = top && str(top.actionIdentifier);
  if (!top || !actionIdentifier) return null;
  const content = asObject(asObject(asObject(top.notification)?.request)?.content);
  const payload = asObject(content?.data) ?? asObject(content?.dataString);
  if (!payload || payload.type !== CALL_DATA_TYPE) return null;
  const channelId = str(payload.channelId);
  if (!channelId) return null;
  return { actionIdentifier, channelId, isGroup: payload.callKind === 'group' };
}

async function handleCall(p: Record<string, unknown>): Promise<boolean> {
  const callChannelId = str(p.callChannelId);
  if (p.kind === 'call_end') {
    if (callChannelId) await incomingCallModule().dismissIncomingCall(callChannelId);
    return true;
  }
  if (p.kind !== 'call') return false;
  const callerId = str(p.callerId);
  if (!callChannelId || !callerId) return true;
  await incomingCallModule().presentIncomingCall(
    callChannelId,
    { id: callerId, username: str(p.callerName) ?? '', avatarUrl: str(p.callerAvatarUrl) },
    { kind: p.isGroup === true || p.isGroup === 'true' ? 'group' : 'dm' },
  );
  // C72: native arama bildirimi metinleri bir sonraki arama için önbellekte taze kalsın (çizimden SONRA, gecikme yok).
  await cacheNotificationDefaults(await loadHidePreview());
  return true;
}

/**
 * E3 Rev.2 §9.3: bildirim ZATEN genel metinle çıktı; şifreli yük varsa yerel depodan (ağsız) çözülür ve
 * görünen bildirimdeki o mesajın metni sessizce değiştirilir. `hidden`/`unavailable`/hata: hiçbir şey
 * (bildirim genel metinle kalır). İçerik loglanmaz, hata türü bile.
 */
/** Ağsız çözme (E3 §9): yalnız yerel depo; hata/sonuçsuz → null. Bildirim çizimini BEKLEMEZ (paralel). */
async function decryptForUpgrade(m: MessageData): Promise<string | null> {
  if (!m.e2ee || !m.messageId) return null;
  try {
    const r = await decryptOfflineForPush(m.messageId, m.conversationId, m.e2ee);
    // C68: boş gövde (yalnız ek) = sunucunun yedek metni kalır, bildirim metni değiştirilmez.
    return r.kind === 'text' && r.body.trim() ? r.body.slice(0, MAX_TEXT) : null;
  } catch {
    return null; // sessiz: bildirim genel metinle görünür
  }
}

/**
 * E3 Rev.2 §9.3: bildirim genel metinle çizilir; şifreli yük varsa çözme AYNI ANDA başlar (çizim avatar
 * indirirken MIUI dondurma penceresi kapanabiliyor, cihaz turu 13:08). Çizim bitince çözüldüyse metin
 * sessizce değiştirilir. İçerik loglanmaz.
 */
async function presentWithUpgrade(
  m: MessageData,
  show: () => Promise<unknown>,
  hidePreview: boolean,
): Promise<void> {
  const t0 = Date.now();
  const plain = decryptForUpgrade(m);
  await show();
  const shownMs = Date.now() - t0;
  const text = await plain;
  if (__DEV__ || m.e2ee) console.log(`[E2EE] push-show ${shownMs}ms toplam ${Date.now() - t0}ms`);
  // D94: çözme (depoya yazım) yine yapılır; içerik gizliyken bildirim metni DEĞİŞTİRİLMEZ.
  if (hidePreview || text === null || !m.messageId) return;
  await updateNotificationMessageText(m.conversationId, m.messageId, text).catch(() => false);
}

/** Çizim parametreleri (genel metin: `text`); etiketler/renk/"ben" adı native yedek çizimle aynı kaynaktan. */
function showParams(m: MessageData, meAvatarUrl: string | null, text: string = m.text) {
  return {
    ...m,
    text,
    groupInitial: groupInitialOf(m),
    notificationChannelId: MESSAGE_CHANNEL_ID,
    meName: t('mobile.notifications.me'),
    meAvatarUrl,
    replyLabel: t('mobile.notifications.reply'),
    markReadLabel: t('mobile.notifications.markRead'),
    muteLabel: t('mobile.notifications.mute'),
    color: accentColor(),
  };
}

/**
 * E3 Rev.4 §11.2: tutulan pencerede ÖNCE ağsız/zamanlayıcısız çözülür, sonra BİR kez çizilir: çözüldüyse gerçek
 * metin, değilse genel metin; iptal edilmiş cihazdan (`hidden`) çizilmez. İçerik loglanmaz.
 */
async function presentOnce(m: MessageData, meAvatarUrl: string | null, hidePreview: boolean): Promise<void> {
  const t0 = Date.now();
  let decrypted: string | null = null;
  if (m.e2ee && m.messageId) {
    try {
      const r = await decryptOfflineForPush(m.messageId, m.conversationId, m.e2ee);
      if (r.kind === 'hidden') {
        console.log(`[E2EE] push-once ${Date.now() - t0}ms gizli`);
        return;
      }
      if (r.kind === 'text' && r.body.trim()) decrypted = r.body.slice(0, MAX_TEXT);
    } catch {
      // sessiz: genel metinle çizilir
    }
  }
  const text = notificationText(m.text, decrypted, hidePreview, t('mobile.notifications.hiddenPreview'));
  const decryptMs = Date.now() - t0;
  await showConversationNotification(showParams({ ...m, e2ee: null }, meAvatarUrl, text));
  console.log(`[E2EE] push-once çözme ${decryptMs}ms toplam ${Date.now() - t0}ms`);
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  try {
    const response = parseCallResponse(data);
    if (response) {
      // Düğme yanıtı yalnız uygulama ön planda değilken görevi çalıştırır. `accept` uygulamayı açar,
      // bekleyen yanıtı `useIncomingCallResponder` işler; burada yapılacak bir şey yok.
      if (response.actionIdentifier === 'reject') {
        incomingCallModule().rejectIncomingCall(response.channelId, response.isGroup);
      }
      return;
    }
    const p = extractV2(data);
    if (!p) {
      // v1 biçimi zaten expo/Firebase yolundan gösteriliyor; yalnız teşhis için.
      if (error) logUndecodable(error, data);
      return;
    }
    if (p.kind === 'read') {
      await Promise.all(parseRead(p).conversationIds.map((id) => dismissConversationNotification(id)));
      return;
    }
    if (await handleCall(p)) return;
    if (p.kind !== 'message') return;
    const m = parseMessage(p);
    if (!m) {
      logUndecodable(null, data);
      return;
    }
    // E3 Rev.4: native FCM servisi şifreli push'ta pencereyi tutuyorsa tek çizim yolu; "bitti" sinyali HER çıkışta.
    const holding = m.e2ee !== null && m.messageId !== null && isPushHoldActive();
    try {
      const hidePreview = await loadHidePreview();
      await cacheNotificationDefaults(hidePreview);
      if (isConversationInView(m.conversationId)) return;
      const meAvatarUrl = m.isGroup ? await loadOwnAvatarUrl() : null;
      if (holding) {
        await presentOnce(m, meAvatarUrl, hidePreview);
      } else {
        // Rev.3 (eski native / şifresiz): genel metinle çizilir (şifreli yük Kotlin'e geçmez); çözme paralel koşar.
        const text = notificationText(m.text, null, hidePreview, t('mobile.notifications.hiddenPreview'));
        await presentWithUpgrade(
          m,
          () => showConversationNotification(showParams({ ...m, e2ee: null }, meAvatarUrl, text)),
          hidePreview,
        );
      }
    } finally {
      if (holding && m.messageId) await pushHandled(m.messageId).catch(() => undefined);
    }
  } catch (e) {
    logUndecodable(e, data);
  }
});

Notifications.registerTaskAsync(TASK_NAME).catch((e: unknown) => {
  if (__DEV__) console.warn('[conversationPush] görev kaydı başarısız', String(e));
});
