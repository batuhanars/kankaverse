import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { useUnreadStore } from '@/stores/unread';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotificationLevel } from '@/api/notifications';
import { badgeLabel } from '@/utils/badgeLabel';
import { useVoicePresenceStore, type VoicePresenceParticipant } from '@/stores/voicePresence';
import { useVoiceStore } from '@/stores/voice';
import { t } from '@/i18n';
import { theme } from '@/theme';

const EMPTY_PRESENCE: VoicePresenceParticipant[] = [];

interface Props {
  channel: ChannelSummaryDto;
  selected: boolean;
  onPress: () => void;
  /** Sprint M2a §4.5 — artık HER üyeye geçilir (panel "Okundu İşaretle" taşıyor); yönetim
   *  maddeleri panelin İÇİNDE `canManage`'e göre koşullu (bkz. `ChannelMenuSheet`). */
  onLongPress?: () => void;
}

// Sprint M1d-B — `ChannelSidebar`'dan çıkarıldı: gruplu render + collapse eklenince sidebar 300
// satır eşiğini aştı (kök CLAUDE.md sinyali). Satırın kendi state'i yok, saf sunum.
//
// Sprint M2a §2/§4.2 — görsel dil web'e hizalandı: KIRMIZI artık yalnız BAHSETME (`unreadMentionCount`),
// genel okunmamış (`unreadCount`) parlaklıkla anlatılır (ad + ikon `#`). Eski kırmızı `unreadCount`
// rozeti KALDIRILDI. Sayaçlar merkezi `unread` store'dan okunur (canlı — bkz. realtime/socket.ts);
// REST'ten gelen `channel.unreadCount/unreadMentionCount` yalnız store boş olduğunda (ilk render,
// hydrate henüz işlenmeden) yedek değer.
export function ChannelRow({ channel, selected, onPress, onLongPress }: Props) {
  const isVoice = channel.type === ChannelType.GUILD_VOICE;

  const unread = useUnreadStore((s) => s.channels[channel.id]?.unread ?? channel.unreadCount);
  const mentions = useUnreadStore((s) => s.channels[channel.id]?.mentions ?? channel.unreadMentionCount);
  // Sprint M2b §3/§5 R1-3 — CHANNEL kaydı varsa TAMAMEN o kazanır, yoksa GUILD'e düşer (resolvePref
  // ile aynı sıra, bkz. stores/notificationPrefs.ts). Susturma TAM SESSİZLİKtir: parlaklık VE bahsetme
  // rozeti ikisi de susturulmuşken gizlenir; susturulmamışken parlaklık yalnız ALL'da, bahsetme
  // rozeti yalnız NONE'da gizlenir. Ayrıca susturulmuş kanal BÜTÜN satır sönük görünür (§1 IN/6).
  const level = useNotificationPrefsStore((s) =>
    s.effectiveLevel('CHANNEL', channel.id, channel.guildId),
  );
  const muted = useNotificationPrefsStore((s) =>
    s.effectiveMuted('CHANNEL', channel.id, channel.guildId),
  );
  // Sprint M4c §2 — ses kanalının mesajı yok, okunmamış/bahsetme rozeti ASLA gösterilmez (server
  // zaten 0 döner, ama `isVoice` koruması "hangisi doğru sıfır" varsayımına bağlı kalmaz).
  const showUnread = !isVoice && unread > 0 && level === NotificationLevel.ALL && !muted;
  const showMentionBadge = !isVoice && mentions > 0 && level !== NotificationLevel.NONE && !muted;

  // Sprint M4c §6 — "kanalda kim var" (web `VoiceParticipantList` pariteti, iki katman): BU
  // kanala LiveKit ile bağlıyken canlı `voice.ts` (`roomParticipants`/mute anlık), değilken WS
  // presence anlık görüntüsü (`voicePresence.ts`) — presence snapshot'ında mute bilgisi hiç yok
  // (sunucu yalnız kim-var döner), bu yüzden mikrofon rozeti YALNIZ bağlı olduğumuz kanalda çıkar.
  useEffect(() => {
    if (!isVoice) return;
    useVoicePresenceStore.getState().subscribe(channel.id);
    return () => useVoicePresenceStore.getState().unsubscribe(channel.id);
  }, [isVoice, channel.id]);

  const presence = useVoicePresenceStore((s) =>
    isVoice ? (s.byChannel[channel.id] ?? EMPTY_PRESENCE) : EMPTY_PRESENCE,
  );
  const connectedHere = useVoiceStore((s) => isVoice && s.connectedChannelId === channel.id);
  const localMuted = useVoiceStore((s) => s.isMuted);
  const remoteMutedIds = useVoiceStore((s) => s.mutedUserIds);
  const roomParticipants = useVoiceStore((s) => s.roomParticipants);
  const members: { userId: string; username: string; avatarUrl: string | null; isLocal?: boolean }[] =
    connectedHere ? roomParticipants : presence;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.rowContent}>
        {isVoice ? (
          <Ionicons
            name="volume-medium-outline"
            // `#` ile ayni fontSize.lg (16) optik olarak KUCUK duruyordu: hash kalin (600) ve yogun,
            // outline ikon ince cizgili. Ikonlar yanindaki metinle dengelenmek icin bir tik buyuk olur.
            size={19}
            style={styles.voiceIcon}
            color={selected ? theme.colors.accent500 : theme.colors.textSecondary}
          />
        ) : (
          <Text
            style={[
              styles.hash,
              showUnread && styles.hashUnread,
              selected && styles.hashSelected,
              muted && styles.mutedText,
            ]}
          >
            #
          </Text>
        )}
        <Text
          style={[
            styles.name,
            showUnread && styles.nameUnread,
            selected && styles.nameSelected,
            muted && styles.mutedText,
          ]}
          numberOfLines={1}
        >
          {channel.name}
        </Text>
        {/* Sprint M4c §8 — item 6 pariteti: özel kanal HERKESE görünür, kilit rozeti "giremezsin"i
            sessizce gizlemez (T&S — R7). Yalnız kilit İKONU; dokununca ne olacağı `home.tsx`'in işi. */}
        {channel.locked && (
          <Ionicons
            name="lock-closed"
            size={12}
            style={styles.lockIcon}
            color={theme.colors.textMuted}
          />
        )}
        {/* 🔴 Sahip cihaz turu 2026-08-08 — web pariteti: "18+" YAZISI KALDIRILDI, yerine amber uyarı
            üçgeni. Gerekçe webde de yazılı (`ChannelPanel.vue`): kilit ikonu "giremezsin" der, üçgen
            "dikkat" der; "18+" yazısı ise içeride ayrı bir şey varmış havası veriyordu. Kilit
            (`channel.locked`) özel kanalın ikonu, bu ondan AYRI ve karıştırılmamalı. */}
        {channel.ageGated && (
          <Ionicons
            name="warning"
            size={12}
            style={styles.ageIcon}
            color={theme.colors.warning}
            accessibilityLabel={t('channel.ageRestrictedLockTitle')}
          />
        )}
        {showMentionBadge && (
          <View style={styles.mentionBadge}>
            <Text style={styles.mentionBadgeText}>{badgeLabel(mentions)}</Text>
          </View>
        )}
      </View>

      {isVoice && members.length > 0 && (
        <View style={styles.presenceList}>
          {members.map((p) => {
            const micOff = connectedHere && (p.isLocal ? localMuted : remoteMutedIds.has(p.userId));
            return (
              <View key={p.userId} style={styles.presenceRow}>
                {p.avatarUrl ? (
                  <Image source={{ uri: p.avatarUrl }} style={styles.presenceAvatar} />
                ) : (
                  <View style={[styles.presenceAvatar, styles.presenceAvatarFallback]}>
                    <Text style={styles.presenceAvatarFallbackText}>
                      {p.username.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.presenceName} numberOfLines={1}>
                  {p.username}
                </Text>
                {micOff && <Ionicons name="mic-off" size={11} color={theme.colors.danger} />}
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Sözleşme §8.1-A/1 — 40dp dokunma hedefi + 2dp ritim boşluğu; ayırıcı çizgi YOK
  // (Discord da ritim+dolgu ile ayırır).
  // Sprint M4c §6 — ses satırı iki kat oldu (satır + altında kim-var listesi), `row` bu yüzden
  // sütuna döndü; asıl satır içeriği `rowContent`e taşındı (metin kanalında tek satır, davranış
  // aynı — yalnız bir sarmalayıcı katman eklendi).
  row: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 2,
    borderRadius: theme.radius.md,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSelected: { backgroundColor: theme.colors.bgElevated },
  hash: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.lg,
    marginRight: 7,
    fontWeight: '600',
  },
  // Sprint M4c §2 — ses kanalı ikonu (`#`in yerini alır), web `ChannelPanel.vue:1185` pariteti.
  voiceIcon: {
    marginRight: 7,
  },
  // Sprint M4c §8 — özel kanal kilit rozeti (item 6 pariteti).
  lockIcon: {
    marginLeft: 4,
  },
  hashSelected: { color: theme.colors.accent500 },
  // Sprint M2a §4.2 — kanal ikonu (`#`) de okunmamışta parlıyor, isimle AYNI kural.
  hashUnread: { color: theme.colors.textPrimary, fontWeight: '700' },
  // Sprint M2b §1 IN/6 — susturulmuş kanal listede sönük (Discord: "susturulmuş kanallar gri
  // görünür"). Stil dizisinde EN SONDA: susturulmuşsa parlaklık/seçili renginin üzerine yazar.
  mutedText: { color: theme.colors.textMuted },
  name: {
    flex: 1,
    color: theme.colors.textBody,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  nameUnread: { color: theme.colors.textPrimary, fontWeight: '700' },
  nameSelected: { color: theme.colors.textPrimary, fontWeight: '600' },
  // Yaş-kapılı kanal ikonu — `lockIcon` ile aynı ölçü/aralık, yalnız rengi uyarı tonunda.
  ageIcon: {
    marginRight: 6,
  },
  // Sprint M2a §2/§4.2 — eski `unreadBadge` (genel okunmamış, kırmızı) yerine BAHSETME sayacı.
  mentionBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionBadgeText: {
    // Gömülü '#fff' değil: danger zemin üzerinde okunur token.
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  // Sprint M4c §6 — "kanalda kim var" (web `VoiceParticipantList` pariteti, sade sürüm: yalnız
  // avatar + ad + mikrofon rozeti — #1/#2/#3 R11 moderasyon yüzeyleri §10 kapsam dışı).
  presenceList: {
    marginTop: 2,
    paddingLeft: 30, // ikonun hizasından biraz içeri (web `pl-8` pariteti)
    gap: 2,
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presenceAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  presenceAvatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceAvatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 9,
    fontWeight: '700',
  },
  presenceName: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
});
