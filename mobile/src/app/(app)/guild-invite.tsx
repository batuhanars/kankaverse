import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { guildsApi } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Paylaşılan davet linki — **web ile birebir aynı format** (`InvitePeopleModal.vue`:
 * `origin + /invite/:code`). Mobil yeni bir link formatı UYDURMAZ; iki istemci aynı linki üretir,
 * yoksa aynı davetin iki farklı görüntüsü ortaya çıkar.
 *
 * Kök `EXPO_PUBLIC_WEB_URL` (M1c'de yasal sayfalar için eklenmişti) — `EXPO_PUBLIC_API_URL` ile
 * KARIŞTIRILMAZ: davet linki insanın tarayıcıda açacağı adrestir, API adresi değil.
 */
function inviteLink(code: string): string {
  const base = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');
  return `${base}/invite/${code}`;
}

// Sprint M1d contract §2.4 — davet üret & paylaş. Yalnız OWNER/ADMIN'e açılır; bu ekrana giden
// düğme ChannelSidebar'da zaten yetkiye göre render ediliyor (yetkisize disabled düğme gösterilmez).
// Sunucu da aynı kapıyı tutuyor (403) — istemci gating yalnız UX.
//
// `maxUses`/`expiresInHours` BİLİNÇLİ sorulmuyor (§2.4): iki opsiyonel alan için form açmak,
// davetin önündeki sürtünmeyi ürünün kendisinden büyütür. Sınırlı davet gerekiyorsa web'de var.
export default function GuildInviteScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  /**
   * 🔴 Sahip bulgusu 2026-07-31 — ekrana her girişte YENİ kod üretiliyordu.
   *
   * İki ayrı sorun: (1) kullanıcı paylaştığı kodun değiştiğini görüyor, elindeki link "eskiyor"
   * hissi veriyor; (2) her açılış veritabanına bir davet satırı daha yazıyordu — sessiz çöp.
   * Davet kalıcı bir nesnedir, ekranı açmak onu yenilemek anlamına gelmez.
   *
   * Doğru akış: önce mevcut aktif daveti getir, varsa onu göster; yoksa üret. Kod yalnız kullanıcı
   * "yeni kod oluştur" derse değişir.
   *
   * `listInvites` `MANAGE_GUILD`, `createInvite` `CREATE_INVITE` istiyor → listeleyemeyen ama
   * üretebilen kullanıcı mümkün. O yüzden liste hatası ÖLÜMCÜL SAYILMAZ, üretmeye düşülür
   * (aksi hâlde davet üretme yetkisi olan kullanıcı ekranı hiç açamazdı).
   */
  const loadInvite = useCallback(() => {
    guildsApi
      .listInvites(params.id)
      .then((invites) => {
        // Sunucu süresi dolmuş / hakkı bitmiş davetleri zaten eliyor — ilkini almak yeterli.
        if (invites.length > 0) {
          setCode(invites[0].code);
          setState('ready');
          return null;
        }
        return guildsApi.createInvite(params.id).then((invite) => {
          setCode(invite.code);
          setState('ready');
          return null;
        });
      })
      .catch(() =>
        guildsApi
          .createInvite(params.id)
          .then((invite) => {
            setCode(invite.code);
            setState('ready');
          })
          .catch((e) => {
            setErrorMessage(extractErrorMessage(e));
            setState('error');
          }),
      );
  }, [params.id]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  function retry() {
    setState('loading');
    loadInvite();
  }

  /** Kodu bilinçli olarak yenile. Eski davet İPTAL EDİLMEZ (sunucuda ayrı bir işlem) — bu düğme
   *  "yeni bir kod daha üret" demektir, "eskisini geçersiz kıl" demez. */
  function regenerate() {
    setState('loading');
    setCopied(false);
    guildsApi
      .createInvite(params.id)
      .then((invite) => {
        setCode(invite.code);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }

  async function onCopy() {
    await Clipboard.setStringAsync(inviteLink(code));
    setCopied(true);
  }

  async function onShare() {
    try {
      await Share.share({ message: inviteLink(code) });
    } catch {
      // Kullanıcı paylaşım sayfasını kapattıysa hata sayılmaz — sessiz geç.
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: params.name ?? t('guild.joinTitle') }} />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && (
        <View style={styles.body}>
          <Text style={styles.label}>{t('invite.codeLabel')}</Text>
          <View style={styles.codeBox}>
            <Text style={styles.code} selectable>
              {code}
            </Text>
          </View>
          <Text style={styles.linkPreview} numberOfLines={1}>
            {inviteLink(code)}
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={onCopy} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {copied ? t('invite.copied') : t('invite.copy')}
              </Text>
            </Pressable>
            <Pressable onPress={onShare} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('mobile.friends.share')}</Text>
            </Pressable>
          </View>

          <Text style={styles.note}>{t('invite.noExpiry')}</Text>

          <Pressable onPress={regenerate} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>{t('invite.createButton')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
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
  codeBox: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    letterSpacing: 2,
  },
  linkPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  secondaryButton: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  note: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  linkButton: {
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
});
