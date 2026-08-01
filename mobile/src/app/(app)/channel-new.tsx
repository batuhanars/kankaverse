import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { channelsApi, normalizeChannelName } from '@/api/channels';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sözleşme §11 sabiti — `create-channel.dto.ts`: @MinLength(2) @MaxLength(50).
const NAME_MIN = 2;

// Sprint M1d-B contract §10.1 + §11 — kanal oluştur. Ortam adı alt panelinden açılır.
//
// 🔴 Tür seçici (Metin/Ses) BİLİNÇLİ YOK: uç `GUILD_VOICE`i destekliyor ama mobil ses kanallarını
// listelemiyor (M1a `GUILD_TEXT` süzgeci) → ses kanalı oluşturulsaydı kullanıcı kendi yarattığı
// kanalı GÖREMEZDİ. Discord'un seçicisi bu yüzden kopyalanmadı; M4 ses fazına ertelendi.
//
// Sorulan iki alan erişim kararıdır: `isPrivate` (görünür ama kilitli) ve `ageGated` (T&S kapısı,
// Sprint 4A `AGE_RESTRICTED`). Sonradan bulunması zor ayarı kurma anında sormak doğrudur.
// Sorulmayanlar varsayılanla gider: slowMode · userLimit · bitrate · mediaEnabled.
export default function NewChannelScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string; categoryId?: string }>();
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [ageGated, setAgeGated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Girdi YAZARKEN normalize edilir (sözleşme §11 Tuzak 1) — kullanıcıya reddedilecek bir şey
  // yazdırıp sonra hata göstermek yerine geçerli olanı yazdırırız.
  function onChangeName(value: string) {
    setName(normalizeChannelName(value));
    setErrorMessage('');
  }

  const canSubmit = name.length >= NAME_MIN && !creating;

  async function onCreate() {
    if (!canSubmit) return;
    setCreating(true);
    setErrorMessage('');
    try {
      await channelsApi.create(params.guildId, {
        name,
        categoryId: params.categoryId ?? null,
        isPrivate,
        ageGated,
      });
      router.back();
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('channel.createTitle') }} />

      <View style={styles.body}>
        <Text style={styles.label}>{t('channel.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={onChangeName}
          placeholder={t('channel.namePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onCreate}
        />

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>{t('channel.privateLabel')}</Text>
            <Text style={styles.toggleDesc}>{t('channel.privateDesc')}</Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>{t('channel.ageGatedLabel')}</Text>
            <Text style={styles.toggleDesc}>{t('channel.ageGatedDesc')}</Text>
          </View>
          <Switch
            value={ageGated}
            onValueChange={setAgeGated}
            trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
          />
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          onPress={onCreate}
          disabled={!canSubmit}
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        >
          {creating ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('channel.createButton')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  body: {
    padding: theme.layout.panelGap,
    gap: 12,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  toggleDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
