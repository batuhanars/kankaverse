import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sheetBottomPadding, useSheetInsets } from '@/components/home/sheetInsets';
import { useVoiceStore } from '@/stores/voice';
import { callInvite, groupCallRing } from '@/realtime/socket';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Panelin "Çaldır" satırlarında gösterilen kişi — 1-1 DM'de karşı taraf, grup DM'de kanal üyesi.
 *  `call.tsx` bunu DM store'daki kanal kaydından hesaplıyor (`DmParticipantDto` ile yapısal olarak
 *  aynı şekil); burada AYRI tiplendi — bu bileşen `api/dm`'e bağımlı olmasın diye (§2, saf sunum). */
export interface VoiceRingTarget {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Bağlı olduğumuz ses kanalı (`call.tsx`'in route parametresi). */
  channelId: string;
  callKind: 'dm' | 'group' | 'guild';
  /** Yalnız `callKind==='guild'` iken dolu — `call.tsx`teki `useVoiceStore` `guildId` alanı. */
  guildId: string | null;
  /** Başlık (ad) — DM'de karşı tarafın adı, grup DM'de grup adı, guild'de kanal adı. */
  title: string;
  /** Alt başlık — DM/grup DM'de odadakilerin adları, guild'de ortam adı. */
  subtitle: string;
  /** MANAGE_CHANNELS — yoksa "Kanal Ayarları" satırı HİÇ render edilmez. */
  canManageChannel: boolean;
  /** CREATE_INVITE — yoksa "Bir arkadaşını davet et" satırı HİÇ render edilmez. */
  canInvite: boolean;
  /** Seste olmayanlar — 1-1 DM'de karşı taraf yoksa tek elemanlı, grup DM'de kanalın katılmamış
   *  üyeleri, guild'de HER ZAMAN boş (sözleşme §6 — ortam kanalında çaldırma kapsam dışı). */
  pendingMembers: VoiceRingTarget[];
  /** Panel kendini kapatıp `OutputPickerSheet`i açması için — o Modal'ın state'i `call.tsx`te kalır. */
  onOpenOutput: () => void;
}

/**
 * Sprint M5a §2 — ses ekranının alt panel ("üç nokta"). Sheet altyapısı `OutputPickerSheet` /
 * `ParticipantModerationSheet` deseninin AYNISI (yeni bir Modal iskeleti YAZILMADI); ayrı bir rota
 * (tam ekran) AÇILMAZ, ses ekranının üstünde alt panel olarak açılır.
 *
 * Üç bağlam (1-1 DM · Grup DM · Ortam ses kanalı) TEK bileşende — sözleşme §2 tablosu hangi satırın
 * hangi bağlamda göründüğünü belirliyor. `canManageChannel`/`canInvite` yalnız guild'de true
 * gelebilir (çağıran taraf zaten `call.tsx`te `isGuildCall` ile kapılıyor, burada TEKRAR sorgulanmaz
 * — `ParticipantModerationSheet`in `canMute`/`canMove` deseniyle aynı iş bölümü).
 *
 * 🔴 Katılımcı satırına dokunma BİLEREK hiçbir şey açmaz (§2: "İki yüzeyden aynı işi açmak bu
 * sprintin işi değil") — moderasyon girişi bugünkü yerinde (sahnedeki kutucuk, M4h) kalır.
 */
export function VoiceContextSheet({
  visible,
  onClose,
  channelId,
  callKind,
  guildId,
  title,
  subtitle,
  canManageChannel,
  canInvite,
  pendingMembers,
  onOpenOutput,
}: Props) {
  const bottomInset = useSheetInsets();
  const router = useRouter();
  const participants = useVoiceStore((s) => s.roomParticipants);
  const mutedUserIds = useVoiceStore((s) => s.mutedUserIds);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  // Çaldırma isteği uçarken aynı satıra ikinci dokunuşu yutar (istek gitmeden önceki kısa kilit) VE
  // §4.6 ADDENDUM — başarılı çaldırmadan SONRA da satırı 60sn "Çalıyor…" durumunda tutar, düğmeyi
  // kapalı bırakır. Sunucudaki asıl kapı §4.3 (60sn/hedef hız sınırı); bu yalnız istemci tarafı
  // görünürlük katmanı. Yeni store alanı AÇILMADI (addendum: "basit tutulacak") — state bileşende.
  const [ringingIds, setRingingIds] = useState<Set<string>>(new Set());
  // Başarılı çaldırmalar için kurulan 60sn'lik zamanlayıcılar — bileşen unmount olurken (aramadan
  // çıkış) temizlenmezse RN'de sızan `setTimeout` olur (kural dosyası "klasik hata" der).
  const ringTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timeouts = ringTimeouts.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  // 🔴 Kapalıyken `Modal` HİÇ KURULMAZ — `OutputPickerSheet`teki AYNI Fabric gerekçesi (sahip cihaz
  // turu 2026-08-06, "child already has a parent").
  if (!visible) return null;

  async function handleRing(target: VoiceRingTarget) {
    if (ringingIds.has(target.id)) return;
    setRingingIds((prev) => new Set(prev).add(target.id));
    try {
      // Sözleşme §4 — 1-1 DM mevcut `callInvite`i YENİDEN gönderir (yeni yol açılmaz); grup DM
      // kendi ucu `voice:group_call_ring`i çağırır (`groupCallStart`in ack+timeout deseni aynı).
      const ack = callKind === 'dm' ? await callInvite(channelId) : await groupCallRing(channelId, target.id);
      if (ack.ok) {
        // §4.6 ADDENDUM — yalnız BAŞARILI çaldırmada devreye girer: satırı 60sn kilitli tut, süre
        // dolunca eski hâline döndür. Hata dalları aşağıdaki `finally`in hemen açtığı eski davranışı
        // aynen korur.
        const timeout = setTimeout(() => {
          ringTimeouts.current.delete(target.id);
          setRingingIds((prev) => {
            const next = new Set(prev);
            next.delete(target.id);
            return next;
          });
        }, 60_000);
        ringTimeouts.current.set(target.id, timeout);
        return;
      }
      // Sessiz başarısızlık yasak (kural dosyası) — her hata dalı Türkçe mesaj gösterir.
      // `FORBIDDEN` (engel) sebebini söylemez (G3); `RATE_LIMITED` "biraz bekle" anlamında.
      const message =
        ack.error === 'RATE_LIMITED'
          ? t('mobile.call.ringRateLimited')
          : ack.error === 'FORBIDDEN'
            ? t('mobile.call.ringForbidden')
            : t('mobile.call.unreachable');
      Alert.alert(message);
    } finally {
      // Başarı dalı zaten kendi 60sn zamanlayıcısını kurdu (`ringTimeouts`e yazdı) — bu durumda
      // kilidi ERKEN açmıyoruz. Hata/istisna dalında zamanlayıcı hiç kurulmadığı için burada açılır.
      if (!ringTimeouts.current.has(target.id)) {
        setRingingIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
      }
    }
  }

  function openChannelSettings() {
    if (!guildId) return;
    onClose();
    router.push({ pathname: '/channel-details', params: { channelId, guildId } });
  }

  function openInvite() {
    if (!guildId) return;
    onClose();
    router.push({ pathname: '/guild-invite', params: { id: guildId, name: subtitle || undefined } });
  }

  function openOutput() {
    onClose();
    onOpenOutput();
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>

            <View style={styles.group}>
              {canManageChannel && (
                <>
                  <Pressable style={styles.row} onPress={openChannelSettings} accessibilityRole="button">
                    <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
                    <Text style={styles.rowText}>{t('channel.settingsTitle')}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                  <View style={styles.divider} />
                </>
              )}
              <Pressable style={styles.row} onPress={openOutput} accessibilityRole="button">
                <Ionicons name="volume-high-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.rowText}>{t('mobile.call.outputRow')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
              <View style={styles.divider} />
              <Pressable
                style={styles.row}
                onPress={() => void toggleDeafen()}
                accessibilityRole="button"
                accessibilityLabel={t(isDeafened ? 'voice.undeafen' : 'voice.deafen')}
              >
                <Ionicons name="ear-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.rowText}>{t(isDeafened ? 'voice.undeafen' : 'voice.deafen')}</Text>
                {isDeafened && <Ionicons name="checkmark" size={18} color={theme.colors.accent500} />}
              </Pressable>
            </View>

            <Text style={styles.sectionHeader}>
              {t('mobile.call.inVoiceCount', { n: participants.length })}
            </Text>
            <View style={styles.group}>
              {participants.map((p, i) => (
                <View key={p.userId}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    {p.avatarUrl ? (
                      <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>{p.username.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.rowText} numberOfLines={1}>
                      {p.username}
                    </Text>
                    {(p.isLocal ? isMuted : mutedUserIds.has(p.userId)) && (
                      <Ionicons name="mic-off-outline" size={18} color={theme.colors.textMuted} />
                    )}
                  </View>
                </View>
              ))}
            </View>

            {pendingMembers.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>{t('mobile.call.notInVoiceHeader')}</Text>
                <View style={styles.group}>
                  {pendingMembers.map((m, i) => (
                    <View key={m.id}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.row}>
                        {m.avatarUrl ? (
                          <Image source={{ uri: m.avatarUrl }} style={[styles.avatar, styles.avatarDimmed]} />
                        ) : (
                          <View style={[styles.avatar, styles.avatarFallback, styles.avatarDimmed]}>
                            <Text style={styles.avatarFallbackText}>{m.username.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <Text style={[styles.rowText, styles.dimmedText]} numberOfLines={1}>
                          {m.username}
                        </Text>
                        <Pressable
                          style={[styles.ringButton, ringingIds.has(m.id) && styles.ringButtonDisabled]}
                          disabled={ringingIds.has(m.id)}
                          onPress={() => void handleRing(m)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.ringButtonText}>
                            {/* §4.6 ADDENDUM — başarılı çaldırmadan sonraki 60sn'lik kilit de aynı
                                `ringingIds`i kullanıyor; "mobile.call.ringing" `ParticipantTile`in
                                sahnede kullandığı AYNI anahtar (kopya anahtar açılmadı). */}
                            {ringingIds.has(m.id) ? t('mobile.call.ringing') : t('mobile.call.ringAction')}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {canInvite && (
              <View style={styles.group}>
                <Pressable style={styles.row} onPress={openInvite} accessibilityRole="button">
                  <Ionicons name="person-add-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.rowText}>{t('mobile.call.inviteFriendRow')}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 4,
    gap: 16,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  sectionHeader: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: -8,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  avatarDimmed: {
    opacity: 0.6,
  },
  dimmedText: {
    color: theme.colors.textSecondary,
  },
  ringButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentSubtle,
  },
  ringButtonDisabled: {
    opacity: 0.5,
  },
  ringButtonText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
});
