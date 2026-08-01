import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { categoriesApi } from '@/api/categories';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sözleşme §11 — `CreateCategoryDto { name 1-50 }`. Kanal adının aksine kategori adında **desen
// kısıtı YOK** (büyük harf ve boşluk serbest) → burada normalize edilmez.
const NAME_MAX = 50;

// Sprint M1d-B — kategori oluştur / adlandır / sil. Tek ekran iki iş yapar: `id` parametresi varsa
// düzenleme, yoksa oluşturma. İki neredeyse aynı formu iki dosyaya bölmek erken soyutlama olurdu
// (kök CLAUDE.md "böl yalnız gerçek acıda").
export default function CategoryEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string; id?: string; name?: string }>();
  const isEdit = !!params.id;

  const [name, setName] = useState(params.name ?? '');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= NAME_MAX && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMessage('');
    try {
      if (isEdit) await categoriesApi.update(params.id!, trimmed);
      else await categoriesApi.create(params.guildId, trimmed);
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
      await categoriesApi.remove(params.id!);
      setConfirmDelete(false);
      router.back();
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: isEdit ? t('category.editTitle') : t('category.createTitle') }} />

      <View style={styles.body}>
        <Text style={styles.label}>{t('category.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('category.namePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          maxLength={NAME_MAX}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        >
          {busy && !confirmDelete ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isEdit ? t('category.renameButton') : t('category.createButton')}
            </Text>
          )}
        </Pressable>

        {/* Silme yalnız düzenleme kipinde. Kategori silmek kanalları SİLMEZ, kategorisiz yapar —
            onay metni (`category.deleteConfirm`) bunu zaten söylüyor, ayrıca açıklama yazılmadı. */}
        {isEdit && (
          <Pressable onPress={() => setConfirmDelete(true)} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>{t('category.deleteButton')}</Text>
          </Pressable>
        )}
      </View>

      {confirmDelete && (
        <ConfirmDialog
          message={t('category.deleteConfirm', { name: params.name ?? '' })}
          confirmLabel={t('category.deleteButton')}
          loading={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
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
    gap: 10,
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
