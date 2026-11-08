import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AiVideoSheet } from '../aiVideo/AiVideoSheet';
import { AiVideoSparkles } from '../aiVideo/AiVideoSparkles';
import { useAuthStore } from '@/stores/auth';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { showAnimatedNewBadge, type PickedProfileMedia, type ProfileMediaMode } from '@/utils/animatedMedia';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint C22: "Değiştir"in açtığı alttan sayfa: Görsel yükle / GIF-video yükle / Kaldır.
 * Dört yerde (profil fotoğrafı, profil afişi, ortam simgesi, ortam afişi) aynı sayfa.
 * `animatedAllowed` sunucudan gelir (UserDto); false iken seçenek görünür ama kapalı. Sunucu yine otorite.
 */
interface Props {
  visible: boolean;
  title: string;
  animatedAllowed: boolean;
  canRemove: boolean;
  onClose: () => void;
  onPick: (mode: ProfileMediaMode) => void;
  onRemove: () => void;
  /** C14d: yapay zeka videosu "Kullan" ile indirildi; çağıran hareketli kesit akışına verir. */
  onAiVideo?: (media: Extract<PickedProfileMedia, { kind: 'video' }>) => void;
}

export function MediaSourceSheet({ visible, title, animatedAllowed, canRemove, onClose, onPick, onRemove, onAiVideo }: Props) {
  const bottomInset = useSheetInsets();
  const [aiOpen, setAiOpen] = useState(false);
  // C14d/C33: kapı yalnız arayüz; sunucu otorite. İzinli ya da pasif tanıtım (aiVideoPreview); ikisi de yoksa seçenek hiç görünmez.
  const aiAllowed =
    useAuthStore((s) => s.user?.aiVideoAllowed === true || s.user?.aiVideoPreview === true) && !!onAiVideo;
  return (
    <>
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>

          <Pressable style={styles.option} onPress={() => onPick('static')}>
            <Ionicons name="image-outline" size={22} color={theme.colors.textSecondary} />
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>{t('media.source.image')}</Text>
              <Text style={styles.optionDesc}>{t('media.source.imageHint')}</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.option, !animatedAllowed && styles.optionOff]}
            disabled={!animatedAllowed}
            onPress={() => onPick('animated')}
          >
            <Ionicons name="film-outline" size={22} color={theme.colors.textSecondary} />
            <View style={styles.optionBody}>
              <View style={styles.titleRow}>
                <Text style={styles.optionTitle}>{t('media.source.animated')}</Text>
                {animatedAllowed && showAnimatedNewBadge() ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t('media.source.newBadge')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.optionDesc}>
                {animatedAllowed ? t('media.source.animatedHint') : t('media.source.animatedOff')}
              </Text>
            </View>
          </Pressable>

          {aiAllowed ? (
            <Pressable
              style={styles.option}
              onPress={() => {
                // İki Modal üst üste açılmasın: seçim sayfası kapanır, sonra yapay zeka sayfası açılır.
                onClose();
                setAiOpen(true);
              }}
            >
              <AiVideoSparkles size={22} color={theme.colors.textSecondary} />
              <View style={styles.optionBody}>
                <Text style={styles.optionTitle}>{t('media.source.aiVideo')}</Text>
                <Text style={styles.optionDesc}>{t('media.source.aiVideoHint')}</Text>
              </View>
            </Pressable>
          ) : null}

          {canRemove ? (
            <Pressable style={styles.option} onPress={onRemove}>
              <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
              <Text style={[styles.optionTitle, styles.removeText]}>{t('media.source.remove')}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
    {aiAllowed ? (
      <AiVideoSheet
        visible={aiOpen}
        mode="media"
        onClose={() => setAiOpen(false)}
        onUse={(media) => {
          setAiOpen(false);
          onAiVideo?.(media);
        }}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.layout.panelGap,
    gap: 8,
  },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xl, fontWeight: '700', marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  optionOff: { opacity: 0.5 },
  optionBody: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  optionDesc: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
  removeText: { color: theme.colors.danger },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: theme.colors.accent500,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
