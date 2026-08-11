import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  isMuted: boolean;
  /** Karantina (`canPublish=false`) — düğme görünür ama pasif (§2). */
  canPublish: boolean;
  onToggleMute: () => void;
  /**
   * PM takibi (2026-08-07, M4c) — opsiyonel: `undefined` iken düğme HİÇ ÇİZİLMEZ. Guild ses
   * kanalının kendi metin akışı yok, "Sohbet" etiketiyle minimize'ın aynısını yapan bir düğme
   * yanlış vaat veriyordu (boş yüzey sınıfı). DM araması bu prop'u her zaman geçer, davranış
   * DEĞİŞMEDİ — yalnız guild çağıran taraf artık hiç geçmiyor.
   */
  onOpenChat?: () => void;
  /**
   * §3 (M5c, testçi geri bildirimi) — sohbet düğmesinde okunmamış işareti. Yalnız `onOpenChat`
   * doluyken anlamlı (ortam ses kanalında zaten çizilmiyor, bu prop da orada kullanılmaz).
   * 🔴 NOKTA, sayı DEĞİL (sahip kararı 2026-08-10) — arama ekranı zaten kalabalık, gereken bilgi
   * "yeni bir şey var" kadarı. Kaynak `dm` store'daki kanalın `unread` alanı (`call.tsx`), yeni
   * sayaç/store/endpoint YOK.
   */
  hasUnreadChat?: boolean;
  onHangUp: () => void;
  /**
   * M4d §5/§7 → M4e §4 → M4f §2 → M4i §2 🔴 — yalnız `onToggleCamera` de dolu VE (`canPublishCamera`
   * true VEYA `isGuildCall` true) iken kamera düğmesi çizilir. M4i ile davranış bağlama göre ayrıldı:
   * ortam sesli kanalında (`isGuildCall`) kapalılığın sebebi kanal ayarı/karantina/susturmadır, yaş
   * bilgisi sızdırmaz → düğme **görünür-kilitli** (çizilir, üstü çizili, pasif). DM/grup DM'de video
   * kapısı **yaş** kapısıdır — görünür-kilitli düğme karşı tarafın minör olduğunu ifşa eder (brief
   * §5/G1) → orada `canPublishCamera=false` iken düğme **bugünkü gibi hiç çizilmez**. Bu ayrım
   * sadeleştirilmeyecek, gerekçesi T&S'tir (sözleşme §2).
   */
  canPublishCamera?: boolean;
  /** M4i §2 🔴 — kamera düğmesinin görünür-kilitli mi yoksa gizli mi davranacağını belirleyen bağlam
   *  ayracı. Yalnız ortam sesli kanalında (`callKind==='guild'`) true geçilir; DM ve grup DM'de
   *  `undefined`/`false` kalır (gizli davranış korunur). */
  isGuildCall?: boolean;
  isCameraOn?: boolean;
  onToggleCamera?: () => void;
  /** §4 — yalnız kamera AÇIKKEN çizilir (boş yüzey açma kuralı); kamera kapalıyken bu prop dolu
   *  gelse bile düğme çizilmez (`isCameraOn` de kontrol edilir). */
  onSwitchCamera?: () => void;
  /**
   * Sprint M5b §3.4 ADDENDUM 🔴 — yalnız ekran paylaşımı TAM EKRAN görünümündeyken dolu geçilir
   * (`call.tsx` `screenFullscreen` true iken); dolu olduğunda çubuğa küçültme (tam ekrandan çık)
   * düğmesi eklenir. Bileşen kendi tam ekran state'ini TUTMAZ — yalnız çağıranın verdiği callback'i
   * tetikler (`call.tsx` `resetHideTimer` + `setScreenFullscreen(false)` çifti). `undefined` iken
   * (normal görünüm VEYA ekran paylaşımı yok) düğme HİÇ ÇİZİLMEZ — normal görünüm regresyonu yok.
   */
  onExitFullscreen?: () => void;
}

/**
 * M4a-1 sözleşme §4 — alt kontrol çubuğu. M4d ile beşe çıkabiliyor: mikrofon · kamera ·
 * kamera çevir (yalnız kamera açıkken) · sohbet · kapat (§5). Dokunma hedefleri D37 dersiyle
 * ÖLÇÜLEREK sabit 56dp daire — beşe çıkınca KÜÇÜLTÜLMEZ, aralık daralır (§5 🔴).
 *
 * Sprint M5b §3.4 ADDENDUM — ekran paylaşımı tam ekran görünümünde altıya çıkabiliyor: yukarıdaki
 * beşe `onExitFullscreen` (küçültme) eklenir. Aynı aralık-daraltma kuralı (`buttonCount`) burayı
 * da kapsıyor — yeni bir eşik İCAT EDİLMEDİ.
 */
