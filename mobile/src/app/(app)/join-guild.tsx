import { useEffect, useState } from 'react';
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
import { guildsApi, extractInviteCode, type InvitePreviewDto } from '@/api/guilds';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';
import { InviteAcceptCard } from '@/components/InviteAcceptCard';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1d contract §2.2 — "Ortama Katıl". Bu sprintin varlık sebebi: mobilde ortama katılmanın
// hiçbir yolu yoktu.
//
// 🔴 T&S sınırı (sözleşme §4): katılma kapıları SUNUCUDA (Sprint 7A, R7'den geçti) —
// `adultsOnly && isMinor` → AGE_RESTRICTED, ban → GUILD_BANNED, zaten-üye → ALREADY_MEMBER.
// Bu ekran o kararları yeniden hesaplamaz, gevşetmez, taklit etmez. `adultsOnly` rozeti bir KAPI
// DEĞİL bilgilendirmedir: "minörsen Katıl'ı gizle" YAPILMAZ — yaş kararı sunucunun ve istemcide
// yaş durumu tutmak yeni bir sızıntı yüzeyidir.
export default function JoinGuildScreen() {
  const router = useRouter();
  // Sözleşme §2.6 revizesi — `GUILD_INVITE` bildirimi bu ekrana kodu HAZIR getirir.
  //
  // 🔴 Ekranın İKİ MODU var (sahip kararı 2026-08-01, web paritesi):
  //  • **Davetiye modu** (kod parametreyle geldi): web `InviteAcceptView` düzeni — altıgen baş
  //    harfler + ortam adı + 18+ rozeti + tek "Katıl". **Kod kutusu GÖSTERİLMEZ:** kod zaten
  //    biliniyor, kullanıcıya bildiği bir şeyi düzenlettirmek gereksiz sürtünme. Web de bu yolda
  //    input göstermiyor (kod URL'den gelir).
  //  • **Kod girişi modu** (ray "+" → Katıl): eski davranış, kullanıcı kodu/linki yapıştırır.
  const params = useLocalSearchParams<{ code?: string }>();
  const initialCode = typeof params.code === 'string' ? params.code : '';
  const inviteMode = !!initialCode;

  const [input, setInput] = useState(initialCode);
  const [preview, setPreview] = useState<InvitePreviewDto | null>(null);
  // Kod hazır geldiyse önizleme ANINDA başlar → spinner ilk render'da açık doğar. Bu değer effect
  // içinde senkron set EDİLMİYOR (react-hooks/set-state-in-effect), başlangıç değeri olarak veriliyor.
  const [previewing, setPreviewing] = useState(!!initialCode);
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Önizleme hatası ile KATILMA hatası ayrı tutulur. Tek bayrağa bindirilseydi, davetiye
  // geçerliyken sunucu katılmayı reddettiğinde (AGE_RESTRICTED / GUILD_BANNED) ekran "davet
  // geçersiz"e düşerdi — sebebi yanlış anlatan bir yalan olurdu. Ret sebebi kartın içinde,
  // sunucunun Türkçe mesajıyla gösterilir (sözleşme §4: metin uydurulmaz).
  const [previewFailed, setPreviewFailed] = useState(false);

  const code = extractInviteCode(input);

  // Bildirimden gelindiyse önizlemeyi kullanıcıya tekrar dokundurtmadan çöz. Effect gövdesi
  // setState'i senkron çağırmaz — yalnız isteği başlatır, sonuç .then/.catch'te yazılır
  // (home.tsx'teki `fetchGuilds` ile aynı desen).
  useEffect(() => {
    if (!initialCode) return;
    guildsApi
      .previewInvite(extractInviteCode(initialCode))
      .then(setPreview)
      .catch((e) => {
        setPreviewFailed(true);
        setErrorMessage(extractErrorMessage(e));
      })
      .finally(() => setPreviewing(false));
  }, [initialCode]);

  function onChange(value: string) {
    setInput(value);
    // Girdi değişince eski önizleme/hata yanıltmasın.
    setPreview(null);
    setErrorMessage('');
  }

  async function onPreview() {
    if (!code || previewing) return;
    setPreviewing(true);
    setErrorMessage('');
    try {
      const result = await guildsApi.previewInvite(code);
      setPreview(result);
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function onJoin() {
    if (!code || joining) return;
    setJoining(true);
    setErrorMessage('');
    try {
      const guild = await guildsApi.joinByInvite(code);
      goToGuild(guild.id);
    } catch (e) {
      // DoD-A/3: ALREADY_MEMBER (409) hata gibi GÖSTERİLMEZ. Kullanıcı zaten oradaysa amacına
      // ulaşmış demektir; onu hata ekranında bırakmak yerine ortama götürürüz. Sunucu bu durumda
      // guildId dönmediği için listeden ada göre değil, ana ekrana dönüp listeyi tazeleyerek
      // buluyoruz (aşağıdaki `goToHome` ray'i yeniler; ortam zaten üyesi olduğumuz için gelir).
      if (extractErrorCode(e) === 'ALREADY_MEMBER') {
        goToHome();
        return;
      }
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setJoining(false);
    }
  }

  function goToGuild(guildId: string) {
    // Ray'i tazelemek ve yeni ortamı seçmek ana ekranın işi (sözleşme §6: yeni store açılmaz).
    router.replace({ pathname: '/(app)/(tabs)/home', params: { joinedGuildId: guildId } });
  }

  function goToHome() {
    router.replace({ pathname: '/(app)/(tabs)/home', params: { refreshGuilds: '1' } });
  }

  const canSubmit = code.length > 0 && !joining;

  // ── Davetiye modu: web `InviteAcceptView`in mobil karşılığı ────────────────────────────────
  if (inviteMode) {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: t('guild.joinTitle') }} />
        <InviteAcceptCard
          preview={preview}
          loading={previewing}
          // Geçersizlik YALNIZ önizlemeden gelir; katılma reddi (18+/yasak) buraya girmez, yoksa
          // ekran "davet geçersiz" diyerek sebebi yanlış anlatırdı.
          invalid={previewFailed || (preview !== null && !preview.valid)}
          errorMessage={errorMessage}
          joining={joining}
          onJoin={onJoin}
          onGoHome={goToHome}
        />
      </View>
    );
  }

  // ── Kod girişi modu: ray "+" → Ortama Katıl ────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('guild.joinTitle') }} />

      <View style={styles.body}>
        <Text style={styles.description}>{t('guild.modal.joinDesc')}</Text>

        <Text style={styles.label}>{t('invite.codeLabel')}</Text>
        <TextInput
          value={input}
          onChangeText={onChange}
          onBlur={onPreview}
          onSubmitEditing={onPreview}
          placeholder={t('invite.codePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />

        {previewing && <ActivityIndicator color={theme.colors.textMuted} style={styles.previewSpinner} />}

        {/* Önizleme sunucudan YALNIZ üç alan alır (guildName / adultsOnly / valid) — ikon, üye
            sayısı, açıklama yok (sözleşme §0). Olmayan alan için yer ayrılmadı. */}
        {preview && preview.valid && (
          <View style={styles.previewCard}>
            <Text style={styles.previewName} numberOfLines={2}>
              {preview.guildName}
            </Text>
            {preview.adultsOnly && (
              <View style={styles.adultsBadge}>
                <Text style={styles.adultsBadgeText}>{t('invite.adultsOnlyBadge')}</Text>
              </View>
            )}
          </View>
        )}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          onPress={onJoin}
          disabled={!canSubmit}
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        >
          {joining ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('guild.joinButton')}</Text>
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
    gap: 10,
  },
  description: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 6,
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
  previewSpinner: {
    marginTop: 6,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  previewName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  adultsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.danger,
  },
  adultsBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
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
