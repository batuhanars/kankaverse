import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LocalTrackPublication, RemoteTrackPublication } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';
import type { RoomMember } from '@/stores/voice';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  participants: RoomMember[];
  /** Odaktaki (büyük alanda gösterilen) paylaşımın publication'ı — `null` olursa büyük alan boş kalır
   *  (çağıran taraf zaten yalnız en az bir publication varken bu bileşeni render ediyor). */
  focusedPublication: RemoteTrackPublication | null;
  /** Sözleşme §3.2 — kimin paylaştığı bilgisi (userId anahtarlı), şeritte "paylaşıyor" rozeti +
   *  dokununca odak değişimi için. */
  screenPublications: Record<string, RemoteTrackPublication>;
  /** Şeritteki kartlarda kamera görüntüsü de gösterilsin diye (grid ile aynı davranış — birinin hem
   *  kamerası hem ekranı açık olabilir, M5b §2 store yorumu). */
  cameraPublications: Record<string, RemoteTrackPublication>;
  localCameraPublication: LocalTrackPublication | null;
  cameraFacing: 'user' | 'environment';
  speakingUserIds: Set<string>;
  mutedUserIds: Set<string>;
  isMuted: boolean;
  /** Sözleşme §3.3 — tam ekranda üst bar/alt kontrollerle BİRLİKTE şerit de gizlenir (yalnız video). */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onSelectFocus: (userId: string) => void;
  canModerate: (p: RoomMember) => boolean;
  onModerationTarget: (p: RoomMember) => void;
}

/**
 * Sprint M5b §3.1/§3.2 — ekran paylaşımı sahnesi: üstte paylaşılan ekran (büyük, `objectFit="contain"`),
 * altta odadaki herkesin yatay kaydırmalı şeridi (`ParticipantTile` `card` varyantı — sözleşme "ikinci
 * bir video bileşeni yazılmaz" kısıtı: burada da yalnız `ParticipantTile` tüketiliyor).
 *
 * Şeritte paylaşan birine dokunmak odağı ona taşır (tek-odak kuralı §3.2); paylaşmayan birine
 * dokunmak (yalnız guild aramasında + yetkiliyse) moderasyon panelini açar — `call.tsx`teki grid
 * dalıyla AYNI `canModerate`/`onModerationTarget` mekanizması, burada TEKRAR YAZILMADI.
 */
export function ScreenShareStage({
  participants,
  focusedPublication,
  screenPublications,
  cameraPublications,
  localCameraPublication,
  cameraFacing,
  speakingUserIds,
  mutedUserIds,
  isMuted,
  fullscreen,
  onToggleFullscreen,
  onSelectFocus,
  canModerate,
  onModerationTarget,
}: Props) {
  return (
    <View style={styles.wrap}>
      {/*
        Sprint M5b §3.4 ADDENDUM 🔴 (sahip cihaz turundan SONRA gelen tasarım revizyonu) —
        videoya dokunmak ARTIK tam ekranı AÇIP KAPATMIYOR. Bu View bilinçli olarak Pressable
        DEĞİL: dokunuş yakalanmadan `call.tsx`teki dış `Pressable`e (`resetHideTimer`) yükselir —
        yani ekranın geri kalanına dokunmakla BİREBİR aynı davranış (kontrolleri göster/gizle).
        Tam ekrana giriş artık yalnız aşağıdaki açık düğmeden; çıkış `CallControls`e eklenen
        küçültme düğmesinden (`call.tsx` `onExitFullscreen`) — video kendisi bir kontrol DEĞİL.
      */}
      <View style={[styles.bigTile, fullscreen && styles.bigTileFullscreen]}>
        <ParticipantTile
          variant="screen"
          name=""
          avatarUrl={null}
          speaking={false}
          micOff={false}
          videoPublication={focusedPublication}
        />
        {/* Sprint M5b §3.4 ADDENDUM — tam ekrana GİRİŞ düğmesi, köşede (videoyu ezmesin diye
            küçük + yarı saydam zemin). Tam ekrandayken gereksiz (çıkış kontrol çubuğunda olur),
            bu yüzden yalnız `!fullscreen` iken çizilir. */}
        {!fullscreen && (
          <Pressable
            onPress={onToggleFullscreen}
            hitSlop={8}
            style={styles.expandButton}
            accessibilityRole="button"
            accessibilityLabel={t('voice.enterFullscreen')}
          >
            <Ionicons name="expand-outline" size={20} color={theme.colors.textPrimary} />
          </Pressable>
        )}
      </View>

      {!fullscreen && (
        <ScrollView
          horizontal
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
          showsHorizontalScrollIndicator={false}
        >
          {participants.map((p) => {
            const isSharing = !!screenPublications[p.userId]?.track;
            const handlePress = () => {
              if (isSharing) onSelectFocus(p.userId);
              else if (canModerate(p)) onModerationTarget(p);
            };
            return (
              <Pressable
                key={p.userId}
                style={styles.stripItem}
                disabled={!isSharing && !canModerate(p)}
                onPress={handlePress}
              >
                <ParticipantTile
                  name={p.username}
                  avatarUrl={p.avatarUrl}
                  speaking={speakingUserIds.has(p.userId)}
                  micOff={p.isLocal ? isMuted : mutedUserIds.has(p.userId)}
                  videoPublication={p.isLocal ? localCameraPublication : (cameraPublications[p.userId] ?? null)}
                  mirror={p.isLocal && cameraFacing === 'user'}
                />
                {isSharing && (
                  <View style={styles.sharingBadge}>
                    <Ionicons name="tv-outline" size={12} color={theme.colors.textPrimary} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const STRIP_ITEM_WIDTH = 100;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  bigTile: {
    flex: 1,
    paddingHorizontal: theme.layout.panelGap,
  },
  // Sözleşme §3.3 — tam ekranda video uçtan uca: dolgu/köşe yarıçapı kalkar.
  bigTileFullscreen: {
    paddingHorizontal: 0,
  },
  // Sprint M5b §3.4 ADDENDUM — tam ekrana giriş düğmesi. `bigTile` RN'de varsayılan olarak zaten
  // `position:'relative'` (Yoga varsayımı) — ayrıca belirtmeye gerek yok, absolute çocuk buna göre konumlanır.
  // 🔴 Sahip cihaz turu 2026-08-10: düğme SAĞ ALT köşede. Sağ üstte iken paylaşılan ekranın
  // kendi arayüzünün (tarayıcı sekmeleri, adres çubuğu) üstüne biniyordu; alt köşe hem daha boş
  // hem başparmağa yakın. Tam ekran modunda bu düğme zaten çizilmiyor (çıkış kontrol çubuğunda).
  // Arka plan kaldırıldı (sahip 2026-08-10): dolu daire videonun üstünde leke gibi duruyordu.
  // Ölçü korunuyor — görünmez de olsa 36dp dokunma hedefi kalmalı (ikon 20dp, `hitSlop` ayrıca var).
  expandButton: {
    position: 'absolute',
    bottom: 12,
    right: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: {
    flexGrow: 0,
    marginTop: 12,
  },
  stripContent: {
    paddingHorizontal: theme.layout.panelGap,
    gap: 12,
  },
  stripItem: {
    width: STRIP_ITEM_WIDTH,
  },
  sharingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgElevated,
  },
});
