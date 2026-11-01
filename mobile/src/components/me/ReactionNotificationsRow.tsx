import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { usersApi } from '@/api/users';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * C46 §6.4 — "Tepki bildirimleri" anahtarı (`reactionNotifications`, varsayılan açık).
 * `dm-privacy.tsx` anahtarlarıyla aynı yol: `PATCH /users/me`, dönen kullanıcı store'a yazılır.
 * Hata sessiz geri döner (anahtar eski değerinde kalır; kritik olmayan tercih).
 */
export function ReactionNotificationsRow() {
  const enabled = useAuthStore((s) => s.user?.reactionNotifications ?? true);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    if (saving || next === enabled) return;
    setSaving(true);
    try {
      const updated = await usersApi.updateProfile({ reactionNotifications: next });
      useAuthStore.setState({ user: updated });
    } catch {
      // sessiz: store değişmedi, anahtar eski konumuna döner
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.row}>
      <Ionicons name="heart-outline" size={20} color={theme.colors.textSecondary} />
      <Text style={styles.label}>{t('settings.reactionNotifications.label')}</Text>
      <Switch
        value={enabled}
        onValueChange={toggle}
        disabled={saving}
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
    paddingHorizontal: theme.layout.panelGap,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  label: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
});
