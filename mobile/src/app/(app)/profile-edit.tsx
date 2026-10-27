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
import { BannerSheet } from '@/components/me/BannerSheet';
import {
  ANIMATED_GIF_MAX_BYTES,
  AnimatedPickError,
  pickProfileMedia,
  type PickedProfileMedia,
  type ProfileMediaMode,
} from '@/utils/animatedMedia';
import { AnimatedClipSheet, type ClipMedia } from '@/components/me/AnimatedClipSheet';
import { MediaSourceSheet } from '@/components/me/MediaSourceSheet';
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
  // Sunucudaki hâli — "değişiklik var mı" bunun karşılaştırmasıyla anlaşılır. Kaydettikten sonra
  // da güncellenir, yoksa düğme kaydedilmiş metin için aktif kalmaya devam ederdi.
  const [savedBio, setSavedBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<MediaSlot | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [bannerSheet, setBannerSheet] = useState(false);
  // C13: seçilen görsel/GIF/video konumlandırma-kesit panelinde.
  const [clip, setClip] = useState<{ media: ClipMedia; slot: MediaSlot } | null>(null);
  // C22: "Değiştir" önce seçim sayfasını açar; slot sayfa kapanınca da kalır (seçici/kaldırma sonradan çalışır).
  const [sourceSlot, setSourceSlot] = useState<MediaSlot>('avatar');
  const [sourceOpen, setSourceOpen] = useState(false);
  const animatedAllowed = useAuthStore((s) => s.user?.animatedAllowed === true);

  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      usersApi
        .getCard(userId)
        .then((c) => {
          setCard(c);
          setBio(c.bio ?? '');
          setSavedBio(c.bio ?? '');
        })
        .catch((e) => setErrorMessage(extractErrorMessage(e)));
    }, [userId]),
  );

  /** Kaydedilecek bir değişiklik var mı — Kaydet düğmesinin aktifliği buna bağlı. */
  const dirty = bio.trim() !== savedBio.trim();

  async function onSaveBio() {
    if (saving || !dirty) return;
    setSaving(true);
    setErrorMessage('');
    setSavedNotice('');
    try {
      const trimmed = bio.trim();
      await usersApi.updateProfile({ bio: trimmed });
      setSavedBio(trimmed);
      setSavedNotice(t('settings.bioSaved'));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function openSource(slot: MediaSlot) {
    if (uploading) return;
    setSourceSlot(slot);
    setSourceOpen(true);
  }

  /** Seç (görsel ya da GIF/video, sayfadaki seçeneğe göre) → konumlandırma / kesit paneli. */
  async function onPick(mode: ProfileMediaMode) {
    setSourceOpen(false);
    setErrorMessage('');
    setSavedNotice('');

    let image: PickedProfileMedia | null;
    try {
      image = await pickProfileMedia(mode);
    } catch (e) {
      if (e instanceof AnimatedPickError) setErrorMessage(t(e.key));
      return;
    }
    if (!image) return;
    if (image.kind === 'gif' && image.size > ANIMATED_GIF_MAX_BYTES) {
      setErrorMessage(t('profile.animated.errorGifSize'));
      return;
    }
    setClip({ media: image, slot: sourceSlot });
  }

  /** Mevcut görseli kaldırır (sunucu hareketli alanı da temizler). */
  async function onRemove() {
    const slot = sourceSlot;
    setSourceOpen(false);
    setErrorMessage('');
    setUploading(slot);
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

  /** Kesit paneli başarıyla bitti: kart + (avatarsa) oturum kullanıcısı tazelenir. */
  async function onClipDone(slot: MediaSlot) {
    setClip(null);
    if (userId) setCard(await usersApi.getCard(userId).catch(() => card));
    if (slot === 'avatar') await refreshUser().catch(() => {});
  }

  /**
   * Afiş rengi preset'i (`null` → marka varsayılanı). Renk seçilince **yüklenmiş afiş görseli
   * kaldırılır**: görsel varsa renk zaten görünmezdi, kullanıcı seçtiği rengin işe yaramadığını
   * sanırdı. Web'de de renk yalnız görsel yokken geçerli (`bannerImage.hint`).
   */
  async function onPickBannerColor(key: string | null) {
    setBannerSheet(false);
    setErrorMessage('');
    setUploading('banner');
    try {
      if (card?.bannerUrl) await usersApi.setBanner(null);
      await usersApi.updateProfile({ bannerColor: key });
      if (userId) setCard(await usersApi.getCard(userId));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setUploading(null);
    }
  }

  if (!user) return null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      {/* Kaydet SAĞ ÜSTTE (sahip talebi 2026-08-01, Discord düzeni) — sayfanın dibinde değil.
          Gerekçe: biyografi uzayınca düğme ekranın altına kayıyordu, kaydetmek için aşağı inmek
          gerekiyordu. Başlıkta sabit duruyor.
          🔴 Yalnız BİYOGRAFİYİ kaydeder: avatar/afiş/renk seçildiği anda sunucuya yazılıyor —
          onlar için ikinci bir "kaydet" beklemek, yüklenmiş görselin kaydedilmemiş sanılmasına
          yol açardı. */}
      <Stack.Screen
        options={{
          title: t('mobile.profile.edit'),
          headerRight: () =>
            saving ? (
              <ActivityIndicator color={theme.colors.accent500} style={styles.headerAction} />
            ) : (
              // Değişiklik yokken PASİF + soluk. Gizlenmiyor: düğmenin varlığı "buradan
              // kaydedilir" bilgisini taşıyor, yokluğu kullanıcıyı arattırırdı. Aynı ayrım
              // panellerdeki "Okunmuş İşaretle" satırında da uygulandı (durum ≠ yetki).
              <Pressable onPress={onSaveBio} disabled={!dirty} hitSlop={10} style={styles.headerAction}>
                <Text style={[styles.headerActionText, !dirty && styles.headerActionDisabled]}>
                  {t('common.save')}
                </Text>
              </Pressable>
            ),
        }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <ProfileMediaFields
          username={user.username}
          card={card}
          uploading={uploading}
          // Afişte önce renk/görsel paneli, avatarda doğrudan kaynak seçim sayfası (C22).
          onEdit={(slot) => (slot === 'banner' ? setBannerSheet(true) : openSource('avatar'))}
        />

        {/* Biyografi */}
        <Text style={styles.label}>{t('settings.bioLabel')}</Text>
        <TextInput
          value={bio}
          onChangeText={(text) => {
            setBio(text.slice(0, BIO_MAX));
            // Yeniden yazmaya başlayınca eski "Profil güncellendi." bildirimi yanıltmasın.
            setSavedNotice('');
          }}
          placeholder={t('settings.bioPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.bioInput}
          multiline
        />
        <Text style={styles.counter}>{t('settings.bioCounter', { count: bio.length })}</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {savedNotice ? <Text style={styles.saved}>{savedNotice}</Text> : null}
      </ScrollView>

      <BannerSheet
        visible={bannerSheet}
        currentColor={card?.bannerColor ?? null}
        onClose={() => setBannerSheet(false)}
        onPickColor={onPickBannerColor}
        onPickImage={() => {
          setBannerSheet(false);
          openSource('banner');
        }}
      />
      <MediaSourceSheet
        visible={sourceOpen}
        title={t(sourceSlot === 'avatar' ? 'media.source.title.avatar' : 'media.source.title.banner')}
        animatedAllowed={animatedAllowed}
        canRemove={sourceSlot === 'avatar' ? !!card?.avatarUrl : !!card?.bannerUrl}
        onClose={() => setSourceOpen(false)}
        onPick={(mode) => void onPick(mode)}
        onRemove={() => void onRemove()}
      />
      <AnimatedClipSheet
        media={clip?.media ?? null}
        target={clip?.slot === 'banner' ? 'BANNER' : 'AVATAR'}
        onClose={() => setClip(null)}
        onDone={() => clip && void onClipDone(clip.slot)}
        onDisabled={() => {
          // Sunucu reddetti: sebebi söyle. Kapı artık sunucudan okunur (C22), tahmin yok.
          setClip(null);
          setErrorMessage(t('profile.animated.disabled'));
        }}
      />
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
  headerAction: {
    marginRight: 12,
  },
  headerActionText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  headerActionDisabled: {
    color: theme.colors.textMuted,
  },
});
