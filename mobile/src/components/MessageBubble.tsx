import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentView } from './AttachmentView';
import { BubbleMeta, ReactionRow, ReplyQuote } from './message/BubbleParts';
import { splitMentions } from '@/utils/mentions';
import type { MessageDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

const AVATAR_SIZE = 34;
const AVATAR_GAP = 8;

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
}: Props) {
  // M2d R1 — bahsetmeler vurgulu boyanır (web `.kv-mention` karşılığı). Düz karşılık, boş içerikte
  // metin bloğunu hiç render etmemek için (ek-yalnız mesajlar).
  const mentionSegments = splitMentions(
    message.content,
    resolveMention,
    t('mention.unknown'),
    resolveRole,
  );
  const displayContent = mentionSegments.map((seg) => seg.text).join('');
  const reactions = message.reactions ?? [];

  const identityVisible = showIdentity && !isMine;
  const nameVisible = identityVisible && showAuthor;
  // Ek-yalnız mesajda görsel baloncuğu doldursun diye iç dolgu 4px'e iner (§3.5).
  const attachmentOnly =
    displayContent.length === 0 &&
    (message.attachments?.length ?? 0) > 0 &&
    !message.replyToId &&
    !message.pinnedAt &&
    !nameVisible;
  // Kendi baloncuğumda Kor zemin üstünde accent500 okunmuyor (§4) → accent400.
  const accent = isMine ? theme.colors.accent400 : theme.colors.accent500;

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        showAuthor ? styles.rowNewGroup : styles.rowSameGroup,
      ]}
    >
      {identityVisible &&
        (showAuthor ? (
          <Pressable
            onPress={onPressAuthor}
            disabled={!onPressAuthor}
            accessibilityRole="button"
            accessibilityLabel={message.author.username}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{message.author.username.charAt(0).toUpperCase()}</Text>
          </Pressable>
        ) : (
          <View style={styles.avatarSpacer} />
        ))}

      <View style={[styles.column, isMine ? styles.columnMine : styles.columnTheirs]}>
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={350}
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleTheirs,
            showAuthor && (isMine ? styles.cornerFirstMine : styles.cornerFirstTheirs),
            attachmentOnly && styles.bubbleAttachmentOnly,
            highlighted && styles.bubbleHighlighted,
          ]}
        >
          {nameVisible && (
            <Pressable onPress={onPressAuthor} disabled={!onPressAuthor} accessibilityRole="button">
              <Text style={styles.author}>{message.author.username}</Text>
            </Pressable>
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
            />
          )}

          {displayContent.length > 0 && (
            <Text style={styles.content}>
              {mentionSegments.map((seg, i) =>
                seg.isMention ? (
                  <Text key={i} style={isMine ? styles.mentionMine : styles.mention}>
                    {seg.text}
                  </Text>
                ) : (
                  seg.text
                ),
              )}
            </Text>
          )}
          {/* Sprint M3c R2 — `interactive`: görsele dokun → tam ekran, dosyaya dokun → sistemde aç.
              CLEAN olmayan ekler dokunulamaz (bkz. `AttachmentView` prop notu). */}
          {message.attachments?.map((a) => (
            <AttachmentView key={a.id} attachment={a} interactive isMine={isMine} />
          ))}

          <BubbleMeta message={message} isMine={isMine} receipt={receipt} />
        </Pressable>

        {reactions.length > 0 && (
          <ReactionRow reactions={reactions} isMine={isMine} onToggleReaction={onToggleReaction} />
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
    marginRight: AVATAR_GAP,
    alignSelf: 'flex-end',
  },
  avatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  // Öbeğin devamında avatarla aynı genişlik: baloncuklar hizalı kalsın.
  avatarSpacer: {
    width: AVATAR_SIZE + AVATAR_GAP,
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
  bubbleHighlighted: {
    borderColor: theme.colors.accent500,
  },
  author: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    marginBottom: 2,
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
  // Web `.kv-mention` ile aynı dil: Kor metin + soluk Kor zemin. Yatay dolgu KONMADI — RN'de
  // iç içe `<Text>`in padding'i Android'de güvenilmez çiziliyor.
  mention: {
    color: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
    fontWeight: '500',
  },
  // §4 — `accentSubtle` bubbleOwn üstünde görünmez, zemin yok.
  mentionMine: {
    color: theme.colors.accent400,
    fontWeight: '500',
  },
});
