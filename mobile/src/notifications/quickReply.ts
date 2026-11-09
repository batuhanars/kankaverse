import { t } from '@/i18n';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { messagesApi } from '@/api/messages';
import { appendOwnReplyToNotification } from '../../modules/conversation-notification';

/**
 * C52: bildirimden Cevapla. Kotlin `QuickReplyService` -> `KvQuickReply` headless gorevi (index.js).
 * Gonderme tek fonksiyonda (`sendReply`): E2EE geldiginde sifreleme buraya eklenir.
 */

type ReplyTaskData = {
  conversationId: string;
  text: string;
  type: string | null;
  guildId: string | null;
};

async function sendReply(conversationId: string, text: string): Promise<void> {
  // Uygulama kapaliyken bellekte erisim anahtari yok: mevcut tek-ucus yenileme kullanilir.
  if (!getAccessToken()) await refreshAccessToken();
  await messagesApi.send(conversationId, text);
}

export async function runQuickReply(data: ReplyTaskData): Promise<void> {
  const text = data.text?.trim();
  if (!data.conversationId || !text) return;
  const timestamp = Date.now();
  try {
    await sendReply(data.conversationId, text);
    await appendOwnReplyToNotification(data.conversationId, text, timestamp);
  } catch {
    try {
      await appendOwnReplyToNotification(
        data.conversationId,
        `${t('mobile.notifications.replyFailed')}: ${text}`,
        timestamp,
      );
    } catch {
      // Bildirim de guncellenemiyorsa yapilacak bir sey yok.
    }
  }
}
