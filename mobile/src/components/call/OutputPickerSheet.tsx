import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioSession } from '@livekit/react-native';
import { sheetBottomPadding, useSheetInsets } from '@/components/home/sheetInsets';
import { useVoiceStore, type AudioOutputId as OutputId } from '@/stores/voice';
import { t } from '@/i18n';
import { theme } from '@/theme';

const LABEL_KEY: Record<OutputId, string> = {
  speaker: 'mobile.call.outputSpeaker',
  earpiece: 'mobile.call.outputEarpiece',
  headset: 'mobile.call.outputHeadset',
  bluetooth: 'mobile.call.outputBluetooth',
};

const ICON: Record<OutputId, keyof typeof Ionicons.glyphMap> = {
  speaker: 'volume-high-outline',
  earpiece: 'call-outline',
  headset: 'headset-outline',
  bluetooth: 'bluetooth-outline',
};

// 🔴 Bilinen sınır (rapora yazıldı): `@livekit/react-native`'in `getAudioOutputs()`'ı yalnız
// kategori döner ("bluetooth"), eşleşmiş cihazın GERÇEK adını değil — sözleşme §5 "Bluetooth cihaz
// adı" istiyor ama SDK'nın genel yüzeyi bunu vermiyor; gerçek ad için ek native kod gerekir (bu
// derlemenin onaylı paket listesinde yok). Satır "Bluetooth" jenerik etiketiyle gösteriliyor.
const POLL_MS = 2000;

/**
 * M4a-1 sözleşme §5 — ses çıkışı seçici. Native "hangi cihaz bağlı" olayı YOK (SDK'da bulunmadı),
 * bu yüzden sayfa AÇIKKEN kısa aralıklarla `getAudioOutputs()` yeniden okunur (§5 "liste canlı
 * güncellenir" — Bluetooth kulaklık tak/çıkar). Panel kapanınca polling durur.
 */
export function OutputPickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const bottomInset = useSheetInsets();
  const [outputs, setOutputs] = useState<OutputId[]>([]);
  const selected = useVoiceStore((s) => s.outputId);
  const setOutputId = useVoiceStore((s) => s.setOutputId);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const refresh = () => {
      AudioSession.getAudioOutputs()
        .then((list) => {
          if (!cancelled) setOutputs(list as OutputId[]);
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [visible]);

  function select(id: OutputId) {
    setOutputId(id);
    AudioSession.selectAudioOutput(id).catch(() => {});
  }

  // 🔴 Kapalıyken `Modal` HİÇ kurulmaz (yalnız `visible={false}` vermek yetmez). Sürekli kurulu
  // duran bir Modal, sahne ekranı sökülürken Fabric'in görünüm ağacında ikinci bir kök taşıyor ve
  // "child already has a parent" sınıfı çökmeleri besliyor (sahip cihaz turu 2026-08-06).
  if (!visible) return null;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{t('mobile.call.outputTitle')}</Text>
          <View style={styles.group}>
            {outputs.map((id, i) => (
              <View key={id}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  style={styles.row}
                  onPress={() => select(id)}
                  accessibilityRole="button"
                  accessibilityLabel={t(LABEL_KEY[id])}
                >
                  <Ionicons name={ICON[id]} size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.rowText}>{t(LABEL_KEY[id])}</Text>
                  {selected === id && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.accent500} />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
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
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    marginBottom: 8,
  },
  group: {
    marginHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
});
