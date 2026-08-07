import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelSummaryDto } from '@/api/channels';
import { useVoicePresenceStore, type VoicePresenceParticipant } from '@/stores/voicePresence';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

const EMPTY_PRESENCE: VoicePresenceParticipant[] = [];

/** Sürükleyip bırakınca kapanma eşiği (dp) — yarı ekran beklemek yorucu, kısa bir itiş yeter. */
const DISMISS_DISTANCE = 80;
/** Hızlı fiskede mesafe dolmasa da kapanır (dp/ms). */
const DISMISS_VELOCITY = 0.7;
/** Kalabalık kanalda panel ekranı yutmasın; bu yükseklikten sonra liste kendi içinde kayar. */
const LIST_MAX_HEIGHT = 260;

interface Props {
  /** Dokunulan ses kanalı; null ise panel kapalı (`ChannelMenuHost` ile aynı desen). */
  channel: ChannelSummaryDto | null;
  /** Katılma isteği sürüyor — düğme ikinci dokunuşu yutar (`home.tsx` `voiceJoining`). */
  joining: boolean;
  onClose: () => void;
  onJoin: () => void;
}

/**
 * Sprint M4z §B (D48) — ses kanalına girmeden önce ara panel.
 *
 * M4c §2'de ses satırına dokunmak DOĞRUDAN odaya sokuyordu (web pariteti, bilinçliydi). Mobilde
 * iki gerçek sorun çıktı: yanlışlıkla dokunup sese girmek çok kolay, ve girmeden kimlerin içeride
 * olduğunu görmek mümkün değil. Panel bu ikisini çözer, başka bir şey yapmaz.
 *
 * 🔴 KONMAYANLAR (Discord'un panelinde var, bizde YOK): mikrofon aç/kapa · ses/çıkış ayarı ·
 * davet · kanal düzenleme. Panel yalnız "gör ve gir". Yönetim maddeleri zaten uzun basışta
 * (`ChannelMenuSheet`) duruyor, ikinci kapı açılmadı.
 *
 * Görsel kabuk `ChannelMenuSheet`/`AddGuildSheet` ile aynı (`Modal` + karartılmış perde + alt
 * panel + `sheetInsets` gezinme çubuğu payı) — yeni bir sheet altyapısı yazılmadı.
 *
 * Kapanma üç yoldan: perdeye dokunma · aşağı sürükleme (tutamaç/başlık alanı) · Android geri
 * tuşu (`Modal onRequestClose`).
 */
export function VoiceChannelSheet({ channel, joining, onClose, onJoin }: Props) {
  const bottomInset = useSheetInsets();
  const channelId = channel?.id ?? '';
  const visible = !!channel;

  // Panel açıkken kendi aboneliğini kurar. `voiceSubscribe` referans SAYILI (D45, socket.ts):
  // satır zaten abone olduğu için sunucuya ikinci bir `voice:subscribe` gitmez — kazanç, panel
  // açılırken katılımcı listesinin bir kez TAZELENMESİ (`getParticipants`). Yeni uç yok.
  useEffect(() => {
    if (!channelId) return;
    useVoicePresenceStore.getState().subscribe(channelId);
    return () => useVoicePresenceStore.getState().unsubscribe(channelId);
  }, [channelId]);

  const members = useVoicePresenceStore((s) => s.byChannel[channelId] ?? EMPTY_PRESENCE);

  // Sürükleyerek kapatma. `react-native-gesture-handler` KULLANILMADI: `Modal` Android'de ayrı bir
  // pencerede çizilir ve orada ayrıca `GestureHandlerRootView` sarmalayıcısı ister; RN çekirdeğinin
  // `PanResponder`ı bu bağımlılığı doğurmuyor ve saf JS (native diff yok).
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Açılışta konumu sıfırla — önceki sürüklemenin kalıntısıyla açılmasın.
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const pan = useMemo(() => {
    function springBack() {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    }
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
          return;
        }
        springBack();
      },
      onPanResponderTerminate: springBack,
    });
  }, [translateY]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: sheetBottomPadding(bottomInset), transform: [{ translateY }] },
          ]}
        >
          {/* Sürükleme alanı YALNIZ burası (tutamaç + başlık): katılımcı listesi kendi içinde
              kayabildiği için tüm panele pan bağlamak iki jesti birbirine düşürürdü. Alan 44dp'den
              yüksek — tutamaç bloğu 18dp + başlık satırı en az 32dp + 20dp dolgu = 70dp. */}
          <View {...pan.panHandlers}>
            <View style={styles.grabber} />
            <View style={styles.titleRow}>
              <Ionicons name="volume-medium-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.title} numberOfLines={1}>
                {channel?.name ?? ''}
              </Text>
            </View>
          </View>

          {/* Perdeye kadar sızan dokunuşları yutar (panelin boş yerine dokunmak kapatmasın) —
              diğer panellerdeki iç `Pressable` ile aynı iş. */}
          <Pressable style={styles.body} onPress={() => {}}>
            {members.length === 0 ? (
              <Text style={styles.empty}>{t('voice.noParticipants')}</Text>
            ) : (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {members.map((p) => (
                  <View key={p.userId} style={styles.memberRow}>
                    {p.avatarUrl ? (
                      <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>
                          {p.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.memberName} numberOfLines={1}>
                      {p.username}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable
              style={[styles.joinButton, joining && styles.joinButtonBusy]}
              onPress={onJoin}
              disabled={joining}
              accessibilityRole="button"
              accessibilityState={{ disabled: joining }}
            >
              <Text style={styles.joinText}>
                {joining ? t('voice.joining') : t('voice.joinAction')}
              </Text>
            </Pressable>
          </Pressable>
        </Animated.View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 32,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: theme.layout.panelGap,
    gap: 12,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    paddingVertical: 8,
  },
  list: {
    maxHeight: LIST_MAX_HEIGHT,
  },
  listContent: {
    gap: 10,
    paddingVertical: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  memberName: {
    flexShrink: 1,
    color: theme.colors.textBody,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  // Dokunma hedefi: `inputMinHeight` = 44dp (tema tokeni, göz kararı değil).
  joinButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonBusy: {
    backgroundColor: theme.colors.accent600,
  },
  joinText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
});
