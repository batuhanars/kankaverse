import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  guildName: string;
  guildIconUrl?: string | null;
  /** Sprint M2b §4.3 — `GuildSummaryDto.description`, varsa başlığın altında (4 satır kırpılı). */
  guildDescription?: string | null;
  /** Yetkisiz üyede yönetim blokları render EDİLMEZ (disabled gösterilmez). */
  canManage: boolean;
  onClose: () => void;
  onInvite: () => void;
  /** M1e §2.1 — Ortam Ayarları. Yalnız `canManage` bloğunda render edilir. */
  onSettings: () => void;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
  /** Sprint M2a §4.5 — ortamın TÜM kanallarını dolaşıp okundu işaretler (web `useGuildMenuActions.ts`
   *  `markGuildRead` — menünün 1. maddesi). Yetki gerekmez, HERKESE açık. */
  onMarkRead: () => void;
  /** Sprint M2b §4.3 — üçüncü aksiyon: bildirim tercihi ekranına götürür. Yetki gerekmez. */
  onNotifications: () => void;
}

/**
 * Sprint M1d-B §10.2 + sahip revizesi 2026-07-31 — ortam adına dokununca açılan alt panel.
 *
 * İlk sürüm üç satırlık dar bir kutuydu ve sahip "çok küçük görünüyor" dedi. Discord'un düzeni
 * alındı: **büyük ikon + ad başlığı · yuvarlak aksiyon şeridi · gruplanmış blok listesi.** Düzen
 * alındı, içerik alınmadı.
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK → eklenmez, mobile/CLAUDE.md "boş yüzey açma"):
 * Takviye/boost · Etkinlik Oluştur (web'de var, mobilde yok — §10.5 açık kararı) · Sunucu Profilini
 * Düzenle · Sust. Kanalları Gizle · DM/Mesaj-isteği anahtarları · İstila Bildir · Sunucuyu Bildir ·
 * Güvenlik Eylemleri · Sunucu ID'sini Kopyala.
 *
 * Sprint M2a §4.5 — "Okunmuş Olarak İşaretle" EKLENDİ (web menüsünün 1. maddesi, önceki not burada
 * listeliyordu). Yetki gerekmez — `canManage` bloğunun DIŞINDA, her üyeye görünür.
 *
 * Sprint M2b §4.3 — aksiyon şeridi üçe çıktı: Davet Et · **Bildirimler** (yeni, `canManage` DIŞINDA —
 * bildirim tercihi bir yetki kararı değil) · Ortam Ayarları. Yetkisiz üyede yalnız "Bildirimler"
 * görünür — bu "boş yüzey" değil, tek çalışan aksiyon zaten var.
 */
export function GuildMenuSheet({
  visible,
  guildName,
  guildIconUrl,
  guildDescription,
  canManage,
  onClose,
  onInvite,
  onSettings,
  onCreateChannel,
  onCreateCategory,
  onMarkRead,
  onNotifications,
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
                GuildRailItem deseninin sade karşılığı; burada altıgen kullanılmadı çünkü bu bir
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

            {/* Sprint M2b §4.3 — ortam açıklaması, varsa (alan zaten tipli, yeni backend alanı DEĞİL). */}
            {guildDescription ? (
              <Text style={styles.description} numberOfLines={4}>
                {guildDescription}
              </Text>
            ) : null}

            {/* Sprint M2a §4.5 — HERKESE açık (yetki gerekmez), bu yüzden `canManage` bloğunun
                DIŞINDA. Web menüsünün 1. maddesiyle aynı yer (ortamın en üst aksiyonu). */}
            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onMarkRead}>
                <Text style={styles.optionText}>{t('guildMenu.markRead')}</Text>
              </Pressable>
            </View>

            {/* Aksiyon şeridi — Discord'un daire şeridi. Sprint M2b §4.3: üçüncü aksiyon
                "Bildirimler" HERKESE açık (`canManage` DIŞINDA); Davet Et/Ayarlar yetkili kalır.
                Yetkisiz üyede yalnız Bildirimler görünür — tek daire, boş yüzey değil. */}
            <View style={styles.actionRow}>
              {canManage && (
                <Pressable style={styles.action} onPress={onInvite}>
                  <View style={styles.actionCircle}>
                    <Ionicons name="person-add" size={20} color={theme.colors.textPrimary} />
                  </View>
                  <Text style={styles.actionLabel}>{t('channel.invite')}</Text>
                </Pressable>
              )}
              <Pressable style={styles.action} onPress={onNotifications}>
                <View style={styles.actionCircle}>
                  <Ionicons name="notifications-outline" size={20} color={theme.colors.textPrimary} />
                </View>
                <Text style={styles.actionLabel}>{t('guildMenu.notifications')}</Text>
              </Pressable>
              {canManage && (
                <Pressable style={styles.action} onPress={onSettings}>
                  <View style={styles.actionCircle}>
                    <Ionicons name="settings-outline" size={20} color={theme.colors.textPrimary} />
                  </View>
                  <Text style={styles.actionLabel}>{t('guildSettings.title')}</Text>
                </Pressable>
              )}
            </View>

            {canManage && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onCreateChannel}>
                  <Text style={styles.optionText}>{t('channel.createTitle')}</Text>
                </Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.option} onPress={onCreateCategory}>
                  <Text style={styles.optionText}>{t('category.createTitle')}</Text>
                </Pressable>
              </View>
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
  description: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
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
