import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { dmApi } from '@/api/dm';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { MessageScreen } from '@/components/MessageScreen';
import { ProfileCardModal } from '@/components/ProfileCardModal';
import { ChatBackButton } from '@/components/ChatBackButton';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §5 ekran 3 — DM mesaj ekranı: kanal ekranıyla "aynısı" (MessageScreen ortak
// gövde) + başlıkta karşı tarafın adı/avatarı (dokunuş → salt okunur profil kartı, yalnız 1-1 DM'de
// — grup DM'de tek bir "karşı taraf" yok). Sidebar'dan gelen `canMessage`/`selfBlocked` T&S
// durumunu input yerine görünür bir uyarıya çevirir (contract §6 — sessizce gizlenmez).
//
// Sprint M1b contract §3.6 — profil kartı artık aksiyon taşıyor (engelle/arkadaşlıktan çıkar);
// `canMessage`/`selfBlocked` bu yüzden route param'ından SABİT okunmuyor, yerel override state'e
// alındı — engelleme/engel-kaldırma bu ekrandan ayrılmadan giriş kutusunu anında kapatıp açabilsin
// (DoD #9: "Engelledikten sonra DM giriş kutusu kapanıyor").
export default function DmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    avatarUrl?: string;
    otherUserId?: string;
    kind?: 'dm' | 'group';
    canMessage?: string;
    selfBlocked?: string;
    /** M1h — sabitlenenler ekranından "mesaja git" (kanal ekranındaki `jumpTo` ile aynı yol). */
    jumpTo?: string;
  }>();
  const [showProfile, setShowProfile] = useState(false);
  const channelId = params.id;
  const isDm = params.kind !== 'group';

  // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-07-30, M1d-0 turu): bayraklar ROUTE PARAMETRESİNDEN
  // okunuyordu — yani listeden açıldığı ANDAKİ değerden. Engeli başka bir ekrandan (yeni
  // Engellenenler ekranı) kaldırınca parametre bayat kalıyor ve giriş kutusu kapalı kalıyordu.
  // Bugüne kadar görünmemesinin sebebi: engel kaldırmanın tek yolu bu ekrandaki profil kartıydı,
  // oradan kaldırınca yerel bir tazeleme çalışıyordu. İkinci yol açılınca kusur ortaya çıktı.
  // Doğru kaynak store: `dm` store'u sunucudan gelen `canMessage`/`selfBlocked`'ı taşıyor ve her
  // `fetchAll` ile tazeleniyor. Route parametresi yalnız store'da kanal yokken (derin link) yedek.
  const storeChannel = useDmStore((s) => s.channels.find((c) => c.id === params.id));
  const myUserId = useAuthStore((s) => s.user?.id);

  /**
   * Sprint M2d §3.2 — bahsetme öneri kaynağı. Grup DM'de üyeler store'daki kanal kaydından gelir;
   * 1-1 DM'de tek kişilik liste (store yoksa route param'ından — derin link yedeği, başlıkla
   * aynı kaynak). Kendini bahsetmek anlamsız olduğu için listede kendi hesabın YOK; grup üyeleri
   * sunucudan zaten "ben hariç" gelmiyor, o yüzden burada süzülmez — 1-1'de zaten karşı taraf tek.
   */
  const mentionCandidates = useMemo(() => {
    if (storeChannel?.type === 'GROUP_DM') {
      // Kendin listede yok — sunucu kendi bahsetmeni yok sayıyor (kanal ekranındaki not).
      return storeChannel.members
        .filter((m) => m.id !== myUserId)
        .map((m) => ({
          id: m.id,
          username: m.username,
          avatarUrl: m.avatarUrl,
        }));
    }
    if (storeChannel?.type === 'DM') {
      const u = storeChannel.otherUser;
      return [{ id: u.id, username: u.username, avatarUrl: u.avatarUrl }];
    }
    if (params.otherUserId && params.title) {
      return [{ id: params.otherUserId, username: params.title, avatarUrl: params.avatarUrl ?? null }];
    }
    return [];
  }, [storeChannel, myUserId, params.otherUserId, params.title, params.avatarUrl]);

  // M1d-0 R1 (sahip kararı 2026-07-31) — başlıktaki kanka ekle ikonu **KALDIRILDI**. 2026-07-30'da
  // eklenmişti çünkü o gün profil kartında ekleme yoktu; R1-d kartı eklemeyi getirince başlık ikonu
  // ikinci kapıya dönüştü. Kart bu ekranda her zaman erişilebilir (başlıktaki ada dokunmak açıyor),
  // yani yetenek kaybolmadı — yalnız tek kapıya indi. Yetenek kaybı olsaydı kaldırılmazdı.
  // M1d-C §2.2 (sahip kararı 2026-08-01) — "Sohbeti Temizle" ve grup yönetimi başlıktan KALKTI.
  // Başlığın sağ üstü sesli/görüntülü aramaya ayrıldı ve o gelene kadar BOŞ duruyor (yer tutucu
  // ikon konmaz). Aksiyonlar kaybolmadı: DM listesinde satıra uzun basınca açılan panele taşındı.

  // Sözleşme §8.3 — bu DM açıkken gelen mesaj listede "okunmadı" işaretlenmez (web `activeDmChannelId`
  // ile aynı); ayrıca açılışta kutucuğun rozeti hemen düşer (sunucuya `markRead` MessageScreen'den
  // gidiyor, bu yalnız listenin yerel yansıması — bir sonraki `fetchAll`'ı beklemeden).
  useEffect(() => {
    if (!channelId) return;
    const store = useDmStore.getState();
    store.setActiveDm(channelId);
    store.clearUnread(channelId);
    return () => useDmStore.getState().setActiveDm(null);
  }, [channelId]);

  if (!channelId) return null;

  const title = params.title ?? '';

  /** Engelle/engel-kaldır sonrası gerçek durumu sunucudan tazele. Artık yerel override YOK —
   *  store tazelenince ekran kendiliğinden yeni bayrakları okur (T&S disiplini: `canMessage`
   *  backend otoritesinde; istemci ne gevşetir ne kendi kafasına göre hesaplar). */
  async function refreshDmStatus() {
    await useDmStore.getState().fetchAll();
  }

  const canMessage =
    storeChannel && storeChannel.type === 'DM' ? storeChannel.canMessage : params.canMessage !== 'false';
  const selfBlocked =
    storeChannel && storeChannel.type === 'DM' ? storeChannel.selfBlocked : params.selfBlocked === 'true';

  const disabledNotice = isDm && !canMessage ? (selfBlocked ? t('dm.selfBlocked') : t('dm.cannotMessage')) : null;

  const placeholder = isDm ? t('dm.placeholder', { user: title }) : t('dm.groupPlaceholder', { name: title });

  /** Başlığa dokunuş: 1-1'de profil kartı, grupta grup ekranı (sözleşme §2.2). */
  function onTitlePress() {
    if (isDm) setShowProfile(true);
    else router.push({ pathname: '/group/[id]', params: { id: channelId } });
  }

  return (
    <>
      <Stack.Screen
        options={{
          // Sprint M2a §4.4 — kanal ekranıyla aynı: native geri ok gizlenir, `ChatBackButton`
          // toplam ping rozetini taşır. 1-1 DM ve grup DM'nin ikisi de bu ekrandan açılıyor
          // (`kind` param'ı), rozet ikisinde de aynı.
          headerBackVisible: false,
          headerLeft: () => <ChatBackButton />,
          headerTitle: () => (
            <Pressable onPress={onTitlePress} style={styles.headerTitle}>
              {params.avatarUrl ? (
                <Image source={{ uri: params.avatarUrl }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                  <Text style={styles.headerAvatarText}>{title.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.headerName} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
          ),
        }}
      />
      <MessageScreen
        channelId={params.id}
        placeholder={placeholder}
        // Sprint M2d §3.2 — bahsetme kaynağı: 1-1 DM'de karşı taraf, grup DM'de grup üyeleri.
        // Ekstra istek YOK, ikisi de zaten elde. `@everyone` verilmez (guild yok).
        mentionCandidates={mentionCandidates}
        jumpToMessageId={params.jumpTo}
        markRead={dmApi.markRead}
        typingMode="simple"
        disabledNotice={disabledNotice}
        // 1-1 DM'de arama YOK (sahip kararı 2026-08-01); grup DM'de kalıyor — orada birden çok
        // kişi ve daha uzun geçmiş var, aramanın işi görülüyor. Web'de de aynı ayrım yapıldı.
        searchable={!isDm}
        // 🔴 DM ve grup DM'de sabitleme **her üyeye açık** — sunucu `requirePinAccess` bu iki
        // kanal türünde ek kontrol yapmıyor, üyelik yeterli. Ortam kanalındaki `MANAGE_MESSAGES`
        // şartı buraya taşınmaz; olmayan bir kapıyı istemcide kurmak da gevşetmek kadar yanlış.
        canPin
        onOpenPins={() =>
          router.push({
            pathname: '/pins',
            params: { channelId: params.id, name: title, origin: 'dm' },
          })
        }
      />
      {showProfile && isDm && params.otherUserId && (
        <ProfileCardModal
          userId={params.otherUserId}
          username={title}
          avatarUrl={params.avatarUrl ?? null}
          onClose={() => setShowProfile(false)}
          onChanged={refreshDmStatus}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerAvatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  headerName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  clearErrorBar: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  clearErrorText: {
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
});