export function CallControls({
  isMuted,
  canPublish,
  onToggleMute,
  onOpenChat,
  hasUnreadChat,
  onHangUp,
  canPublishCamera,
  isGuildCall,
  isCameraOn,
  onToggleCamera,
  onSwitchCamera,
  onExitFullscreen,
}: Props) {
  // M4i §2 🔴 — ortam kanalında izin yokken de düğme çizilir (görünür-kilitli); DM/grup DM'de
  // `isGuildCall` false/undefined olduğu için `canPublishCamera=false` düğmeyi eskisi gibi gizler.
  const showCamera = !!onToggleCamera && (!!canPublishCamera || !!isGuildCall);
  const cameraLocked = showCamera && !canPublishCamera;
  const showFlip = showCamera && !!isCameraOn && !!onSwitchCamera;
  // §5 🔴 D37 dersi — beş düğme (56dp + 24dp aralık) dar Android ekranlarında (~360dp) taşıyor;
  // düğme küçültülmez, aralık daraltılır (12dp — 56dp dairelerin kendisi zaten bol dokunma payı
  // veriyor, aradaki boşluğun daralması dokunma hedefini küçültmez).
  const buttonCount =
    2 + (onOpenChat ? 1 : 0) + (showCamera ? 1 : 0) + (showFlip ? 1 : 0) + (onExitFullscreen ? 1 : 0);
  const gap = buttonCount >= 5 ? 12 : 24;

  return (
    <View style={[styles.row, { gap }]}>
      <Pressable
        onPress={onToggleMute}
        disabled={!canPublish}
        style={[styles.circle, isMuted && styles.circleActive, !canPublish && styles.circleDisabled]}
        accessibilityRole="button"
        accessibilityLabel={isMuted ? t('voice.unmute') : t('voice.mute')}
      >
        <Ionicons
          name={isMuted ? 'mic-off' : 'mic'}
          size={24}
          color={canPublish ? theme.colors.textPrimary : theme.colors.textMuted}
        />
      </Pressable>

      {showCamera && (
        <Pressable
          onPress={onToggleCamera}
          disabled={cameraLocked}
          style={[styles.circle, isCameraOn && styles.circleActive, cameraLocked && styles.circleDisabled]}
          accessibilityRole="button"
          accessibilityLabel={isCameraOn ? t('voice.cameraOff') : t('voice.cameraOn')}
        >
          <Ionicons
            name={isCameraOn ? 'videocam' : 'videocam-off'}
            size={22}
            color={cameraLocked ? theme.colors.textMuted : theme.colors.textPrimary}
          />
        </Pressable>
      )}

      {showFlip && (
        <Pressable
          onPress={onSwitchCamera}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.call.flipCamera')}
        >
          <Ionicons name="camera-reverse-outline" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      {onOpenChat && (
        <Pressable
          onPress={onOpenChat}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.call.chatAction')}
        >
          <Ionicons name="chatbubble" size={22} color={theme.colors.textPrimary} />
          {hasUnreadChat && <View style={styles.unreadDot} />}
        </Pressable>
      )}

      {onExitFullscreen && (
        <Pressable
          onPress={onExitFullscreen}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel={t('voice.exitFullscreen')}
        >
          <Ionicons name="contract-outline" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      <Pressable
        onPress={onHangUp}
        style={[styles.circle, styles.hangUp]}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.call.endCall')}
      >
        {/* PM incelemesi (2026-08-06) — tasarım referansı (görsel 11) kapatmayı ters ahize ile
            gösteriyor; `close` (X) "ekranı kapat" anlamına gelir ama bu düğme ARAMAYI BİTİRİR.
            Ionicons'ta ayrı bir "hang up" glifi yok — telefon ikonu klasik ahize-hattı-inkar
            görünümü için 135° döndürülüyor (yaygın kalıp; kırmızı zemin zaten "bitir" anlamını
            pekiştiriyor). */}
        <Ionicons
          name="call"
          size={26}
          color={theme.colors.textPrimary}
          style={styles.hangUpIcon}
        />
      </Pressable>
    </View>
  );
}

const CIRCLE = 56;

const styles = StyleSheet.create({
  row: {
    // §5 — `gap` burada YOK: buton sayısına göre bileşen gövdesinde hesaplanıp inline uygulanıyor.
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: theme.colors.borderStrong,
  },
  circleDisabled: {
    opacity: 0.5,
  },
  hangUp: {
    backgroundColor: theme.colors.danger,
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
  // §3 — düğmenin sağ üstü, sabit boyut (sayı değil nokta, büyümez).
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.danger,
  },
});
