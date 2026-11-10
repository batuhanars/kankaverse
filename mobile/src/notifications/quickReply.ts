import { t } from '@/i18n';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { authApi } from '@/api/auth';
import { initE2ee, sendMessage } from '@/stores/e2ee';
import { useAuthStore } from '@/stores/auth';
import { dmApi } from '@/api/dm';
import { channelsApi } from '@/api/channels';
import { NotifTargetType } from '@/api/notifications';
import { useDmStore } from '@/stores/dm';
import { useUnreadStore } from '@/stores/unread';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NOTIFICATION_QUICK_MUTE_MINUTES } from '@/utils/notifPrefUi';
import { appendOwnReplyToNotification } from '../../modules/conversation-notification';
import { loadOwnAvatarUrl } from './ownAvatar';

/**
 * C52: bildirimden Cevapla. C55: Okundu olarak isaretle + Sessize al ayni headless gorevden gecer,
 * dallanma burada (`action`). Kotlin `QuickReplyService` -> `KvQuickReply` headless gorevi (index.js).
 * Gonderme tek fonksiyonda (`sendReply`): sifreli 1-1 DM'de E2EE ile gider (E1).
 */

type ReplyTaskData = {
  /** C55: eski bildirimlerde yok, yoklukta 'reply'. */
  action?: 'reply' | 'markRead' | 'mute' | null;
  conversationId: string;
  text?: string | null;
  type: string | null;
  guildId: string | null;
};

async function sendReply(conversationId: string, text: string): Promise<void> {
  // Uygulama kapaliyken bellekte erisim anahtari yok: mevcut tek-ucus yenileme kullanilir.
  if (!getAccessToken()) await refreshAccessToken();
  // E1: şifreli 1-1 DM'de düz metin sunucuda 409 verir. Hızlı cevap E2EE ile GİDER: motor aynı JS ortamında
  // (ön plan/arka plan) hazırsa kullanılır; uygulama kapalıysa (başsız görev) önce kullanıcı + motor kurulur.
  // Kurulamazsa gönderim hata verir ve bildirimde "gönderilemedi" görünür (sessizce kırık bırakılmaz).
  const user = useAuthStore.getState().user ?? (await authApi.me());
  await initE2ee(user.id);
  await sendMessage(conversationId, text);
}

/** C55: okundu. Ortam kanali `guildId` ile ayrilir (DM'de guildId yok). Hata sessiz: bildirim zaten kapandi. */
async function markConversationRead(data: ReplyTaskData): Promise<void> {
  const { conversationId, guildId } = data;
  try {
    if (!getAccessToken()) await refreshAccessToken();
    if (guildId) {
      await channelsApi.markRead(conversationId);
      useUnreadStore.getState().clearChannel(conversationId, guildId);
    } else {
      await dmApi.markRead(conversationId);
      useDmStore.getState().clearUnread(conversationId);
    }
  } catch {
    // Yeniden deneme yok (C55 sozlesme).
  }
}

/** C55: 8 saat sessize al. DM'de o DM, ortamda yalniz o kanal (CHANNEL hedefi); yalniz susturma alanlari yazilir. */
async function muteConversation(data: ReplyTaskData): Promise<void> {
  try {
    if (!getAccessToken()) await refreshAccessToken();
    const mutedUntil = new Date(Date.now() + NOTIFICATION_QUICK_MUTE_MINUTES * 60_000).toISOString();
    await useNotificationPrefsStore
      .getState()
      .setPref({ targetType: NotifTargetType.CHANNEL, targetId: data.conversationId, muted: true, mutedUntil });
  } catch {
    // Yeniden deneme yok.
  }
}

export async function runQuickReply(data: ReplyTaskData): Promise<void> {
  if (data.action === 'markRead') return markConversationRead(data);
  if (data.action === 'mute') return muteConversation(data);
  const text = data.text?.trim();
  if (!data.conversationId || !text) return;
  const timestamp = Date.now();
  const meAvatarUrl = await loadOwnAvatarUrl();
  try {
    await sendReply(data.conversationId, text);
    await appendOwnReplyToNotification(data.conversationId, text, timestamp, meAvatarUrl);
  } catch {
    try {
      await appendOwnReplyToNotification(
        data.conversationId,
        `${t('mobile.notifications.replyFailed')}: ${text}`,
        timestamp,
        meAvatarUrl,
      );
    } catch {
      // Bildirim de guncellenemiyorsa yapilacak bir sey yok.
    }
  }
}
