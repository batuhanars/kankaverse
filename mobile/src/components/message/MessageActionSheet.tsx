import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1d-C §2.4 — mesaja uzun basınca açılan panel.
 *
 * Web'de bu aksiyonlar hover şeridinde (`MessageActionsMenu.vue`); dokunmatikte hover yok, karşılığı
 * uzun basıştır. **Hızlı emoji kümesi web'den okundu** (`QUICK_EMOJIS`), mobil kendi listesini
 * uydurmadı — iki istemcide aynı üç emoji.
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
export const QUICK_EMOJIS = ['👍', '❤️', '😂'];

interface Props {
  visible: boolean;
  /** Mesaj bana mı ait — düzenle/sil yalnız o zaman render edilir. */
  isMine: boolean;
  /** Bu mesaja hâlihazırda verdiğim tepkiler (vurgulu göstermek için). */
  myEmojis: string[];
  onClose: () => void;
  onToggleReaction: (emoji: string) => void;
  /** Şeridin sonundaki "+" — tam emoji listesini açar (web'deki picker'ın karşılığı). */
  onOpenPicker: () => void;
  onReply: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

export function MessageActionSheet({
  visible,
  isMine,
  myEmojis,
  onClose,
  onToggleReaction,
  onOpenPicker,
  onReply,
  onEdit,
  onCopy,
  onDelete,
}: Props) {
  const bottomInset = useSheetInsets();

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
              {QUICK_EMOJIS.map((emoji) => {
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
            </View>

            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onReply}>
                <Ionicons name="arrow-undo-outline" size={20} color={theme.colors.textSecondary} />
                {/* `reply.button` web'de zaten "Yanıtla" — yeni anahtar açılmadı. */}
                <Text style={styles.optionText}>{t('reply.button')}</Text>
              </Pressable>
              {isMine && (
                <Pressable style={styles.option} onPress={onEdit}>
                  <Ionicons name="pencil-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('message.edit')}</Text>
                </Pressable>
              )}
              <Pressable style={styles.option} onPress={onCopy}>
                <Ionicons name="copy-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('message.copyText')}</Text>
              </Pressable>
            </View>

            {isMine && (
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
  emojiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  emojiButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  emojiButtonActive: {
    backgroundColor: theme.colors.accentSubtle,
    borderWidth: 1,
    borderColor: theme.colors.accent500,
  },
  emojiText: {
    fontSize: 26,
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
