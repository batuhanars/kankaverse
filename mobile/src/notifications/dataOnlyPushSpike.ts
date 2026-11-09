import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { showConversationNotification } from '../../modules/conversation-notification';

// SPIKE (spike/data-only-push): sunucu bu payload'i gondermez (v === 2 && kind === 'message').
// index.js'ten import edilir: headless baslangicta defineTask modul seviyesinde var olmali.

const TASK_NAME = 'KV-DATA-ONLY-MESSAGE-TASK';
// push.ts MESSAGE_CHANNEL_ID ile ayni (orada export edilmiyor; spike push.ts'e dokunmasin diye kopya).
const MESSAGE_CHANNEL_ID = 'messages_v6';

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

/** Android: data = { dataString: <FCM data.body>, ...duz FCM data anahtarlari }. Expo push servisi
 *  kullanici `data`sini JSON string olarak FCM `body` anahtarina koyar. Hepsini savunmaci dene. */
function extractPayload(raw: unknown): Record<string, unknown> | null {
  const top = asObject(raw);
  if (!top) return null;
  const data = asObject(top.data) ?? top;
  const candidates = [asObject(data.dataString), asObject(data.body), asObject(data.data), data];
  for (const c of candidates) {
    if (c && c.v === 2 && c.kind === 'message') return c;
  }
  return null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  console.log('[spike-push]', 'task fired', JSON.stringify(data), error ? String(error) : '');
  const p = extractPayload(data);
  if (!p) return;
  try {
    const conversationId = str(p.conversationId);
    if (!conversationId) return;
    await showConversationNotification({
      conversationId,
      conversationTitle: str(p.conversationTitle),
      isGroup: p.isGroup === true || p.isGroup === 'true',
      senderId: str(p.senderId) ?? conversationId,
      senderName: str(p.senderName) ?? '',
      senderAvatarUrl: str(p.senderAvatarUrl),
      conversationIconUrl: str(p.conversationIconUrl),
      text: str(p.text) ?? '',
      timestamp: Number(p.timestamp) || Date.now(),
      notificationChannelId: MESSAGE_CHANNEL_ID,
    });
    console.log('[spike-push]', 'shown', conversationId);
  } catch (e) {
    console.log('[spike-push]', 'show failed', String(e));
  }
});

Notifications.registerTaskAsync(TASK_NAME).catch((e: unknown) =>
  console.log('[spike-push]', 'register failed', String(e)),
);
