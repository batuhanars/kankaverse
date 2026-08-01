import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  guildName: string;
  guildIconUrl?: string | null;
  /** Yetkisiz üyede yönetim blokları render EDİLMEZ (disabled gösterilmez). */
  canManage: boolean;
  onClose: () => void;
  onInvite: () => void;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
}

/**
 * Sprint M1d-B §10.2 + sahip revizesi 2026-07-31 — ortam adına dokununca açılan alt panel.
 *
 * İlk sürüm üç satırlık dar bir kutuydu ve sahip "çok küçük görünüyor" dedi. Discord'un düzeni
 * alındı: **büyük ikon + ad başlığı · yuvarlak aksiyon şeridi · gruplanmış blok listesi.** Düzen
 * alındı, içerik alınmadı.
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK → eklenmez, mobile/CLAUDE.md "boş yüzey açma"):
 * Takviye/boost · Bildirimler (ortam bildirim tercihi mobilde bağlı değil) · Ayarlar (ortam ayarları
 * M1e) · Etkinlik Oluştur (web'de var, mobilde yok — §10.5 açık kararı) · Sunucu Profilini Düzenle ·
 * Sust. Kanalları Gizle · DM/Mesaj-isteği anahtarları · İstila Bildir · Sunucuyu Bildir ·
 * Güvenlik Eylemleri · Sunucu ID'sini Kopyala · Okunmuş Olarak İşaretle (ortam-geneli okundu
 * mobilde bağlı değil).
 *
 * Şeritte şu an tek aksiyon var (Davet Et) ve bu bilinçli: üç boş daire koyup ikisini çalıştırmamak,
 * paneli büyütmekten daha kötü olurdu.
 */
export function GuildMenuSheet({
  visible,
  guildName,
  guildIconUrl,
  canManage,
  onClose,
  onInvite,
  onCreateChannel,
  onCreateCategory,
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

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Başlık: büyük ikon + ad (Discord düzeni). İkon yoksa baş harf — rail'deki
                HexGuildIcon deseninin sade karşılığı; burada altıgen kullanılmadı çünkü bu bir
                ortam seçici değil, başlık. */}
            {guildIconUrl ? (
              <Image source={{ uri: guildIconUrl }} style={styles.icon} />
            ) : (
              <View style={[styles.icon, styles.iconFallback]}>
                <Text style={styles.iconFallbackText}>{guildName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.title} numberOfLines={2}>
              {guildName}
            </Text>

            {canManage && (
              <>
                <View style={styles.actionRow}>
                  <Pressable style={styles.action} onPress={onInvite}>
                    <View style={styles.actionCircle}>
                      <Ionicons name="person-add" size={20} color={theme.colors.textPrimary} />
                    </View>
                    <Text style={styles.actionLabel}>{t('channel.invite')}</Text>
                  </Pressable>
                </View>

                <View style={styles.group}>
                  <Pressable style={styles.option} onPress={onCreateChannel}>
                    <Text style={styles.optionText}>{t('channel.createTitle')}</Text>
                  </Pressable>
                  <View style={styles.divider} />
                  <Pressable style={styles.option} onPress={onCreateCategory}>
                    <Text style={styles.optionText}>{t('category.createTitle')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
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
    maxHeight: '85%',
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
  icon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.lg,
  },
  iconFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  action: {
    alignItems: 'center',
    gap: 6,
  },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
});
