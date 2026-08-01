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
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

const NAME_MIN = 2;

// Sprint M1d-B — kanalı adlandır / 18+ kapısını değiştir / sil. Kanal satırına UZUN BASINCA açılır
// (yalnız yetkiliye; yetkisizde uzun basış hiçbir şey yapmaz).
//
// `PATCH /channels/:id` ad ve `ageGated` alıyor; ikisi de burada. `isPrivate` DEĞİŞTİRİLMİYOR:
// özel kanala üye ekleme/çıkarma ayrı uçlar (`/channels/:id/members`) ve ayrı bir yüzey ister —
// yarım bir "özel yaptım ama kimseyi ekleyemiyorum" durumu üretmemek için M1e'ye bırakıldı.
export default function ChannelEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string; ageGated?: string }>();

  const [name, setName] = useState(params.name ?? '');
  const [ageGated, setAgeGated] = useState(params.ageGated === 'true');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canSubmit = name.length >= NAME_MIN && !busy;

  async function onSave() {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await channelsApi.update(params.id, { name, ageGated });
      router.back();
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setErrorMessage('');
    try {
      await channelsApi.remove(params.id);
      setConfirmDelete(false);
      router.back();
    } catch (e) {
      // Son kanal silinemez → sunucu 409 LAST_CHANNEL döner. Mesaj olduğu gibi gösterilir,
      // istemci kendi açıklamasını uydurmaz (DoD-B/13: kullanıcı sebebini görür).
      setErrorMessage(extractErrorMessage(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('channel.editTitle') }} />

      <View style={styles.body}>
        <Text style={styles.label}>{t('channel.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(normalizeChannelName(v));
            setErrorMessage('');
          }}
          placeholder={t('channel.namePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSave}
        />

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
          onPress={onSave}
          disabled={!canSubmit}
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        >
          {busy && !confirmDelete ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('channel.renameButton')}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setConfirmDelete(true)} style={styles.dangerButton}>
          <Text style={styles.dangerButtonText}>{t('channel.deleteButton')}</Text>
        </Pressable>
      </View>

      {confirmDelete && (
        <ConfirmDialog
          message={t('channel.deleteConfirm', { name: params.name ?? '' })}
          confirmLabel={t('channel.deleteButton')}
          loading={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap, gap: 12 },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1, gap: 2 },
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
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  dangerButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  dangerButtonText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
});
