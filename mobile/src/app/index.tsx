import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Redirect, useRouter, type Href } from 'expo-router';
import { channelsApi, ChannelType } from '@/api/channels';
import { dmApi } from '@/api/dm';
import { useAuthStore } from '@/stores/auth';
import { dmRouteParams } from '@/utils/dmRoute';
import {
  forgetChannel,
  getLastTarget,
  setResumedGuild,
} from '@/utils/resumeLastScreen';
import { t } from '@/i18n';
import { theme } from '@/theme';

// C38 — soğuk açılışta bir kez denenir (çıkış/giriş sonrası Index yeniden mount olursa tekrarlanmaz).
let resumeAttempted = false;
const RESUME_TIMEOUT_MS = 5000;

interface ResumeTarget {
  href: Href;
  guildId?: string;
}

function httpStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Son sohbeti doğrular ve gidilecek rotayı kurar. Mevcut uçlar (DM listesi / ortam kanal listesi)
 * hem erişimi doğrular hem rota parametrelerini (başlık, kanal adı) çözer; kayıtta kimlikten başka
 * şey tutulmaz. Kesin "erişilemiyor" (403/404, listede yok, metin değil, kilitli) → kayıt silinir
 * ve null. Ağ hatası/zaman aşımında kayıt SİLİNMEZ (geçici), yine null (ana ekran).
 */
async function resolveTarget(userId: string): Promise<ResumeTarget | null> {
  const last = await getLastTarget(userId);
  if (!last) return null;
  try {
    if (last.kind === 'dm') {
      const dm = (await dmApi.listChannels()).find((c) => c.id === last.channelId);
      if (!dm) {
        await forgetChannel(userId, last.channelId);
        return null;
      }
      return { href: dmRouteParams(dm) };
    }
    const ch = (await channelsApi.listByGuild(last.guildId)).find((c) => c.id === last.channelId);
    if (!ch || ch.type !== ChannelType.GUILD_TEXT || ch.locked) {
      await forgetChannel(userId, last.channelId);
      return null;
    }
    return {
      href: {
        pathname: '/channel/[id]',
        params: { id: ch.id, name: ch.name ?? '', guildId: last.guildId },
      },
      guildId: last.guildId,
    };
  } catch (e) {
    const status = httpStatus(e);
    if (status === 403 || status === 404) await forgetChannel(userId, last.channelId);
    return null;
  }
}

// Ekran 1/3 (contract §8) — Açılış: logo + bootstrap sonucu. Kullanıcı etkileşimi yok, yalnız
// yönlendirme. bootstrap() kök layout'ta tetiklenir; burada yalnız status okunur.
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const [resuming, setResuming] = useState(false);

  // C38 — bildirimle açılışta kayıt YOK SAYILIR: bildirim yönlendirmesi (notifications/responseGate)
  // kendi hedefine gider, burada ikinci bir push çakışırdı. Sorgu render'da yapılır ki bildirim
  // açılışında ilk kare doğrudan /home Redirect'i versin (sıralama: önce bu kapı, sonra gate).
  const mayResume =
    status === 'authenticated' &&
    !!userId &&
    !resumeAttempted &&
    !Notifications.getLastNotificationResponse();

  useEffect(() => {
    if (!mayResume || !userId) return;
    resumeAttempted = true;
    setResuming(true);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), RESUME_TIMEOUT_MS));
    void Promise.race([resolveTarget(userId), timeout]).then((target) => {
      // Ana ekran altta kalır (geri tuşu ana ekrana döner, uygulamadan çıkmaz); üstüne sohbet itilir.
      setResumedGuild(target?.guildId ?? null);
      router.replace('/home');
      if (target) router.push(target.href);
    });
  }, [mayResume, userId, router]);

  if (status === 'authenticated' && !mayResume && !resuming) {
    return <Redirect href="/home" />;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/login" />;
  }

  // 'booting' ya da C38 çözümlemesi sürüyor: açılış ekranı.
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/brand/kankaverse-hexagon.png')}
        style={styles.brand}
        resizeMode="contain"
        accessibilityLabel={t('brand.name')}
      />
      <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgRail,
  },
  // Yazısız altıgen (marka imzası). Kaynak: web/src/assets/brand — mobil kopyası assets/brand altında.
  brand: {
    width: 96,
    height: 96,
  },
  spinner: {
    marginTop: theme.layout.panelGap,
  },
});
