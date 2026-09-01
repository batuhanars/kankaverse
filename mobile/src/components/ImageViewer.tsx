import { useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
/** Çift dokunuşun açtığı kademe. Tam MAX değil: bir dokunuşta sonuna kadar gitmek, kullanıcıyı
 *  geri çıkmak için ikinci bir jeste zorlar. */
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

interface Props {
  visible: boolean;
  /** Adres henüz alınmadıysa `null` — o sırada yükleniyor göstergesi çizilir. */
  url: string | null;
  /** Doluysa görsel yerine sebep yazılır (sunucunun Türkçe mesajı; ham hata değil). */
  errorMessage?: string;
  onClose: () => void;
  /**
   * Verilirse alt tarafta "Mesajda göster" düğmesi çıkar. Yalnız medya ızgarası geçiyor: sohbette
   * zaten mesajın içindesin, orada düğme anlamsız olurdu (bkz. `ChannelMediaTab`).
   */
  onShowInChat?: () => void;
}

/**
 * Tam ekran görsel görüntüleyici — yakınlaştırmalı.
 *
 * `AttachmentView` içindeki tam ekran `Modal`'dan BURAYA taşındı; taşınma sebebi ikinci bir çağıran
 * çıkması (medya ızgarası da aynı görüntüleyiciyi açıyor) ve jest kodunun ek/dosya mantığıyla aynı
 * dosyada birikmemesi. Adres alma/T&S kapısı taşınmadı, o hâlâ `AttachmentView`de — bu bileşen
 * yalnız SUNUM yapar, kendi başına hiçbir şey indirmez.
 *
 * 🔴 Yakınlaştırma neden bugüne kadar yoktu: eski yorum "jest altyapısı kurulu değil, eklemek yeni
 * derleme ister" diyordu. İkisi de artık geçerli değil — `react-native-gesture-handler` (2.28) ve
 * `react-native-reanimated` (4.1) ZATEN kurulu ve APK'nın içinde (`reorder.tsx` + `react-native-
 * reorderable-list` kullanıyor), worklet babel eklentisini `babel-preset-expo` paket kuruluysa
 * kendiliğinden ekliyor. Yani bu saf JS değişikliği, yeni native derleme GEREKTİRMİYOR.
 *
 * 🔴 `GestureHandlerRootView` sarmalayıcısı ŞART ve tam olarak burada olmak zorunda: Android'de
 * `Modal` AYRI bir pencerede çizilir, kök ağaçtaki sarmalayıcı o pencereye ulaşmaz ve jestler
 * SESSİZCE çalışmaz (aynı ders `VoiceChannelSheet` ve `AttachmentSheet` yorumlarında; onlar bu
 * yüzden `PanResponder`a düşmüştü). Kökte sarmalayıcı yok, eklenmedi de — bu pencere kendi
 * sarmalayıcısını taşıyor.
 */
export function ImageViewer({ visible, url, errorMessage, onClose, onShowInChat }: Props) {
  const { width, height } = useWindowDimensions();

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Jest başlangıcındaki değerler. Kıstırma ve kaydırma AYRI çiftler kullanıyor: ikisi aynı anda
  // etkin (`Gesture.Simultaneous`) ve tek çift paylaşsalardı ikinci jestin `onStart`ı birincinin
  // başlangıcını ezip görüntüyü zıplatırdı.
  const pinchScale = useSharedValue(1);
  const pinchX = useSharedValue(0);
  const pinchY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  // Kıstırmanın başladığı andaki parmak merkezi (ekran ortasına göre) — sabit kalması gereken nokta.
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  // Görüntüleyici her açılışta 1x başlar: kapanırken sıfırlanmazsa bir sonraki görsel öncekinin
  // yakınlaştırmasıyla açılırdı.
  useEffect(() => {
    if (visible) return;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }, [visible, scale, translateX, translateY]);

  /**
   * Jest bitince görüntüyü sınırlarına oturtur: 1x'in altına inilmişse tam ekrana döner, yakınken
   * kenardan taşan kaydırmayı geri çeker. Sınır kabı (ekran) baz alıyor; `resizeMode="contain"`
   * yüzünden görselin gerçek kutusu daha dar olabilir, yani sınır GEVŞEK — amaç görselin ekran
   * dışına kaçmasını önlemek, piksel hassasiyetinde bir kenar kilidi kurmak değil.
   */
  function settle() {
    'worklet';
    if (scale.value <= MIN_SCALE) {
      scale.value = withTiming(MIN_SCALE);
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      return;
    }
    const maxX = ((scale.value - 1) * width) / 2;
    const maxY = ((scale.value - 1) * height) / 2;
    translateX.value = withTiming(clamp(translateX.value, -maxX, maxX));
    translateY.value = withTiming(clamp(translateY.value, -maxY, maxY));
  }

  function resetZoom() {
    'worklet';
    scale.value = withTiming(MIN_SCALE);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
  }

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinchScale.value = scale.value;
      pinchX.value = translateX.value;
      pinchY.value = translateY.value;
      focalX.value = e.focalX - width / 2;
      focalY.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const next = clamp(pinchScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      // Parmakların ortasındaki nokta yerinde kalsın diye kaydırma da düzeltilir; yoksa her
      // yakınlaştırma ekranın MERKEZİNE doğru olur ve kenardaki bir ayrıntıya yaklaşmak imkânsızlaşır.
      // Türetme: ekrandaki konum s = t + k·p olduğundan, s sabit tutulunca t₁ = s(1−r) + r·t₀ (r = k₁/k₀).
      const ratio = next / pinchScale.value;
      scale.value = next;
      translateX.value = focalX.value * (1 - ratio) + ratio * pinchX.value;
      translateY.value = focalY.value * (1 - ratio) + ratio * pinchY.value;
    })
    .onEnd(settle);

  const pan = Gesture.Pan()
    .onStart(() => {
      panX.value = translateX.value;
      panY.value = translateY.value;
    })
    .onUpdate((e) => {
      // 1x'te kaydırma YOK: görsel zaten tamamen görünüyor, sürüklemek onu sebepsiz kaçırırdı.
      if (scale.value <= MIN_SCALE) return;
      translateX.value = panX.value + e.translationX;
      translateY.value = panY.value + e.translationY;
    })
    .onEnd(settle);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > MIN_SCALE) {
        resetZoom();
        return;
      }
      // Aynı odak matematiği (t₀ = 0 olduğu için sadeleşiyor): dokunulan nokta yerinde kalır.
      const ratio = DOUBLE_TAP_SCALE;
      const maxX = ((ratio - 1) * width) / 2;
      const maxY = ((ratio - 1) * height) / 2;
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      translateX.value = withTiming(clamp((e.x - width / 2) * (1 - ratio), -maxX, maxX));
      translateY.value = withTiming(clamp((e.y - height / 2) * (1 - ratio), -maxY, maxY));
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      // Yakınlaştırılmışken tek dokunuş KAPATMAZ, önce 1x'e döner: yakınlaşmışken yanlışlıkla
      // ekrana dokunup görüntüleyiciden düşmek can sıkıcı olurdu.
      if (scale.value > MIN_SCALE) {
        resetZoom();
        return;
      }
      runOnJS(onClose)();
    });

  // Çift dokunuş tek dokunuşu YENER (`Exclusive`), ikisi birden kıstırma/kaydırmayla aynı anda
  // tanınabilir — dokunuş jestleri parmak kaydığında kendiliğinden düşer.
  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        {errorMessage ? (
          // 🔴 Sessiz siyah ekran YOK: adres alınamazsa sebebi yazılır. `ATTACHMENT_NOT_READY` ve
          // `ATTACHMENT_BLOCKED` de bu yoldan gelir — kapının cevabı kullanıcıya görünür.
          <Pressable
            style={styles.center}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Text style={styles.error}>{errorMessage}</Text>
          </Pressable>
        ) : url ? (
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.center, imageStyle]}>
              <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
            </Animated.View>
          </GestureDetector>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.textMuted} />
          </View>
        )}

        {/* Zemine dokunmak da kapatıyor; görünür düğme keşfedilebilirlik ve ekran okuyucu için. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={styles.close}
        >
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </Pressable>

        {onShowInChat ? (
          <Pressable onPress={onShowInChat} accessibilityRole="button" style={styles.showInChat}>
            <Ionicons name="chatbubble-outline" size={16} color={theme.colors.textPrimary} />
            <Text style={styles.showInChatLabel}>{t('mobile.attachment.showInChat')}</Text>
          </Pressable>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  error: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap * 2,
  },
  close: {
    position: 'absolute',
    top: 32,
    right: 12,
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.layout.inputMinHeight / 2,
    backgroundColor: theme.colors.bgOverlay,
  },
  showInChat: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    minHeight: theme.layout.inputMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.layout.inputMinHeight / 2,
    backgroundColor: theme.colors.bgOverlay,
  },
  showInChatLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
});
