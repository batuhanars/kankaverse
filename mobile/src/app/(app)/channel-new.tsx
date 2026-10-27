import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChannelType, channelsApi } from '@/api/channels';
import { extractErrorMessage } from '@/api/errors';
import { EmojiNameInput } from '@/components/EmojiNameInput';
import { t } from '@/i18n';
import { isChannelNameSubmittable, normalizeChannelName, normalizeChannelNameLive } from '@/utils/channelName';
import { theme } from '@/theme';

// Sprint M1d-B contract §10.1 + §11 — kanal oluştur. Ortam adı alt panelinden açılır.
//
// Sprint M4c §7 — tür seçici (Metin/Ses) GELDİ. M1d-B'de bilinçli yoktu: ses kanalı oluşturulsaydı
// kullanıcı kendi yarattığı kanalı GÖREMEZDİ (M1a `GUILD_TEXT` süzgeci). M4c bu kısıtı kaldırdı
// (§2), seçici artık anlamlı.
//
// Sorulan iki alan erişim kararıdır: `isPrivate` (görünür ama kilitli) ve `ageGated` (T&S kapısı,
// Sprint 4A `AGE_RESTRICTED`). Sonradan bulunması zor ayarı kurma anında sormak doğrudur. İkisi de
// tür-bağımsız (metin/ses ayrımı yapmadan sorulur — web'de de aynı). Sorulmayanlar varsayılanla
// gider: slowMode · userLimit · bitrate · mediaEnabled (§10 — bunlar OLUŞTURMA'da hiç yok, yalnız
// DÜZENLEME'ye ertelendi, mobil düzenleme ekranı da henüz bunları taşımıyor).
export default function NewChannelScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string; categoryId?: string }>();
  const [name, setName] = useState('');
  const [type, setType] = useState<typeof ChannelType.GUILD_TEXT | typeof ChannelType.GUILD_VOICE>(
    ChannelType.GUILD_TEXT,
  );
  const [isPrivate, setIsPrivate] = useState(false);
  const [ageGated, setAgeGated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Girdi YAZARKEN normalize edilir (sözleşme §11 Tuzak 1) — kullanıcıya reddedilecek bir şey
  // yazdırıp sonra hata göstermek yerine geçerli olanı yazdırırız.
  function onChangeName(value: string) {
    setName(normalizeChannelNameLive(value));
    setErrorMessage('');
  }

  // C21: kayıtta baş/son tire temizlenir; en az 2 karakter + bir harf/rakam (kesin karar sunucuda).
  const finalName = normalizeChannelName(name);
  const canSubmit = isChannelNameSubmittable(finalName) && !creating;

  async function onCreate() {
    if (!canSubmit) return;
    setCreating(true);
    setErrorMessage('');
    try {
      await channelsApi.create(params.guildId, {
        name: finalName,
        type,
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
        <EmojiNameInput
          value={name}
          onChangeText={onChangeName}
          placeholder={t('channel.namePlaceholder')}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={onCreate}
        />

        {/* Sözleşme §7 — tür seçici, varsayılan Metin (bugünkü davranış korunur). */}
        <Text style={styles.label}>{t('channel.channelTypeLabel')}</Text>
        <View style={styles.typeRow}>
          <Pressable
            onPress={() => setType(ChannelType.GUILD_TEXT)}
            style={[styles.typeChip, type === ChannelType.GUILD_TEXT && styles.typeChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: type === ChannelType.GUILD_TEXT }}
          >
            <Text
              style={[
                styles.typeChipText,
                type === ChannelType.GUILD_TEXT && styles.typeChipTextActive,
              ]}
            >
              {t('channel.channelTypeText')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setType(ChannelType.GUILD_VOICE)}
            style={[styles.typeChip, type === ChannelType.GUILD_VOICE && styles.typeChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: type === ChannelType.GUILD_VOICE }}
          >
            <Text
              style={[
                styles.typeChipText,
                type === ChannelType.GUILD_VOICE && styles.typeChipTextActive,
              ]}
            >
              {t('channel.channelTypeVoice')}
            </Text>
          </Pressable>
        </View>

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
  // Sözleşme §7 — Metin/Ses seçici (segmented chip; mobilde ayrı bir Select primitive'i yok,
  // `guildMenu`/`SelectSheet` deseninden daha ağır olurdu — iki seçenek için gereksiz).
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipActive: {
    borderColor: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
  },
  typeChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: theme.colors.accent500,
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
