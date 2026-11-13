import { useMemo, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentView } from './AttachmentView';
import { PresenceDot } from './PresenceDot';
import { usePresenceStore, selectStatus } from '@/stores/presence';
import { BubbleMeta, MetaSpacer, ReactionRow, ReplyQuote } from './message/BubbleParts';
import { E2eeStatusNote, EditedAfterLeaveNote } from './message/E2eeStatusNote';
import { EmbedCards } from './message/EmbedCard';
import { BUBBLE_TAP_MAX_DURATION_MS } from './message/MediaPressable';
import { MarkdownText } from './message/MarkdownText';
import { endsWithTextBlock, parseMarkdown } from '@/utils/markdown';
import type { MessageDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

const AVATAR_SIZE = 30;
const DOT_SIZE = 11;
/** İki dokunuş arası sınır; medyanın tek dokunuşu da bu kadar bekler. */
const DOUBLE_TAP_MAX_DELAY_MS = 250;

interface Props {
  message: MessageDto;
  showAuthor: boolean;
  isMine: boolean;
  /**
   * M6a §2 — avatar + yazar adı gösterilsin mi. Açık prop (okundu göstergesinden ÇIKARIM yapılmaz):
   * ortam kanalı ve grup DM `true`, 1-1 DM `false`. Kendi mesajımda hiçbir zaman çizilmez.
   */
  showIdentity: boolean;
  resolveMention: (userId: string) => string | undefined;
  /** R15 — roleId → rol adı. Verilmezse rol token'ı "@rol" yedeğiyle çizilir (DM'de böyle). */
  resolveRole?: (roleId: string) => string | undefined;
  /** Sözleşme §3.5 — mesaj aramasından "gidiyor" (jump) sonrası geçici vurgu; baloncuğa Kor kenarlık. */
  highlighted?: boolean;
  /** M1d-C §2.4 — uzun basış mesaj panelini açar (web'deki hover şeridinin dokunmatik karşılığı). */
  onLongPress?: () => void;
  /**
   * Sprint M3b §3.1 — avatara/ada dokunuş **profil alt-panelini** açar. Yalnız kimlik gösterilen
   * yerde var (olmayan bir hedefe dokunma alanı uydurulmaz).
   */
  onPressAuthor?: () => void;
  /**
   * C12 §4.2 — okundu göstergesi: 'sent' tek tik, 'seen' çift tik, null/undefined = HİÇ çizme.
   * Kararı ekran verir (1-1 DM); ortam kanalı ve grup DM bu prop'u hiç geçmez.
   */
  receipt?: 'sent' | 'seen' | null;
  /** Tepki pill'ine dokunuş: kendi tepkimi kaldırır, başkasınınkine katılır (web ile aynı). */
  onToggleReaction?: (emoji: string) => void;
  /** C46 — tepki pilne uzun basış: kimler tepki verdi paneli. */
  onShowReactions?: () => void;
  /**
   * C46 §6.1 — baloncuğa çift dokunma (hızlı tepkinin ilki). Metin ve medya dahil tüm baloncuk;
   * medyanın tek dokunuşu bu jest başarısız olunca çalışır (`MediaPressable`).
   * Verilmezse (yerel mesaj) jest hiç kurulmaz.
   */
  onDoubleTap?: () => void;
  /** C29: basarisiz gecici mesajin "Tekrar dene" / "Sil" eylemleri. */
  onRetry?: () => void;
  onDiscard?: () => void;
  /** Yanıt alıntısına dokunuş: alıntılanan mesaja git (liste kaydırır + vurgular). */
  onPressReply?: () => void;
}

// Sprint M6a — WhatsApp tarzı sağlı sollu baloncuk (web/masaüstü düz liste olarak kalır). Öbekleme
// `showAuthor` bayrağıyla (useMessageListController) aynı; `message.updated`/`deleted` WS'ten gelirse
// bu bileşen yalnız güncel veriyi render eder.
export function MessageBubble({
  message,
  showAuthor,
  isMine,
  showIdentity,
  receipt,
  resolveMention,
  resolveRole,
  highlighted,
  onLongPress,
  onPressAuthor,
  onToggleReaction,
  onShowReactions,
  onDoubleTap,
  onRetry,
  onDiscard,
  onPressReply,
}: Props) {
  // Jest her render'da yeniden kurulmasın: işleyici ref'te (mesajın `reactedByMe` kararı çağıranda,
  // en güncel mesajla verilir), jest yalnız var/yok'a bağlı.
  const doubleTapRef = useRef(onDoubleTap);
  doubleTapRef.current = onDoubleTap;
  const hasDoubleTap = !!onDoubleTap;
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(hasDoubleTap)
        .numberOfTaps(2)
        .maxDistance(12)
        .maxDelay(DOUBLE_TAP_MAX_DELAY_MS)
        .maxDuration(BUBBLE_TAP_MAX_DURATION_MS)
        // JS thread'inde çalışır: ref'in `.current`ı worklet'e kopyalanmaz, hep en güncel işleyici.
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) doubleTapRef.current?.();
        }),
    [hasDoubleTap],
  );

  // C56 — içerik markdown olarak çizilir (`MarkdownText`); bahsetme vurgusu orada. Ağaç yalnız içeriğe
  // bağlı önbelleklenir; boş içerikte metin bloğu hiç çizilmez (ek-yalnız mesajlar).
  const hasContent = message.content.length > 0;
  const mdBlocks = useMemo(() => parseMarkdown(message.content), [message.content]);
  const reactions = message.reactions ?? [];
  // C35: gelen webhook mesaji: BOT rozeti + varsayilan bot simgesi; yazar kullanici degil, profil acilmaz.
  const isWebhook = !!message.webhook;
  const embeds = message.embeds ?? [];
  // C29: gecici mesaj: yalniz Tekrar dene / Sil; menu, tepki, okundu tiki yok.
  const isLocal = !!message.localStatus;

  // C28 — yalnız bu yazarın durumuna abone (tüm haritaya değil); liste performansı.
  const authorStatus = usePresenceStore(selectStatus(message.author.id));
  const identityVisible = showIdentity && !isMine;
  const nameVisible = identityVisible && showAuthor;
  // Ek-yalnız mesajda görsel baloncuğu doldursun diye iç dolgu 4px'e iner (§3.5).
  const attachmentOnly =
    !hasContent &&
    (message.attachments?.length ?? 0) > 0 &&
    !message.replyToId &&
    !message.pinnedAt &&
    !nameVisible;
  // Kendi baloncuğumda Kor zemin üstünde Kor okunmuyor (bkz. tokens.ts bubbleOwn) → beyaz.
  const accent = isMine ? theme.colors.textPrimary : theme.colors.accent500;
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  // Metin her zaman baloncuğun son içeriği (ekler varsa onların ALTINDA, M6c §3.3.b sahip revizesi) →
  // saat metnin son satırına oturur, kısa mesaj tek satır kalır.
  // Son blok liste/alıntı/kod ise saat o bloğun içine oturamaz → ayrı meta satırı (inline=false).
  const metaInline = hasContent && endsWithTextBlock(mdBlocks);

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        showAuthor ? styles.rowNewGroup : styles.rowSameGroup,
      ]}
    >

      <View style={[styles.column, isMine ? styles.columnMine : styles.columnTheirs]}>
        <GestureDetector gesture={doubleTap}>
        <Pressable
          onLongPress={isLocal ? undefined : onLongPress}
          delayLongPress={350}
          style={[
            styles.bubble,
            message.localStatus === 'sending' && styles.bubbleSending,
            isMine ? styles.bubbleMine : styles.bubbleTheirs,
            showAuthor && (isMine ? styles.cornerFirstMine : styles.cornerFirstTheirs),
            attachmentOnly && styles.bubbleAttachmentOnly,
            highlighted && styles.bubbleHighlighted,
          ]}
        >
          {nameVisible && (
            <View style={styles.authorRow}>
              {/* Sahip revizesi 2026-11-09: avatar baloncuğun dışında, uzun mesajda en altta kalıyordu;
                  artık baloncuğun içinde adın yanında. Avatar + ad tek dokunma hedefi (profil). */}
              <Pressable
                onPress={onPressAuthor}
                disabled={!onPressAuthor || isWebhook}
                accessibilityRole="button"
                accessibilityLabel={
                  authorStatus === 'offline'
                    ? message.author.username
                    : `${message.author.username}, ${t(`presence.${authorStatus}`)}`
                }
                style={styles.authorName}
              >
                <View style={styles.avatar}>
                  {isWebhook ? (
                    <Ionicons name="hardware-chip-outline" size={17} color={theme.colors.accent500} />
                  ) : message.author.avatarUrl ? (
                    <Image source={{ uri: message.author.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>
                      {message.author.username.charAt(0).toUpperCase()}
                    </Text>
                  )}
                  {/* Çevrimdışıda nokta YOK (C28 §1.2): gizli görünürlük de istemciye çevrimdışı gelir. */}
                  {authorStatus !== 'offline' && (
                    <PresenceDot
                      status={authorStatus}
                      size={DOT_SIZE}
                      ringColor={theme.colors.bgElevated}
                    />
                  )}
                </View>
                <Text style={styles.author} numberOfLines={1}>
                  {message.author.username}
                  {message.author.roleEmoji ? ` ${message.author.roleEmoji}` : ''}
                </Text>
              </Pressable>
              {isWebhook && <Text style={styles.botBadge}>{t('message.botBadge')}</Text>}
            </View>
          )}

          {/* Sabitlenmiş rozeti (sahip revizesi 2026-08-01): sabitlemek görülebilir bir sonuç üretir.
              `showAuthor` gruplamasından bağımsız — arka arkaya mesajlarda hangisinin sabitlendiği
              kaybolmasın. */}
          {message.pinnedAt ? (
            <View style={styles.pinnedRow}>
              <Ionicons name="bookmark" size={11} color={accent} />
              <Text style={[styles.pinnedText, { color: accent }]}>{t('message.pinned')}</Text>
            </View>
          ) : null}

          {message.replyToId && (
            <ReplyQuote
              message={message}
              isMine={isMine}
              resolveMention={resolveMention}
              resolveRole={resolveRole}
              onPress={isLocal ? undefined : onPressReply}
              onLongPress={isLocal ? undefined : onLongPress}
            />
          )}

          {/* Sprint M3c R2 — `interactive`: görsele dokun → tam ekran, dosyaya dokun → sistemde aç.
              CLEAN olmayan ekler dokunulamaz (bkz. `AttachmentView` prop notu). */}
          {message.attachments?.map((a) => (
            <AttachmentView
              key={a.id}
              attachment={a}
              interactive
              isMine={isMine}
              doubleTap={hasDoubleTap ? doubleTap : undefined}
            />
          ))}

          {isWebhook && embeds.length > 0 && (
            <EmbedCards embeds={embeds} resolveMention={resolveMention} resolveRole={resolveRole} />
          )}

          {/* E1: çözülemeyen / bilinmeyen sürümlü şifreli mesaj (metin yok, durum cümlesi) */}
          {/* C62: ayrıldıktan sonra düzenlenmiş mesaj — E2EE etiketinden ÖNCE bakılır. */}
          {message.editedAfterLeave && <EditedAfterLeaveNote />}
          {!message.editedAfterLeave && !hasContent && message.e2eeStatus && message.e2eeStatus !== 'ok' && (
            <E2eeStatusNote status={message.e2eeStatus} />
          )}

          {/* Açıklama eklerin ALTINDA (sahip revizesi 2026-10-15, WhatsApp düzeni). */}
          {hasContent && (
            <MarkdownText
              content={message.content}
              isMine={isMine}
              resolveMention={resolveMention}
              resolveRole={resolveRole}
              onLongPress={isLocal ? undefined : onLongPress}
              textStyle={styles.content}
              style={hasAttachments ? styles.contentAfterAttachments : undefined}
              trailing={
                metaInline ? <MetaSpacer message={message} receipt={isLocal ? null : receipt} isMine={isMine} /> : undefined
              }
            />
          )}

          <BubbleMeta message={message} isMine={isMine} receipt={isLocal ? null : receipt} inline={metaInline} />
        </Pressable>
        </GestureDetector>

        {message.localStatus === 'failed' && (
          <View style={styles.failedRow} accessibilityRole="alert">
            <Text style={styles.failedText}>
              {t('message.local.failed')}
              {message.localError ? ` · ${message.localError}` : ''}
            </Text>
            <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
              <Text style={styles.failedAction}>{t('message.local.retry')}</Text>
            </Pressable>
            <Pressable onPress={onDiscard} hitSlop={8} accessibilityRole="button">
              <Text style={styles.failedAction}>{t('message.local.discard')}</Text>
            </Pressable>
          </View>
        )}

        {!isLocal && reactions.length > 0 && (
          <ReactionRow
            reactions={reactions}
            isMine={isMine}
            onToggleReaction={onToggleReaction}
            onLongPressReaction={onShowReactions}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: theme.layout.panelGap,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  // Boşluk: öbek içi 2px, yeni öbek 8px (§2).
  rowNewGroup: {
    marginTop: 8,
  },
  rowSameGroup: {
    marginTop: 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  // Baloncuk en fazla satır genişliğinin %80'i; kısa mesajda içeriği kadar daralır.
  column: {
    maxWidth: '80%',
    flexShrink: 1,
  },
  columnMine: {
    alignItems: 'flex-end',
  },
  columnTheirs: {
    alignItems: 'flex-start',
  },
  // Kenarlık HER ZAMAN 1.5 (vurgu dışında saydam) → atlama vurgusu yerleşimi kaydırmaz; dolgu bu
  // yüzden 10/6'dan 1.5 eksik.
  bubble: {
    flexShrink: 1,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 8.5,
    paddingVertical: 4.5,
  },
  bubbleAttachmentOnly: {
    padding: 2.5,
  },
  bubbleMine: {
    backgroundColor: theme.colors.bubbleOwn,
  },
  bubbleTheirs: {
    backgroundColor: theme.colors.bgElevated,
  },
  // Öbeğin ilk baloncuğunda gönderen tarafın üst köşesi sade işaret (kuyruk çizilmez).
  cornerFirstMine: {
    borderTopRightRadius: theme.radius.sm,
  },
  cornerFirstTheirs: {
    borderTopLeftRadius: theme.radius.sm,
  },
  // C29: gonderiliyor = %55 opaklik, baska isaret yok (spinner/yanip sonme yok).
  bubbleSending: {
    opacity: 0.55,
  },
  failedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  failedText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
  },
  failedAction: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  bubbleHighlighted: {
    borderColor: theme.colors.accent500,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  authorName: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  author: {
    color: theme.colors.textSecondary,
    // Sahip 2026-11-09: xs okunmuyordu, bir tık büyütüldü.
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  // C35: BOT rozeti (web ile ayni dil: Kor zemin, beyaz metin)
  botBadge: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.accent500,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 5,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  pinnedText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  content: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  contentAfterAttachments: {
    marginTop: 6,
  },
});
