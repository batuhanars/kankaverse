import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LocalTrackPublication, RemoteTrackPublication } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';
import type { RoomMember } from '@/stores/voice';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sahneye çıkabilen tek bir görüntü: bir kişinin kamerası (kapalıysa avatarı) ya da bir ekran
 * paylaşımı. Birinin hem kamerası hem ekranı açıksa İKİ ayrı öğedir, ikisi de büyütülebilir.
 */
export interface StageItem {
  key: string;
  kind: 'person' | 'screen';
  member: RoomMember;
  publication: LocalTrackPublication | RemoteTrackPublication | null;
  /** 1-1'de karşı taraf henüz odada değilken onun yerini tutan öğe ("Çalıyor…"). */
  ringing?: boolean;
  noAnswer?: boolean;
}

interface BuildInput {
  participants: RoomMember[];
  screenPublications: Record<string, RemoteTrackPublication>;
  cameraPublications: Record<string, RemoteTrackPublication>;
  localCameraPublication: LocalTrackPublication | null;
  /** 1-1'de karşı taraf odada yokken sahnede onun yerine duran öğe. */
  peerPlaceholder?: { member: RoomMember; ringing: boolean; noAnswer: boolean } | null;
}

/**
 * Öğe sırası şeritteki sıradır: önce ekran paylaşımları, sonra diğer kişiler (katılma sırası),
 * en sonda kendin. Saf fonksiyon: aynı girdi aynı listeyi verir, kart sırası zıplamaz.
 */
export function buildStageItems({
  participants,
  screenPublications,
  cameraPublications,
  localCameraPublication,
  peerPlaceholder,
}: BuildInput): StageItem[] {
  const screens: StageItem[] = participants
    .filter((p) => !!screenPublications[p.userId])
    .map((p) => ({ key: `screen:${p.userId}`, kind: 'screen', member: p, publication: screenPublications[p.userId] }));
  const remotes: StageItem[] = participants
    .filter((p) => !p.isLocal)
    .map((p) => ({ key: `person:${p.userId}`, kind: 'person', member: p, publication: cameraPublications[p.userId] ?? null }));
  if (peerPlaceholder) {
    remotes.push({ key: 'person:placeholder', kind: 'person', publication: null, ...peerPlaceholder });
  }
  const self: StageItem[] = participants
    .filter((p) => p.isLocal)
    .map((p) => ({ key: `person:${p.userId}`, kind: 'person', member: p, publication: localCameraPublication }));
  return [...screens, ...remotes, ...self];
}

/** Kullanıcı seçim yapmadıysa sahnede ne durur: paylaşılan ekran → karşı tarafın kamerası → karşı taraf → sen. */
function defaultFocus(items: StageItem[]): StageItem | undefined {
  return (
    items.find((i) => i.kind === 'screen') ??
    items.find((i) => i.kind === 'person' && !i.member.isLocal && !!i.publication?.track) ??
    items.find((i) => i.kind === 'person' && !i.member.isLocal) ??
    items[0]
  );
}

interface Props {
  items: StageItem[];
  cameraFacing: 'user' | 'environment';
  speakingUserIds: Set<string>;
  mutedUserIds: Set<string>;
  isMuted: boolean;
  /** Tam ekranda şerit gizlenir, yalnız sahne kalır. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /**
   * Hangi kart dokununca sahneye çıkar. DM'de her kart; ortam aramasında yalnız ekran kartları,
   * çünkü orada kişi kartına dokunmak moderasyon panelini açar (`onModerationTarget`).
   */
  canFocus: (item: StageItem) => boolean;
  canModerate: (p: RoomMember) => boolean;
  onModerationTarget: (p: RoomMember) => void;
}

/**
 * Arama sahnesi: üstte büyük görüntü, altta yatay kaydırılan kartlar, dokunulan kart büyür.
 * 1-1 ve grup DM'de kamera ya da ekran açıkken, ortam aramasında yalnız ekran paylaşımında çizilir.
 *
 * Odak durumu bu bileşende tutulur ve TÜRETİLİR: seçilen öğe hâlâ listedeyse o, değilse varsayılan.
 * Bu yüzden ayrı bir "odak düzeltme" effect'i yok: seçilen ekran paylaşımı biterse bir sonraki
 * render'da kendiliğinden varsayılana düşer, yeni bir paylaşım başlarsa kullanıcının seçimi zıplamaz.
 */
export function CallStage({
  items,
  cameraFacing,
  speakingUserIds,
  mutedUserIds,
  isMuted,
  fullscreen,
  onToggleFullscreen,
  canFocus,
  canModerate,
  onModerationTarget,
}: Props) {
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const focused = items.find((i) => i.key === pickedKey) ?? defaultFocus(items);
  const others = items.filter((i) => i !== focused);

  const micOffOf = (m: RoomMember) => (m.isLocal ? isMuted : mutedUserIds.has(m.userId));
  const mirrorOf = (i: StageItem) => i.kind === 'person' && i.member.isLocal && cameraFacing === 'user';

  return (
    <View style={styles.wrap}>
      {/* Büyük alan Pressable DEĞİL: dokunuş `call.tsx`teki dış Pressable'a çıkar (kontrolleri
          göster/gizle). Tam ekrana giriş yalnız köşedeki düğmeden (M5b §3.4 addendum). */}
      <View style={[styles.bigTile, fullscreen && styles.bigTileFullscreen]}>
        {focused &&
          (focused.kind === 'screen' ? (
            <ParticipantTile variant="screen" name="" avatarUrl={null} speaking={false} micOff={false} videoPublication={focused.publication} />
          ) : (
            <ParticipantTile
              variant="full"
              name={focused.member.username}
              avatarUrl={focused.member.avatarUrl}
              speaking={speakingUserIds.has(focused.member.userId)}
              micOff={micOffOf(focused.member)}
              ringing={focused.ringing}
              noAnswer={focused.noAnswer}
              videoPublication={focused.publication}
              mirror={mirrorOf(focused)}
            />
          ))}
        {/* Tam ekran yalnız ekran paylaşımında anlamlı (yatay çevirip okumak için). */}
        {!fullscreen && focused?.kind === 'screen' && (
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

      {!fullscreen && others.length > 0 && (
        <ScrollView
          horizontal
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
          showsHorizontalScrollIndicator={false}
        >
          {others.map((item) => {
            const focusable = canFocus(item);
            const moderatable = item.kind === 'person' && canModerate(item.member);
            return (
              <Pressable
                key={item.key}
                style={styles.stripItem}
                disabled={!focusable && !moderatable}
                onPress={() => (focusable ? setPickedKey(item.key) : onModerationTarget(item.member))}
              >
                <ParticipantTile
                  name={item.member.username}
                  avatarUrl={item.member.avatarUrl}
                  speaking={item.kind === 'person' && speakingUserIds.has(item.member.userId)}
                  micOff={item.kind === 'person' && micOffOf(item.member)}
                  videoPublication={item.publication}
                  mirror={mirrorOf(item)}
                  isScreenShare={item.kind === 'screen'}
                />
                {item.kind === 'screen' && (
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
  bigTileFullscreen: {
    paddingHorizontal: 0,
  },
  // Sağ altta: sağ üstte paylaşılan ekranın tarayıcı sekmelerine biniyordu (sahip turu 2026-08-10).
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
