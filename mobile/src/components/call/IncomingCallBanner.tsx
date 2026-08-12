import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceStore } from '@/stores/voice';
import { acceptIncomingCall, rejectIncomingCall } from '@/notifications/incomingCall';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Gelen aramanın UYGULAMA İÇİ sunumu — uygulama ÖN PLANDAYKEN (sahip kararı 2026-08-12).
 *
 * Neden var: bildirim penceresini Android çiziyor, düğmesi/süresi/sırası bizim elimizde değil ve
 * uygulamanın üstünü kapatıyor. Uygulama zaten açıkken bunu kullanmak için sebep yok; Discord ve
 * WhatsApp da ön planda kendi arayüzünü, arka planda sistem bildirimini kullanıyor.
 *
 * Çift yüzey YOK: ön planda bildirimin banner'ı bastırılıyor (`push.ts`), yani ekranda yalnız bu
 * şerit kalıyor. Bildirim yine de kuruluyor çünkü zil sesi onun kanalından geliyor. Arka planda
 * ise tam tersi: şerit görünmez (uygulama ekranda değil), sunum sistem bildirimidir.
 * Sunum tercihi tek yerde, `presentIncomingCall`ta veriliyor.
 *
 * Kabul/reddet mantığı burada YOK: `acceptIncomingCall`/`rejectIncomingCall` bildirim düğmeleriyle
 * ORTAK (§14.1 grup kuralları dahil). Bu bileşen yalnız yüzey.
 *
 * Kökte mount ediliyor (`_layout.tsx`, `MiniCallWindow` ile aynı gerekçe): çağrı hangi ekranda
 * yakalanırsa yakalansın görünmeli, rotaya bağlı olamaz.
 */
export function IncomingCallBanner() {
  const insets = useSafeAreaInsets();
  const incoming = useVoiceStore((s) => s.incomingCall);

  if (!incoming) return null;

  const { channelId, callerName, avatarUrl, isGroup } = incoming;
  const title = isGroup ? t('mobile.call.incomingGroupTitle') : t('mobile.call.incomingTitle');
  const body = isGroup
    ? t('mobile.call.incomingGroupBody', { name: callerName })
    : t('mobile.call.incomingBody', { name: callerName });

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.row}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{callerName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.body} numberOfLines={1}>
            {body}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {/* Reddet solda, kabul sağda: telefon arayüzlerinin yerleşik dili. Renk de aynı dili
            konuşuyor — kırmızı reddetme, yeşil kabul (tasarım sisteminin danger/online token'ları,
            uydurulmuş renk yok). */}
        <Pressable
          onPress={() => rejectIncomingCall(channelId, isGroup)}
          style={[styles.button, styles.reject]}
          accessibilityRole="button"
          accessibilityLabel={t('call.reject')}
        >
          <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.buttonText}>{t('call.reject')}</Text>
        </Pressable>
        <Pressable
          onPress={() => acceptIncomingCall(channelId, callerName, isGroup)}
          style={[styles.button, styles.accept]}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.call.joinAction')}
        >
          <Ionicons name="call" size={18} color={theme.colors.textPrimary} />
          <Text style={styles.buttonText}>{t('mobile.call.joinAction')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    gap: 12,
    // `MiniCallWindow` (50) ile PiP (100) arasında: mini pencerenin üstünde durmalı (çağrı kararı
    // beklerken o balon önemsiz), PiP'in altında kalmalı (sistem PiP'inde kontrol gösterilmez).
    zIndex: 75,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  texts: {
    flexShrink: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // 28'lik `controlSm` bir dokunma hedefi için küçük; kabul/reddet yanlış basılamayacak kadar
    // büyük olmalı (D37 dersi: ≥44dp). `inputMinHeight` zaten 44, uydurma ölçü eklenmiyor.
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
  },
  reject: {
    backgroundColor: theme.colors.danger,
  },
  accept: {
    backgroundColor: theme.colors.online,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
