import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { channelsApi } from '@/api/channels';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { rolesApi, type RoleDto } from '@/api/roles';
import { MessageScreen } from '@/components/MessageScreen';
import { ChatBackButton } from '@/components/ChatBackButton';
import { useGuildPermission } from '@/hooks/useGuildPermission';
import { useAuthStore } from '@/stores/auth';
import { useUnreadStore } from '@/stores/unread';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §5 ekran 2 — Kanal mesaj ekranı, AYRI TAM EKRAN (üstte geri oku — Stack
// varsayılanı). `name` sidebar'dan router param olarak taşınır (ayrı bir GET gerekmez).
export default function ChannelScreen() {
  // `jumpTo` — ortam içi aramadan gelen mesaj id'si (Sprint M1g R1). Yoksa davranış eskisi gibi.
  const { id, name, jumpTo, guildId } = useLocalSearchParams<{
    id: string;
    name?: string;
    jumpTo?: string;
    guildId?: string;
  }>();
  const router = useRouter();
  /**
   * Sprint M1h — sabitleme yetkisi. `guildId` yolla taşınıyor (kanal listesi zaten biliyor, ek
   * istek gerekmiyor); gelmezse yetki hesaplanamaz ve satır çizilmez — yanlış göstermektense
   * göstermemek.
   */
  const canPin = useGuildPermission(guildId, 'MANAGE_MESSAGES');

  /**
   * Sprint M2d §3.1 — bahsetme öneri kaynağı. Ekran açılışında BİR KEZ çekilir; `@` yazınca
   * istek atılmaz, süzme bellekte yapılır. Yeni store açılmadı (ekran seviyesi state yeterli,
   * `channel-details.tsx` deseni).
   *
   * 🔴 `guildId` yoksa hiç çekilmez: bu ekran bildirimler/arama/sabitlemeler yollarından
   * `guildId` OLMADAN da açılabiliyor (M2c'de belgelenen mevcut boşluk). O durumda öneri listesi
   * hiç açılmaz — yarım liste göstermek yanlış vaat olur.
   *
   * Hata sessiz: liste boş kalır, kullanıcıya hata gösterilmez. Mesaj yazmayı engelleyen bir
   * kusur değil, ekranın kendi mesaj hatası ayrı zaten.
   */
  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [everyoneRoleId, setEveryoneRoleId] = useState<string | null>(null);
  // 🔴 KUSUR 2 düzeltmesi (sahip bulgusu 2026-08-03, cihaz turu — push'tan açılan kanal): `name`
  // route param'ı sidebar'dan gelişte var (mevcut GET'i tekrar etmemek için taşınıyor), push yolu
  // yalnız `{ id, guildId }` taşıyor → başlık boş kalıyordu. Yeni uç YOK: `channel-details.tsx`
  // AYNI durumda zaten `channelsApi.listByGuild(guildId)` + id'ye göre bulma yolunu kullanıyor
  // (bkz. o dosyanın `loadChannel`'ı) — burada da o mevcut yol tekrar edildi, kopya değil aynı çağrı.
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  useEffect(() => {
    if (!guildId) return;
    guildsApi
      .getMembers(guildId)
      .then(setMembers)
      .catch(() => {});
    rolesApi
      .listByGuild(guildId)
      // Yalnız everyone rolü VE yalnız `mentionable` ise: kapı burada, web `MessageArea.vue` ikizi.
      .then((list) => {
        setRoles(list);
        const everyone = list.find((r) => r.isEveryone);
        setEveryoneRoleId(everyone?.mentionable ? everyone.id : null);
      })
      .catch(() => {});
  }, [guildId]);

  useEffect(() => {
    // `name` boş dize olarak da gelebilir (bildirimler/push yolu `name: ''` geçiyor) — `!name` ikisini
    // de yakalar. `name` doluysa (sidebar'dan gelişte) tekrar çekilmez, sözleşme "ekstra istek yok"
    // ilkesi burada da geçerli.
    if (!guildId || name) return;
    channelsApi
      .listByGuild(guildId)
      .then((list) => {
        const found = list.find((c) => c.id === id);
        if (found?.name) setResolvedName(found.name);
      })
      .catch(() => {});
  }, [guildId, name, id]);

  // 🔴 Kendin listede YOK (sahip sorusu 2026-08-03): sunucu kendi bahsetmeni zaten yok sayıyor
  // (`messages.gateway.ts` alıcı döngüsü yazarı atlıyor), yani o satır seçilse bile hiçbir bildirim
  // üretmiyor. Mobilde liste en fazla 8 satır; ölü satıra yer ayrılmaz.
  const myUserId = useAuthStore((s) => s.user?.id);
  /**
   * R15 — mesaj gövdesindeki `<@&id>` token'ı için rol adı çözücü. Bulunamazsa `undefined`
   * döner ve çizim "@rol" yedeğine düşer (silinmiş / henüz yüklenmemiş rol için ad uydurulmaz).
   */
  const resolveRole = useCallback(
    (roleId: string) => roles.find((r) => r.id === roleId)?.name,
    [roles],
  );

  /**
   * R15 — öneri listesine girecek roller (everyone HARİÇ; o ayrı öneri olarak zaten var).
   * Kapı kuralı burada uygulanır, sözleşme §2.2 + R2 revizyonu ile birebir: `mentionable`
   * roller herkese, `mentionable` olmayanlar HİÇ KİMSEYE önerilmez (izin baypası yok). Sunucu
   * aynı kapıyı bağımsız uyguluyor; buradaki süzgeç yalnız "seçemeyeceğin şeyi önerme" içindir.
   */
  const mentionRoles = useMemo(
    () =>
      roles
        .filter((r) => !r.isEveryone && r.mentionable)
        .map((r) => ({ id: r.id, username: r.name, isRole: true, color: r.color })),
    [roles],
  );

  const mentionCandidates = useMemo(
    () =>
      members
        .filter((m) => m.userId !== myUserId)
        .map((m) => ({ id: m.userId, username: m.username, avatarUrl: m.avatarUrl })),
    [members, myUserId],
  );

  // Sprint M2a §4.5/DoD — kanalı açınca ilgili rozet ANINDA düşer. Sunucuya `markRead` zaten
  // `MessageScreen` mount'unda gidiyor (contract §5); bu yalnız yerel `unread` store'un aynı anda
  // temizlenmesi — aksi halde rail/kanal listesi bir sonraki REST tazelemesine kadar bayat kalırdı.
  useEffect(() => {
    if (id && guildId) useUnreadStore.getState().clearChannel(id, guildId);
  }, [id, guildId]);

  if (!id) return null;
  // KUSUR 2 — `name` yoksa (push/bildirim yolu) yukarıdaki `resolvedName`'e düş; o da yoksa (henüz
  // çekilmedi ya da `guildId` hiç yok) boş kalır — mevcut "yanlış göstermektense göstermeme" kuralı.
  const channelName = name || resolvedName || '';

  // Sprint M2c contract §3 — başlık dokunulabilir + chevron, `channel-details` rotasına gider.
  // 🔴 Yalnız `guildId` param'ı DOLUYSA: bu ekran bazı girişlerden (bildirimler/arama/sabitlemeler)
  // `guildId` OLMADAN da açılabiliyor (kanal listesindeki DTO orada yok) — o durumda chevron
  // koymak "boş yüzey" olurdu (mobile/CLAUDE.md), rota `guildId`siz açılamaz. Ana giriş noktası
  // (kanal listesi → `home.tsx`) her zaman `guildId` taşıyor, DoD orada doğrulanır.
  function onTitlePress() {
    if (!guildId) return;
    router.push({ pathname: '/channel-details', params: { channelId: id, guildId } });
  }

  return (
    <>
      <Stack.Screen
        options={{
          // Sprint M2a §4.4 — native geri ok gizlenir, yerine toplam ping rozeti taşıyan
          // `ChatBackButton` konur. Dokunuş davranışı değişmez.
          headerBackVisible: false,
          headerLeft: () => <ChatBackButton />,
          headerTitle: () =>
            guildId ? (
              <Pressable onPress={onTitlePress} style={styles.headerTitle} accessibilityRole="button">
                <Text style={styles.headerTitleText} numberOfLines={1}>
                  {channelName ? `#${channelName}` : ''}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ) : (
              <Text style={styles.headerTitleText} numberOfLines={1}>
                {channelName ? `#${channelName}` : ''}
              </Text>
            ),
        }}
      />
      <MessageScreen
        channelId={id}
        placeholder={t('message.inputPlaceholder', { channel: channelName })}
        markRead={channelsApi.markRead}
        typingMode="named"
        jumpToMessageId={jumpTo}
        canPin={canPin}
        // M3b §3.2 — profil alt-panelinin rol rozetleri için ortam bağlamı. Bu ekran `guildId`
        // olmadan da açılabiliyor (bildirim/arama yolu); o durumda panel Roller bölümünü çizmez.
        guildId={guildId}
        mentionCandidates={mentionCandidates}
        mentionRoles={mentionRoles}
        everyoneRoleId={everyoneRoleId}
        resolveRole={resolveRole}
        onOpenPins={() =>
          router.push({ pathname: '/pins', params: { channelId: id, name: name ?? '' } })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitleText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
});
