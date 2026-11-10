import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { useQuickReactions } from '@/utils/quickReactions';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1d-C §2.4 — mesaja uzun basınca açılan panel.
 *
 * Web'de bu aksiyonlar hover şeridinde (`MessageActionsMenu.vue`); dokunmatikte hover yok, karşılığı
 * uzun basıştır. **Hızlı tepki şeridi hesaba bağlı** (C24): oturum kullanıcısının `quickReactions`ı,
 * varsayılanın tek kaynağı sunucu; istemcide sabit liste yok.
 *
 * 🔴 Yetki sunucudadır, istemci taklit etmez: **düzenleme ve silme yalnız YAZARA açıktır**
 * (`messages.controller.ts`: "yalnız yazar"). Yetkisiz kullanıcıda bu satırlar **hiç render
 * edilmez**, disabled gösterilmez.
 *
 * 🔴 KONMAYANLAR: **Mesajı Sabitle** — uç var ama mobilde sabitlenmiş mesajları GÖSTEREN bir yüzey
 * yok (web'de `PinsPopover` var, mobilde yok) → sabitlenen mesaj görülemezdi. M1d-B'deki ses kanalı
 * kararının aynısı: **görülemeyen sonuç üretilmez.** · Okunmadı İşaretle (mesaj-başına okunmamış
 * kavramı yok) · Uygulamalar · Mesaj Bağlantısını Kopyala (mobilde derin bağlantı yok) · Mesaj ID
 * (geliştirici modu yok).
 */

interface Props {
  visible: boolean;
  /** Mesaj bana mı ait — düzenle yalnız o zaman render edilir. */
  isMine: boolean;
  /** Sil satırı: kendi mesajım ya da ortamda `MANAGE_MESSAGES` (web ile aynı kural; sunucu otorite). */
  canDelete: boolean;
  /** Bu mesaja hâlihazırda verdiğim tepkiler (vurgulu göstermek için). */
  myEmojis: string[];
  onClose: () => void;
  onToggleReaction: (emoji: string) => void;
  /** C46 — mesajda tepki varsa "Tepkileri gör" satırı çizilir. */
  hasReactions: boolean;
  onShowReactions: () => void;
  /** Şeridin sonundaki "+" — tam emoji listesini açar (web'deki picker'ın karşılığı). */
  onOpenPicker: () => void;
  /** C24 — şeridin sonundaki kalem: hızlı tepkileri düzenleme ekranı. */
  onEditQuickReactions: () => void;
  /** Verilmezse Yanıtla satırı çizilmez (C57: salt okunur kanal, yazılamayan sohbet). */
  onReply?: () => void;
  onForward: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  /**
   * Sprint M1h — sabitleme satırı YALNIZ yetki varsa çizilir. Ortamda `MANAGE_MESSAGES`
   * (`useGuildPermission` ile hesaplanır), DM/grup DM'de her üye.
   * 🔴 OWNER/ADMIN kontrolü YETMEZ: `MANAGE_MESSAGES` granüler bir izin, özel rolle de gelebilir.
   */
  canPin: boolean;
  /** Mesaj zaten sabitli mi — aynı satır "Sabitle" ↔ "Sabitlemeyi kaldır" olarak değişir. */
  isPinned: boolean;
  onTogglePin: () => void;
}

export function MessageActionSheet({
  visible,
  isMine,
  canDelete,
  myEmojis,
  onClose,
  onToggleReaction,
  hasReactions,
  onShowReactions,
  onOpenPicker,
  onEditQuickReactions,
  onReply,
  onForward,
  onEdit,
  onCopy,
  onDelete,
  canPin,
  isPinned,
  onTogglePin,
}: Props) {
  const bottomInset = useSheetInsets();
  const quickEmojis = useQuickReactions();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.content}>
            {/* Hızlı tepki şeridi — verdiğim tepki vurgulu; tekrar dokunmak kaldırır (web ile aynı). */}
            <View style={styles.emojiRow}>
              {quickEmojis.map((emoji) => {
                const mine = myEmojis.includes(emoji);
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => onToggleReaction(emoji)}
                    style={[styles.emojiButton, mine && styles.emojiButtonActive]}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </Pressable>
                );
              })}
              {/* Tam liste girişi — şeridin sonunda. İkon **gri outline yüz**, web'deki picker
                  tetikleyicisinin (`MessageActionsMenu.vue`: "Gri outline yüz ikonu") ve sahibin
                  Discord referansının aynısı. Artı işareti değil: artı "ekle" der, yüz "emoji seç"
                  der — kullanıcı neyin açılacağını ikondan anlamalı. */}
              <Pressable
                onPress={onOpenPicker}
                style={styles.emojiButton}
                accessibilityRole="button"
                accessibilityLabel={t('message.emojiButton')}
              >
                <Ionicons name="happy-outline" size={26} color={theme.colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={onEditQuickReactions}
                style={styles.editButton}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.quickReactions.edit')}
              >
                <Ionicons name="pencil-outline" size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.group}>
              {onReply && (
                <Pressable style={styles.option} onPress={onReply}>
                  <Ionicons name="arrow-undo-outline" size={20} color={theme.colors.textSecondary} />
                  {/* `reply.button` web'de zaten "Yanıtla" — yeni anahtar açılmadı. */}
                  <Text style={styles.optionText}>{t('reply.button')}</Text>
                </Pressable>
              )}
              {/* İlet — web'de var (`ForwardMessageModal.vue`), parite gereği mobile de geldi.
                  Ayrı bir uç DEĞİL: mesajın metni seçilen DM'e yeni mesaj olarak gönderilir. */}
              <Pressable style={styles.option} onPress={onForward}>
                <Ionicons name="arrow-redo-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('message.forward')}</Text>
              </Pressable>
              {isMine && (
                <Pressable style={styles.option} onPress={onEdit}>
                  <Ionicons name="pencil-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('message.edit')}</Text>
                </Pressable>
              )}
              {canPin && (
                <Pressable style={styles.option} onPress={onTogglePin}>
                  <Ionicons
                    name={isPinned ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.optionText}>
                    {isPinned ? t('message.unpin') : t('message.pin')}
                  </Text>
                </Pressable>
              )}
              {hasReactions && (
                <Pressable style={styles.option} onPress={onShowReactions}>
                  <Ionicons name="happy-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('reaction.viewReactions')}</Text>
                </Pressable>
              )}
              <Pressable style={styles.option} onPress={onCopy}>
                <Ionicons name="copy-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('message.copyText')}</Text>
              </Pressable>
            </View>

            {canDelete && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onDelete}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                  <Text style={[styles.optionText, styles.optionTextDanger]}>{t('message.delete')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    gap: 12,
  },
  // Beş emoji + picker girişi = altı daire. Sabit genişlik yerine `flex: 1` + `aspectRatio`:
  // dar ekranda taşmasın, geniş ekranda şeridi doldursun (sahip bulgusu: sağ taraf boş kalıyordu).
  emojiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emojiButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  // Kalem küçük sabit düğme: beş emoji + liste düğmesi şeridi doldurmaya devam eder.
  editButton: {
    width: 28,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButtonActive: {
    backgroundColor: theme.colors.accentSubtle,
    borderWidth: 1,
    borderColor: theme.colors.accent500,
  },
  emojiText: {
    fontSize: 24,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  optionTextDanger: {
    color: theme.colors.danger,
  },
});
