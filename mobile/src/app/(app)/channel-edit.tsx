import { useCallback, useState } from 'react';
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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChannelType, channelsApi, normalizeChannelName } from '@/api/channels';
import { categoriesApi, type CategoryDto } from '@/api/categories';
import { ChipSelect } from '@/components/guild/ChipSelect';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

const NAME_MIN = 2;

/**
 * Yavaş mod aralıkları — web'in i18n anahtarlarıyla birebir (`channel.slowMode*`). Serbest saniye
 * girişi yok: sunucu 0-21600 kabul ediyor ama kullanıcıya saniye yazdırmak web'de de yapılmadı.
 */
const SLOW_MODES = [
  { seconds: 0, key: 'channel.slowModeOff' },
  { seconds: 5, key: 'channel.slowMode5s' },
  { seconds: 10, key: 'channel.slowMode10s' },
  { seconds: 30, key: 'channel.slowMode30s' },
  { seconds: 60, key: 'channel.slowMode1m' },
  { seconds: 300, key: 'channel.slowMode5m' },
  { seconds: 900, key: 'channel.slowMode15m' },
] as const;

// Sprint M1d-B — kanalı adlandır / 18+ kapısını değiştir / sil.
//
// Sprint M1e (sahip talebi 2026-08-01, "kanal ayarlarının seçeneklerini artıralım): ekrana
// **kategori · özel kanal · yavaş mod** eklendi. Hepsi `UpdateChannelDto`da zaten vardı, mobil
// göndermiyordu.
//
// 🔴 Discord'da olup BİZDE OLMAYAN, o yüzden konmayanlar — kaynaktan doğrulandı:
//  • **Kanal Başlığı (topic):** `Channel` modelinde alan YOK.
//  • **Kanal İzinleri:** izin-geçersiz-kılma (permission overwrite) modeli YOK. Bizdeki karşılık
//    `isPrivate` (görünür ama kilitli) — bu ekranda var.
//  • **Bildirim Ayarları / Sabitlenmiş Mesajlar / Davetler / Entegrasyonlar:** ayrı yüzeyler,
//    biri kendi sözleşmesini bekliyor (bildirim), biri hiç yok (entegrasyon).
//  • **Etkin olmadığında gizle:** forum/alt-başlık kavramı bizde yok.
//
// `isPrivate` artık DEĞİŞTİRİLEBİLİYOR ama özel kanala üye ekleme/çıkarma hâlâ ayrı uçlarda
// (`/channels/:id/members`) ve ayrı yüzey ister; ekranda bu yüzden açıklaması yazıyor.
export default function ChannelEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    ageGated?: string;
    isPrivate?: string;
    slowModeSeconds?: string;
    categoryId?: string;
    guildId?: string;
    // M4g §3 — yalnız ses kanalı ayarlarını göstermek/göndermek için gerekli. Route parametresi;
    // kanal store'u yok (mobile/CLAUDE.md), o yüzden üç çağıran ekran bunu taşımak zorunda.
    type?: string;
    userLimit?: string;
    bitrate?: string;
    mediaEnabled?: string;
  }>();

  // 🔴 Fail-closed (M4g §3, M4c dersi): `type` taşınmazsa (eski/eksik bir çağıran yolu) ses
  // alanları hiç render edilmez ve hiç gönderilmez — bugünkü davranışa düşer. Yanlış kanala yanlış
  // kontrol göstermektense hiç göstermemek.
  const isVoiceChannel = params.type === ChannelType.GUILD_VOICE;

  const [name, setName] = useState(params.name ?? '');
  const [ageGated, setAgeGated] = useState(params.ageGated === 'true');
  const [isPrivate, setIsPrivate] = useState(params.isPrivate === 'true');
  const [slowMode, setSlowMode] = useState(Number(params.slowModeSeconds ?? '0') || 0);
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId || null);
  const [userLimit, setUserLimit] = useState(params.userLimit ?? '0');
  const [bitrate, setBitrate] = useState(params.bitrate ?? '64');
  const [mediaEnabled, setMediaEnabled] = useState(params.mediaEnabled === 'true');
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Kategori seçimi için liste; ortam bilinmiyorsa (eski giriş noktası) bölüm hiç render edilmez.
  useFocusEffect(
    useCallback(() => {
      if (!params.guildId) return;
      categoriesApi
        .listByGuild(params.guildId)
        .then((list) => setCategories([...list].sort((a, b) => a.position - b.position)))
        .catch(() => {});
    }, [params.guildId]),
  );

  const canSubmit = name.length >= NAME_MIN && !busy;

  async function onSave() {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await channelsApi.update(params.id, {
        name,
        ageGated,
        // 🔴 PM düzeltmesi (2026-08-08) — bu üçü ESKİDEN KOŞULSUZ gönderiliyordu ve çağıran ekran
        // parametreyi taşımadığında state varsayılana düşüyordu: `isPrivate` false, `slowMode` 0,
        // `categoryId` null. Sonuç, ana ekrandan bir ÖZEL kanalın ayarlarını açıp kaydetmek o kanalı
        // SESSİZCE herkese açıyordu (yavaş mod da sıfırlanıyor, kanal kategorisinden düşüyordu).
        // Artık dev'in ses alanları için kurduğu fail-closed desenin aynısı: parametre GELMEDİYSE
        // alan gönderilmez, sunucudaki değer olduğu gibi kalır. Çağıran ekranlar da artık taşıyor —
        // ama bu kapı, gelecekte yeni bir çağıran unuttuğunda da koruyor (M4c dersi).
        ...(params.isPrivate !== undefined && { isPrivate }),
        ...(params.slowModeSeconds !== undefined && { slowModeSeconds: slowMode }),
        ...(params.categoryId !== undefined && { categoryId }),
        // Fail-closed: `isVoiceChannel` false ise (type gelmedi ya da metin kanalı) bu üçü hiç
        // gönderilmez — bilinmeyen/metin kanalına varsayılan ses değeri yazılmaz.
        ...(isVoiceChannel && {
          userLimit: Math.min(99, Math.max(0, Math.floor(Number(userLimit) || 0))),
          bitrate: Math.min(96, Math.max(8, Math.floor(Number(bitrate) || 64))),
          mediaEnabled,
        }),
      });
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

        {/* Kategori — kanalı taşımak `categoryId` ile; "Kategorisiz" seçeneği null gönderir. */}
        {categories.length > 0 && (
          <>
            <Text style={styles.label}>{t('channel.categoryLabel')}</Text>
            <ChipSelect
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: null, label: t('channel.categoryNone') },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </>
        )}

        {/* Yavaş mod — web'deki hazır aralıklar (`channel.slowMode*`); serbest saniye girişi yok. */}
        <Text style={styles.label}>{t('channel.slowModeLabel')}</Text>
        <ChipSelect
          value={slowMode}
          onChange={setSlowMode}
          options={SLOW_MODES.map((s) => ({ value: s.seconds, label: t(s.key) }))}
        />
        <Text style={styles.hint}>{t('channel.slowModeDesc')}</Text>

        {/* M4g §2/§3 — yalnız ses kanalı: userLimit/bitrate/mediaEnabled `isVoiceChannel` iken
            render edilir (fail-closed, üstteki yoruma bkz). Girdi biçimi mevcut `name` TextInput'la
            aynı desen — yeni girdi altyapısı yazılmadı. */}
        {isVoiceChannel && (
          <>
            <Text style={styles.label}>{t('channel.userLimitLabel')}</Text>
            <TextInput
              value={userLimit}
              onChangeText={setUserLimit}
              placeholder={t('channel.userLimitPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <Text style={styles.hint}>{t('channel.userLimitHint')}</Text>

            <Text style={styles.label}>{t('channel.bitrateLabel')}</Text>
            <TextInput
              value={bitrate}
              onChangeText={setBitrate}
              style={styles.input}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <Text style={styles.hint}>{t('channel.bitrateHint')}</Text>

            {/* T&S (C7): açıklama metni gizlenmez/kısaltılmaz — mediaEnabledDesc olduğu gibi gösterilir. */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('channel.mediaEnabledLabel')}</Text>
                <Text style={styles.toggleDesc}>{t('channel.mediaEnabledDesc')}</Text>
              </View>
              <Switch
                value={mediaEnabled}
                onValueChange={setMediaEnabled}
                trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
              />
            </View>
          </>
        )}

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
        {/* Üye ekleme ayrı uçta ve ayrı yüzey ister — "özel yaptım ama kimseyi ekleyemiyorum"
            durumunu sessiz bırakmamak için sebebi yazılıyor. */}
        {isPrivate ? <Text style={styles.hint}>{t('channel.privateSaveHint')}</Text> : null}

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
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
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
