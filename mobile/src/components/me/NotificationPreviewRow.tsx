import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { cacheNotificationDefaults } from '@/notifications/notificationDefaults';
import { loadHidePreview, saveHidePreview } from '@/notifications/previewSetting';

/**
 * D94 — "Bildirimlerde mesaj içeriğini göster" (cihaza özel, varsayılan açık). Sunucuya gitmez; kayıt
 * AsyncStorage'da, native yedek çizim için de önbelleğe yazılır. Kapalıyken bildirimde yalnız gönderen
 * ve "Yeni mesaj" görünür.
 */
export function NotificationPreviewRow() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let alive = true;
    void loadHidePreview().then((hide) => {
      if (alive) setShow(!hide);
    });
    return () => {
      alive = false;
    };
  }, []);

  function toggle(next: boolean) {
    setShow(next);
    void saveHidePreview(!next);
    void cacheNotificationDefaults(!next);
  }

  return (
    <View style={styles.row}>
      <Ionicons name="eye-outline" size={20} color={theme.colors.textSecondary} />
      <View style={styles.texts}>
        <Text style={styles.label}>{t('mobile.notifications.showPreviewLabel')}</Text>
        <Text style={styles.desc}>{t('mobile.notifications.showPreviewDesc')}</Text>
      </View>
      <Switch
        value={show}
        onValueChange={toggle}
        trackColor={{ true: theme.colors.accent500, false: theme.colors.bgRail }}
        thumbColor={theme.colors.textPrimary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingVertical: 8,
    paddingHorizontal: theme.layout.panelGap,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  texts: { flex: 1, gap: 2 },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  desc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
});
