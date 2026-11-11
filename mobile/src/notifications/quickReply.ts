import { t } from '@/i18n';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { messagesApi } from '@/api/messages';
import { dmApi } from '@/api/dm';
import { channelsApi } from '@/api/channels';
import { NotifTargetType } from '@/api/notifications';
import { useDmStore } from '@/stores/dm';
import { useUnreadStore } from '@/stores/unread';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NOTIFICATION_QUICK_MUTE_MINUTES } from '@/utils/notifPrefUi';
import { appendOwnReplyToNotification, finishQuickReply } from '../../modules/conversation-notification';
import { loadOwnAvatarUrl } from './ownAvatar';
import { pickLocalEngine } from './offlineDecrypt';

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
  // E3 Rev.3 §10 k.3: hafif hızlı cevap. Ağlı motor kurulumu (oturum + cihaz kaydı + KeyPackage + Welcome) YOK, MIUI
  // penceresine sığmıyordu. Kanalın şifreli olup olmadığı YEREL grubun varlığından anlaşılır: `encryptOffline`
  // yerel grup yoksa null döner ve düz yol izlenir (şifreli kanala düz mesajı sunucu 409 ile reddeder, bildirimde
  // "Gönderilemedi" görünür). Ağa yalnız oturum yenileme (anahtar yoksa) ve mesaj POST'u çıkılır.
  // Yenileme ŞİFRELEMEDEN ÖNCE: şifreleme anahtar tüketir, sonradan ağ düşerse boşa gitmesin.
  if (!getAccessToken()) await refreshAccessToken();
  const engine = await pickLocalEngine();
  const cipher = engine ? await engine.encryptOffline(conversationId, text) : null;
  if (!engine || !cipher) {
    await messagesApi.send(conversationId, text);
    return;
  }
  const sent = await messagesApi.sendEncrypted(conversationId, cipher);
  // Düz metin yerel depoya: sohbet açılınca kendi cevabım okunur. Başarısızlık gönderimi geri almaz.
  await engine.rememberSent(sent).catch(() => undefined);
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

async function runAction(data: ReplyTaskData): Promise<void> {
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

/**
 * Headless görev girişi. Her çıkış yolunda (başarı, hata, erken dönüş) Kotlin alıcıya "bitti" sinyali gider:
 * alıcı `goAsync()` ile süreci bu ana kadar tutar (E3 Rev.3 k.4). Zamanlayıcı YOK (arka planda JS zamanlayıcıları durur).
 */
export async function runQuickReply(data: ReplyTaskData): Promise<void> {
  try {
    await runAction(data);
  } finally {
    await finishQuickReply().catch(() => undefined);
  }
}
