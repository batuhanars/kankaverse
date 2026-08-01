import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { usersApi, type UserCardDto } from '@/api/users';
import { authApi } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ProfileMediaFields, type MediaSlot } from '@/components/me/ProfileMediaFields';
import { MAX_IMAGE_BYTES, pickImage, putImage } from '@/utils/imageUpload';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Web'in `bioCounter` anahtarı 512 diyor; sunucu sınırı `UpdateProfileDto` ile aynı.
const BIO_MAX = 512;


/**
 * Sprint M1d-C §3.3 — Profili Düzenle.
 *
 * 🔴 **Görsel yükleme burada VAR** (sahip istisnası 2026-08-01). M1d §10.3'ün kuralı daraltıldı,
 * silinmedi: ortam ikonu/afişi mobilde hâlâ yalnız gösterilir; istisna kullanıcının kendi profili.
 *
 * Sorulmayan alanlar: kullanıcı adı (sunucu değiştirmeye kapalı — web `usernameReadonlyHint`),
 * afiş RENGİ (renk seçici ayrı bir iş, web'de var, mobilde ayrı karar), durum (sistem desteklemiyor).
 */
export default function ProfileEditScreen() {
  const user = useAuthStore((s) => s.user);

  /**
   * Avatar oturum kullanıcısında da duruyor (ray, başlıklar, mesaj satırları oradan okuyor) —
   * yüklemeden sonra tazelenmezse eski avatar ekranda kalırdı. Store'a yeni bir aksiyon
   * eklemek yerine mevcut `/auth/me` ucu kullanılıyor; kaynak yine sunucu.
   */
  async function refreshUser() {
    const fresh = await authApi.me();
    useAuthStore.setState({ user: fresh });
  }

  const [card, setCard] = useState<UserCardDto | null>(null);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<MediaSlot | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      usersApi
        .getCard(userId)
        .then((c) => {
          setCard(c);
          setBio(c.bio ?? '');
        })
        .catch((e) => setErrorMessage(extractErrorMessage(e)));
    }, [userId]),
  );

  async function onSaveBio() {
    if (saving) return;
    setSaving(true);
    setErrorMessage('');
    setSavedNotice('');
    try {
      await usersApi.updateProfile({ bio: bio.trim() });
      setSavedNotice(t('settings.bioSaved'));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  /** Seç → presign → PUT → PATCH. Her adımın hatası sunucunun mesajıyla gösterilir. */
  async function onPickAndUpload(slot: MediaSlot) {
    if (uploading) return;
    setErrorMessage('');
    setSavedNotice('');

    const image = await pickImage();
    if (!image) return;
    // Sunucu da reddeder ama kullanıcıyı yüklemeyi bekletip sonra reddetmek kötü tasarım.
    if (image.size > MAX_IMAGE_BYTES) {
      setErrorMessage(t('settings.avatar.errorSize'));
      return;
    }

    setUploading(slot);
    try {
      const presign =
        slot === 'avatar'
          ? await usersApi.presignAvatar(image.contentType)
          : await usersApi.presignBanner(image.contentType);
      await putImage(presign, image);
      if (slot === 'avatar') await usersApi.setAvatar(presign.storageKey);
      else await usersApi.setBanner(presign.storageKey);

      if (userId) setCard(await usersApi.getCard(userId));
      // Avatar oturum kullanıcısında da duruyor (rail/başlıklar oradan okuyor) → tazele.
      if (slot === 'avatar') await refreshUser().catch(() => {});
    } catch (e) {
      setErrorMessage(
        extractErrorMessage(e) ||
          (slot === 'avatar' ? t('settings.avatar.errorUpload') : t('settings.bannerImage.errorUpload')),
      );
    } finally {
      setUploading(null);
    }
  }

  async function onRemove(slot: MediaSlot) {
    if (uploading) return;
    setUploading(slot);
    setErrorMessage('');
    try {
      if (slot === 'avatar') await usersApi.setAvatar(null);
      else await usersApi.setBanner(null);
      if (userId) setCard(await usersApi.getCard(userId));
      if (slot === 'avatar') await refreshUser().catch(() => {});
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setUploading(null);
    }
  }

  if (!user) return null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('mobile.profile.edit') }} />

      <ScrollView contentContainerStyle={styles.body}>
        <ProfileMediaFields
          username={user.username}
          card={card}
          uploading={uploading}
          onPick={onPickAndUpload}
          onRemove={onRemove}
        />

        {/* Biyografi */}
        <Text style={styles.label}>{t('settings.bioLabel')}</Text>
        <TextInput
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, BIO_MAX))}
          placeholder={t('settings.bioPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.bioInput}
          multiline
        />
        <Text style={styles.counter}>{t('settings.bioCounter', { count: bio.length })}</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {savedNotice ? <Text style={styles.saved}>{savedNotice}</Text> : null}

        <Pressable onPress={onSaveBio} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>
          {saving ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('common.save')}</Text>
          )}
        </Pressable>
      </ScrollView>
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
    gap: 8,
    paddingBottom: theme.layout.panelGap * 2,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 12,
  },
  bioInput: {
    minHeight: 96,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    padding: 12,
    textAlignVertical: 'top',
  },
  counter: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'right',
  },
  secondaryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  linkButton: {
    paddingVertical: 6,
  },
  linkButtonText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  saved: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
  },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
