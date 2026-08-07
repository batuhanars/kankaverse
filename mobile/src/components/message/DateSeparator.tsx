import { StyleSheet, Text, View } from 'react-native';
import { dayDividerLabel, useTodayStart } from '@/utils/dateSeparator';
import { theme } from '@/theme';

/**
 * Sprint C11 — mesaj akışındaki gün ayracı. Mobilin kendi görsel dili: ortalanmış küçük bir
 * rozet (web'de ince çizgi + ortada metin; biri diğerine taşınmaz).
 *
 * Görseldir: dokunulamaz, uzun basılamaz, mesaj değildir. Metni kendi hesaplar ki gece yarısı
 * geçtiğinde "Bugün" → "Dün" kaymasını yalnız bu küçük bileşen yeniden çizsin (liste değil).
 */
export function DateSeparator({ iso }: { iso: string }) {
  const todayStart = useTodayStart();
  return (
    <View style={styles.row}>
      <View style={styles.chip}>
        <Text style={styles.label}>{dayDividerLabel(iso, todayStart)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    marginTop: 14,
    // Altta pay YOK: ayraçtan sonraki mesaj her zaman grup başıdır (§3) ve kendi `rowSpaced`
    // üst payını (10) zaten getiriyor; ikisi toplanınca boşluk sırıtırdı.
    marginBottom: 0,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
});
