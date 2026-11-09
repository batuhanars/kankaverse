import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import appConfig from '../../app.json';
import { t } from '@/i18n';
import { useDmStore } from '@/stores/dm';
import { getActiveChannelId } from '@/realtime/socket';
import {
  dismissConversationNotification,
  showConversationNotification,
} from '../../modules/conversation-notification';
import { MESSAGE_CHANNEL_ID } from './push';

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

/** Vurgu rengi tek kaynak: app.json `expo-notifications` eklenti ayarı. */
function accentColor(): string | null {
  for (const plugin of appConfig.expo.plugins as unknown[]) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
      const color = (plugin[1] as { color?: unknown } | undefined)?.color;
      return typeof color === 'string' ? color : null;
    }
  }
  return null;
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

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  try {
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
    if (p.kind !== 'message') return;
    const m = parseMessage(p);
    if (!m) {
      logUndecodable(null, data);
      return;
    }
    if (isConversationInView(m.conversationId)) return;
    await showConversationNotification({
      ...m,
      groupInitial: groupInitialOf(m),
      notificationChannelId: MESSAGE_CHANNEL_ID,
      meName: t('mobile.notifications.me'),
      color: accentColor(),
    });
  } catch (e) {
    logUndecodable(e, data);
  }
});

Notifications.registerTaskAsync(TASK_NAME).catch((e: unknown) => {
  if (__DEV__) console.warn('[conversationPush] görev kaydı başarısız', String(e));
});
