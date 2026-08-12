import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useVoiceStore } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';
import { ParticipantTile } from '@/components/call/ParticipantTile';
import { useCallSubject } from '@/components/call/useCallSubject';
import { theme } from '@/theme';

/**
 * M4a-1 sözleşme §7 — mini pencere. Sistem seviyesi bir overlay DEĞİL (overlay izni/PiP yok);
 * kök `_layout.tsx`'te mount edilen mutlak konumlu bir bileşen (Discord'un yaptığı da bu).
 * Görünürlük sürüklenebilir bir "minimized" state'i İZLEMEZ — yalnız üç koşuldan türetilir:
 * bağlıyız VE mevcut rota `/call` DEĞİL VE `/call`a geçiş BEKLEMİYORUZ. Rota `/call` olunca tam
 * ekran zaten kendini gösteriyor, mini pencere o an anlamsız — ayrı bir state'i senkron tutmaya
 * gerek kalmıyor (D37/M3c dersi: gereksiz state = senkron kalma riski).
 *
 * 🔴 M4c sahip bulgusu (2026-08-07) — üçüncü koşul (`pendingCallScreen`) sonradan eklendi:
 * `startOrJoin` başarılı olur olmaz `connectedChannelId` dolar ama `router.push('/call')` henüz
 * çalışmamıştır (asenkron gezinme) — o birkaç render'lık pencerede bu bileşen (`pathname` hâlâ
 * eski ekran) kısaca görünüp tam ekran açılınca kayboluyordu (flaş). `pendingCallScreen`
 * `stores/voice.ts`'te bu geçişi işaretliyor.
 *
 * 🔴 Sahip bulgusu (2026-08-12, cihaz turu) — görüntülü aramada yazmak için DM ekranına geçince
 * bu kutu karşı tarafın AVATARINI gösteriyordu: karşı taraf kamerasını açmış, ekranını paylaşıyor
 * olsa bile görüntü kayboluyordu ve arama sesli sanılıyordu. Artık görüntü VARSA görüntü çizilir
 * (kamera ya da ekran paylaşımı — ayrımı `useCallSubject` yapıyor), yoksa bugünkü avatar/hoparlör
 * davranışı SATIR SATIR aynı kalır. Seçim kuralı sistem PiP penceresiyle ORTAK (`useCallSubject`):
 * iki küçük pencerenin farklı şey göstermesi için bir sebep yok.
 */
export function MiniCallWindow() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const pendingCallScreen = useVoiceStore((s) => s.pendingCallScreen);
  const roomParticipants = useVoiceStore((s) => s.roomParticipants);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const channel = useDmStore((s) => s.channels.find((c) => c.id === connectedChannelId));
  const subject = useCallSubject();

  if (!connectedChannelId || pathname === '/call' || pendingCallScreen) return null;

  // Yalnız gerçek bir track varsa video sayılır — mute'lu publication `track`i temizliyor
  // (`stores/voice.ts` `wireRoom`), yani kamerasını kapatan biri anında avatara döner.
  const hasVideo = !!subject?.videoPublication?.track;

  const peer = channel?.type === 'DM' ? channel.otherUser : null;
  const peerMember = roomParticipants.find((p) => !p.isLocal);
  const avatarUrl = peerMember?.avatarUrl ?? peer?.avatarUrl ?? null;
  // 🔴 Sahip cihaz turu (2026-08-08) — bu kutu KARŞI TARAFI gösterir. Aramada yalnızken (ortam ses
  // kanalına tek başına girmek, ya da taşınıp boş kanala düşmek) gösterilecek kimse olmuyordu ve
  // kod boş addan ilk harfi alıp **"?"** basıyordu: kullanıcıya hata gibi görünüyor. Kendi avatarımızı
  // koymak bilgi vermez (kim olduğunu zaten biliyor); o durumda hoparlör ikonu doğru bilgi taşır:
  // "hâlâ bir ses aramasındasın". `alone` ayrı bir state DEĞİL, katılımcı listesinden türetiliyor.
  const alone = !peerMember && !peer;
  const initial = (peerMember?.username ?? peer?.username ?? '').charAt(0).toUpperCase();
  const speaking = peerMember ? speakingUserIds.has(peerMember.userId) : false;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/call', params: { channelId: connectedChannelId } })}
      style={[styles.container, hasVideo && styles.containerVideo, { top: insets.top + 8 }]}
      accessibilityRole="button"
    >
      {hasVideo && subject ? (
        // `'pip'` varyantı: video/avatar tam alanı kaplar, üzerinde ad/rozet/kontrol YOK. Kutunun
        // kendisi zaten dokunulabilir bir düğme (aramaya dön) — içine ikinci bir kontrol konmaz.
        <ParticipantTile
          variant="pip"
          name={subject.name}
          avatarUrl={subject.avatarUrl}
          speaking={false}
          micOff={false}
          videoPublication={subject.videoPublication}
          isScreenShare={subject.isScreenShare}
        />
      ) : (
        <View style={[styles.avatarWrap, speaking && styles.avatarSpeaking]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              {alone || !initial ? (
                <Ionicons name="volume-medium" size={22} color={theme.colors.accent500} />
              ) : (
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const SIZE = 56;
// Videolu hâlde kutu büyür: 56'lık kareye sığdırılan bir kamera görüntüsünden kimin ne yaptığı
// seçilemiyor. Kare oran bilinçli — telefon kamerası dikey, web kamerası/ekran paylaşımı yatay
// geliyor; kare ikisini de simetrik kırpar, `'pip'` varyantı ekran paylaşımında zaten `contain`e
// düşüp tamamını gösteriyor.
const VIDEO_SIZE = 88;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    // `elevation` burada "derinlik" için değil — react-native-screens'in native Stack'i üstünde
    // güvenilir biçimde çizilsin diye (Android'de salt zIndex, native ekran fragment'larına karşı
    // sıra garantisi vermeyebilir). Görsel dil kenarlıkla kalıyor (tasarım sistemi — "Gölge YOK");
    // bu küçük boyutta elevation'ın kendi gölgesi zaten görünmeyecek kadar ince.
    elevation: 8,
  },
  // `overflow: hidden` yalnız videolu hâlde gerekiyor: video tam alanı kapladığı için köşeleri
  // kutunun yarıçapına kırpılmalı (avatar zaten kendi içinde dairesel, taşmıyor).
  containerVideo: {
    width: VIDEO_SIZE,
    height: VIDEO_SIZE,
    overflow: 'hidden',
    // `'pip'` varyantının kök View'i `flex: 1` — ana eksende (yükseklik) kendiliğinden büyür ama
    // çapraz eksende kutu ortalama yaptığı için genişliği içeriğe göre 0 kalırdı (video hiç
    // görünmezdi). `stretch` çapraz ekseni de kutuya eşitler.
    alignItems: 'stretch',
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSpeaking: {
    borderColor: theme.colors.online,
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
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
});
