import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Redirect, useRouter, type Href } from 'expo-router';
import { channelsApi, ChannelType } from '@/api/channels';
import { dmApi } from '@/api/dm';
import { useAuthStore } from '@/stores/auth';
import { useShareIntentStore } from '@/stores/shareIntent';
import { dmRouteParams } from '@/utils/dmRoute';
import {
  forgetChannel,
  getLastTarget,
  setPendingTarget,
  setResumedGuild,
} from '@/utils/resumeLastScreen';
import { t } from '@/i18n';
import { theme } from '@/theme';

// C38 — soğuk açılışta bir kez denenir (çıkış/giriş sonrası Index yeniden mount olursa tekrarlanmaz).
let resumeAttempted = false;
const RESUME_TIMEOUT_MS = 10000;
// Süreç başlangıcı (modül yüklenme anı): önceki oturumdan kalan bayat bildirim yanıtını ayıklamak için.
const PROCESS_START_MS = Date.now();
const STALE_RESPONSE_MS = 60_000;

/** Bu süreçte (yakın zamanda) verilmiş bir bildirim yanıtı var mı? Bayat yanıt kaydı ENGELLEMEZ. */
function freshNotificationResponse(): { present: boolean; stale: boolean } {
  const last = Notifications.getLastNotificationResponse();
  if (!last) return { present: false, stale: false };
  const raw = last.notification.date;
  const ms = raw < 1e12 ? raw * 1000 : raw; // saniye ya da ms gelebilir
  const stale = ms < PROCESS_START_MS - STALE_RESPONSE_MS;
  return { present: true, stale };
}

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
  console.log(`[resume] record=${last ? last.kind : 'none'}`);
  if (!last) return null;
  try {
    if (last.kind === 'dm') {
      const dm = (await dmApi.listChannels()).find((c) => c.id === last.channelId);
      if (!dm) {
        console.log('[resume] result=forget (dm not in list)');
        await forgetChannel(userId, last.channelId);
        return null;
      }
      console.log('[resume] result=ok dm');
      return { href: dmRouteParams(dm) };
    }
    const ch = (await channelsApi.listByGuild(last.guildId)).find((c) => c.id === last.channelId);
    if (!ch || ch.type !== ChannelType.GUILD_TEXT || ch.locked) {
      console.log('[resume] result=forget (channel missing/not text/locked)');
      await forgetChannel(userId, last.channelId);
      return null;
    }
    console.log('[resume] result=ok channel');
    return {
      href: {
        pathname: '/channel/[id]',
        params: { id: ch.id, name: ch.name ?? '', guildId: last.guildId },
      },
      guildId: last.guildId,
    };
  } catch (e) {
    const status = httpStatus(e);
    console.log(`[resume] result=${status === 403 || status === 404 ? 'forget' : 'network'} status=${status ?? 'none'}`);
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
  const notif = freshNotificationResponse();
  if (status === 'authenticated' && !resumeAttempted) {
    console.log(
      `[resume] gate userId=${userId ? 'yes' : 'no'} notifPresent=${notif.present} notifStale=${notif.stale}${notif.present ? ` notifDate=${String(Notifications.getLastNotificationResponse()?.notification.date)}` : ''}`,
    );
  }
  // C41 - Paylaşımla açılış açık hedeflidir (C38 §0.7): "kaldığın yerden aç" uygulanmaz.
  const sharePending = useShareIntentStore((s) => s.payload !== null);
  const mayResume =
    status === 'authenticated' &&
    !!userId &&
    !resumeAttempted &&
    !sharePending &&
    !(notif.present && !notif.stale);

  useEffect(() => {
    if (status === 'authenticated' && sharePending) resumeAttempted = true;
  }, [status, sharePending]);

  useEffect(() => {
    if (!mayResume || !userId) return;
    resumeAttempted = true;
    console.log(
      `[resume] start mayResume=true notifPresent=${notif.present} notifStale=${notif.stale}`,
    );
    setResuming(true);
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), RESUME_TIMEOUT_MS),
    );
    void Promise.race([resolveTarget(userId), timeout]).then((result) => {
      const target = result === 'timeout' ? null : result;
      if (result === 'timeout') console.log('[resume] result=timeout');
      // Yarışı kaldır: burada YALNIZ /home'a replace. Hedef tek seferlik tüketilen değişkene konur,
      // home.tsx odaklanınca (navigasyon hazır) push eder.
      // C41 - çözümleme sürerken paylaşım geldiyse hedef YOK SAYILIR (/share'i ezmesin); yine de
      // /home'a replace edilir ki (app) layout mount olup paylaşıma yönlendirsin.
      const shareArrived = useShareIntentStore.getState().payload !== null;
      setResumedGuild(shareArrived ? null : (target?.guildId ?? null));
      setPendingTarget(shareArrived ? null : (target?.href ?? null));
      router.replace('/home');
      console.log(`[resume] replaced home, pendingTarget=${target ? 'set' : 'none'}`);
    });
    // notif yalnız log için; effect'i yeniden kurmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
