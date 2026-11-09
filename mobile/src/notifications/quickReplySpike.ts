import { AppState } from 'react-native';
import { t } from '@/i18n';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { messagesApi } from '@/api/messages';
import { appendOwnReplyToNotification } from '../../modules/conversation-notification';

/**
 * SPIKE quick-reply: bildirimden Cevapla -> Kotlin QuickReplyService -> `KvQuickReply` headless gorevi.
 * Uc soruyu cevaplamak icin her adim `[spike-reply]` ile loglanir (release'te de; __DEV__ arkasinda degil).
 */

type RuntimeGlobal = { __kvRuntimeId?: string };

/** Bu JS runtime'inin kimligi: UI ve headless AYNI runtime'daysa ayni deger yazilir. */
export function getRuntimeId(): string {
  const g = globalThis as RuntimeGlobal;
  g.__kvRuntimeId ??= Math.random().toString(36).slice(2, 8);
  return g.__kvRuntimeId;
}
getRuntimeId();

const log = (...args: unknown[]) => console.log('[spike-reply]', ...args);

type ReplyTaskData = {
  conversationId: string;
  text: string;
  type: string | null;
  guildId: string | null;
};

function statusOf(e: unknown): string {
  const status = (e as { response?: { status?: number } }).response?.status;
  return status !== undefined ? String(status) : `no-response (${String((e as Error)?.message ?? e)})`;
}

export async function runQuickReply(data: ReplyTaskData): Promise<void> {
  log('runtime', getRuntimeId(), 'access?', !!getAccessToken(), 'appState', AppState.currentState);
  log('data', data.conversationId, 'type', data.type, 'guild', data.guildId, 'textLen', data.text?.length);
  const timestamp = Date.now();
  try {
    if (!getAccessToken()) {
      log('no access token, refreshing');
      await refreshAccessToken();
      log('refresh ok, access?', !!getAccessToken());
    }
    const sent = await messagesApi.send(data.conversationId, data.text);
    log('send ok, status 2xx, messageId', sent.id);
    const appended = await appendOwnReplyToNotification(data.conversationId, data.text, timestamp);
    log('notification updated?', appended);
  } catch (e) {
    log('FAILED status', statusOf(e));
    try {
      await appendOwnReplyToNotification(
        data.conversationId,
        `${t('mobile.notifications.replyFailed')}: ${data.text}`,
        timestamp,
      );
    } catch (e2) {
      log('failure indicator failed', String(e2));
    }
  }
}
