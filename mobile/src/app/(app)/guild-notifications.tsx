import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SelectSheet } from '@/components/guild/SelectSheet';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotifTargetType, NotificationLevel } from '@/api/notifications';
import { extractErrorMessage } from '@/api/errors';
import {
  getMuteDurationOptions,
  getNotificationLevelOptions,
  muteMinutesFromValue,
  muteUntilLabel,
} from '@/utils/notifPrefUi';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M2b §4.4 — ortam bildirim ayarları ekranı (yeni route). Sustur (süre) + seviye, İKİSİ DE
 * seçince ANINDA kaydedilir (ayrı "Kaydet" düğmesi yok — sözleşme). Bu ekran, DM/Kanal panellerinin
 * geçici menü sheet'lerinden farklı olarak KALICI bir ekran; hata burada Türkçe mesajla GÖRÜNÜR
 * gösterilir (sözleşme §4.4 son satır) — menü sheet'leri hatayı sessiz yutar (bkz. home.tsx/DmMenuHost).
 */
export default function GuildNotificationsScreen() {
  const params = useLocalSearchParams<{ guildId: string; guildName?: string }>();
  const guildId = params.guildId;
  const guildName = params.guildName ?? '';

  const muted = useNotificationPrefsStore((s) => s.isMuted(NotifTargetType.GUILD, guildId));
  const mutedUntil = useNotificationPrefsStore((s) => s.mutedUntilFor(NotifTargetType.GUILD, guildId));
  const level = useNotificationPrefsStore((s) => s.effectiveLevel(NotifTargetType.GUILD, guildId));
  // R14 §3.1 — ortam düzeyi bastırma bayrakları. Ortam susturulmuşken de GİZLENMEZ:
  // sustur geçici olabilir, bu ayar kalıcıdır (sözleşme).
  const suppressEveryone = useNotificationPrefsStore((s) => s.suppressEveryone(guildId));
  const suppressEvents = useNotificationPrefsStore((s) => s.suppressEvents(guildId));
  const suppressRoleMentions = useNotificationPrefsStore((s) => s.suppressRoleMentions(guildId));

  const [subSheet, setSubSheet] = useState<'none' | 'mute' | 'level'>('none');
  const [errorMessage, setErrorMessage] = useState('');

  // Store oturum açılışında zaten `load()` ile dolduruluyor ((app)/_layout.tsx); burada odaklanmada
  // TEKRAR tazelenir — web'den yapılan bir değişikliği görmek için (DoD: "aynı hesapta web'den yapılan
  // susturma mobilde de görünüyor"). Hata sessiz: store boşsa varsayılan (susturulmamış/Tümü) kalır.
  useFocusEffect(
    useCallback(() => {
      void useNotificationPrefsStore.getState().load().catch(() => {});
    }, []),
  );

  async function onMutePress() {
    setErrorMessage('');
    if (muted) {
      try {
        await useNotificationPrefsStore.getState().setPref({
          targetType: NotifTargetType.GUILD,
          targetId: guildId,
          muted: false,
          mutedUntil: null,
        });
      } catch (e) {
        setErrorMessage(extractErrorMessage(e));
      }
      return;
    }
    setSubSheet('mute');
  }

  async function onMuteDurationSelect(value: string) {
    setSubSheet('none');
    setErrorMessage('');
    const minutes = muteMinutesFromValue(value);
    const nextMutedUntil = minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
    try {
      await useNotificationPrefsStore.getState().setPref({
        targetType: NotifTargetType.GUILD,
        targetId: guildId,
        muted: true,
        mutedUntil: nextMutedUntil,
      });
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    }
  }

  async function onLevelSelect(value: string) {
    setSubSheet('none');
    setErrorMessage('');
    try {
      await useNotificationPrefsStore.getState().setPref({
        targetType: NotifTargetType.GUILD,
        targetId: guildId,
        level: value as NotificationLevel,
      });
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    }
  }

  /**
   * R14 §3.1 — anahtar değişince ANINDA kaydedilir. Store `setPref`'i zaten iyimser yazıp
   * hatada geri alıyor; burada yalnız hatayı görünür kılıyoruz (ekranın mevcut deseni).
   */
  async function onToggleSuppress(
    field: 'suppressEveryone' | 'suppressEvents' | 'suppressRoleMentions',
    value: boolean,
  ) {
    setErrorMessage('');
    try {
      await useNotificationPrefsStore.getState().setPref({
        targetType: NotifTargetType.GUILD,
        targetId: guildId,
        [field]: value,
      });
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    }
  }

  const levelLabel =
    level === NotificationLevel.MENTIONS
      ? t('guildMenu.notificationsMentions')
      : level === NotificationLevel.NONE
        ? t('guildMenu.notificationsNone')
        : t('guildMenu.notificationsAll');

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildMenu.notifications') }} />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.group}>
          <Pressable style={styles.row} onPress={onMutePress}>
            <Ionicons
              name={muted ? 'volume-high-outline' : 'volume-mute-outline'}
              size={20}
              color={theme.colors.textSecondary}
            />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>
                {muted
                  ? t('guildMenu.unmute')
                  : t('mobile.guildNotifications.muteLabel', { name: guildName })}
              </Text>
              {muted && <Text style={styles.rowSubtext}>{muteUntilLabel(mutedUntil)}</Text>}
            </View>
          </Pressable>
        </View>
        <Text style={styles.hint}>{t('mobile.guildNotifications.muteDesc')}</Text>

        <View style={[styles.group, styles.groupSpaced]}>
          <Pressable style={styles.row} onPress={() => setSubSheet('level')}>
            <Ionicons name="notifications-outline" size={20} color={theme.colors.textSecondary} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('guildMenu.notifications')}</Text>
              <Text style={styles.rowSubtext}>{levelLabel}</Text>
            </View>
          </Pressable>
        </View>

        {/* R14 §3.1 — üçüncü grup: iki bastırma anahtarı (yeni bileşen yok, RN Switch) */}
        <View style={[styles.group, styles.groupSpaced]}>
          <View style={styles.row}>
            <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('guildMenu.suppressEveryone')}</Text>
              <Text style={styles.rowSubtext}>{t('guildMenu.suppressEveryoneHint')}</Text>
            </View>
            <Switch
              value={suppressEveryone}
              onValueChange={(v) => void onToggleSuppress('suppressEveryone', v)}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accent500 }}
              accessibilityLabel={t('guildMenu.suppressEveryone')}
            />
          </View>
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('guildMenu.suppressEvents')}</Text>
              <Text style={styles.rowSubtext}>{t('guildMenu.suppressEventsHint')}</Text>
            </View>
            <Switch
              value={suppressEvents}
              onValueChange={(v) => void onToggleSuppress('suppressEvents', v)}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accent500 }}
              accessibilityLabel={t('guildMenu.suppressEvents')}
            />
          </View>
          {/* R15 — üçüncü anahtar: rol bahsetmelerini sustur (web ile aynı metin) */}
          <View style={styles.row}>
            <Ionicons name="pricetag-outline" size={20} color={theme.colors.textSecondary} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('guildMenu.suppressRoleMentions')}</Text>
              <Text style={styles.rowSubtext}>{t('guildMenu.suppressRoleMentionsHint')}</Text>
            </View>
            <Switch
              value={suppressRoleMentions}
              onValueChange={(v) => void onToggleSuppress('suppressRoleMentions', v)}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accent500 }}
              accessibilityLabel={t('guildMenu.suppressRoleMentions')}
            />
          </View>
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </ScrollView>

      {subSheet === 'mute' && (
        <SelectSheet
          title={t('guildMenu.mute')}
          options={getMuteDurationOptions()}
          selected=""
          onSelect={onMuteDurationSelect}
          onClose={() => setSubSheet('none')}
        />
      )}

      {subSheet === 'level' && (
        <SelectSheet
          title={t('guildMenu.notifications')}
          options={getNotificationLevelOptions()}
          selected={level}
          onSelect={onLevelSelect}
          onClose={() => setSubSheet('none')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap, paddingBottom: theme.layout.panelGap * 2 },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
  },
  groupSpaced: { marginTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: theme.layout.inputMinHeight,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  rowSubtext: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginTop: 12,
  },
});
