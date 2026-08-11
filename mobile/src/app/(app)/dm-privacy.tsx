import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { DmPolicy } from '@/api/auth';
import { usersApi } from '@/api/users';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * DM gizlilik ayarı — "kimler mesaj atabilir" (`dmPolicy`). Web'de `UserSettingsView.vue`
 * "Gizlilik" sekmesinde vardı, mobilde HİÇ yoktu (PM talimatı 2026-08-11, sprint dışı gizlilik
 * kontrolü parity işi — aktif M5 ses sözleşmesinin kapsamı dışında).
 *
 * Ekran mı sheet mi: `SelectSheet` (kanal detay mute süresi deseni) yerine tam ekran seçildi —
 * SelectSheet satırları yalnız `label` taşıyor, açıklama alanı yok. Bu üç seçenek arasındaki fark
 * (Herkes/Sadece Kankalar/Kimse — özellikle "Herkes" aslında mesaj isteği kutusuna düşüyor,
 * doğrudan sohbet açmıyor) açıklama metni olmadan yanlış anlaşılır; bu bir gizlilik ayarı, kullanıcı
 * ne seçtiğini görmeden seçmemeli. `event-form.tsx`'teki "seçenek kartı" deseni (icon+başlık+açıklama+
 * radyo) burada reuse edildi — SelectSheet'i açıklama alanı taşıyacak şekilde genişletmek yerine bu
 * yolu seçtim: SelectSheet'in tüm çağıranları (mute süresi, kanal seçimi) tek satırlık kısa etiketler
 * kullanıyor, o bileşene opsiyonel açıklama alanı eklemek bu tek çağıran için bileşeni karmaşıklaştırırdı.
 */
export default function DmPrivacyScreen() {
  const user = useAuthStore((s) => s.user);
  const [saving, setSaving] = useState<DmPolicy | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  // Web `UserSettingsView.vue` `currentPolicy` ile aynı düşme deseni (`?? DmPolicy.EVERYONE`) —
  // pratikte `dmPolicy` kayıt anında her zaman dolu (`auth.service.ts`), bu yalnız savunmacı.
  const currentPolicy = user?.dmPolicy ?? DmPolicy.EVERYONE;

  async function selectPolicy(policy: DmPolicy) {
    if (policy === currentPolicy || saving) return;
    setSaving(policy);
    setErrorMessage('');
    setSavedNotice('');
    try {
      const updated = await usersApi.updateProfile({ dmPolicy: policy });
      useAuthStore.setState({ user: updated });
      setSavedNotice(t('settings.dmPolicy.saved'));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  if (!user) return null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('settings.dmPolicy.label') }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hint}>{t('settings.dmPolicy.description')}</Text>

        <View style={styles.options}>
          {OPTIONS.map((opt) => {
            const isOn = opt.value === currentPolicy;
            const isSaving = saving === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => selectPolicy(opt.value)}
                disabled={saving !== null}
                style={[styles.optionCard, isOn && styles.optionCardOn]}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{t(opt.labelKey)}</Text>
                  <Text style={styles.optionDesc}>{t(opt.descKey)}</Text>
                </View>
                {isSaving ? (
                  <ActivityIndicator color={theme.colors.accent500} />
                ) : (
                  <Ionicons
                    name={isOn ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={isOn ? theme.colors.accent500 : theme.colors.textMuted}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {savedNotice ? <Text style={styles.saved}>{savedNotice}</Text> : null}
      </ScrollView>
    </View>
  );
}

const OPTIONS: { value: DmPolicy; labelKey: string; descKey: string }[] = [
  { value: DmPolicy.EVERYONE, labelKey: 'settings.dmPolicy.everyone', descKey: 'settings.dmPolicy.everyoneDesc' },
  { value: DmPolicy.FRIENDS, labelKey: 'settings.dmPolicy.friends', descKey: 'settings.dmPolicy.friendsDesc' },
  { value: DmPolicy.NONE, labelKey: 'settings.dmPolicy.none', descKey: 'settings.dmPolicy.noneDesc' },
];

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: {
    padding: theme.layout.panelGap * 1.5,
    paddingBottom: theme.layout.panelGap * 2,
    gap: 12,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  options: { gap: 8 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  optionCardOn: { borderColor: theme.colors.accent500, backgroundColor: theme.colors.accentSubtle },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  optionDesc: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  saved: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
  },
});
