import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  /** Format-hatası (`INVALID_BIRTHDATE`/`UNDERAGE`) SUNUCUDAN gelir — bu bileşen yaş hesaplamaz. */
  error?: string | null;
  onChange: (isoDateOrEmpty: string) => void;
}

const onlyDigits = (raw: string) => raw.replace(/[^0-9]/g, '');

// Sprint M1c contract §3.1 — PM kilitli karar: üç sayısal alan GG/AA/YYYY, takvim seçici YOK,
// yeni bağımlılık YOK. Otomatik ilerleme (alan dolunca odak sonrakine geçer) + boş alanda
// backspace bir öncekine döner — ikisi birlikte gelir (karşılığı olmadan düzeltme acı verir).
// 🔴 Bu bileşen YAŞ HESAPLAMAZ, yalnız format toplar (eksik hane → gönderim zaten devre dışı
// kalır, register.tsx `canSubmit` üzerinden). Geçersiz gün/ay/yaş sunucunun işidir.
export function BirthDateInput({ error, onChange }: Props) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  useEffect(() => {
    if (day.length === 2 && month.length === 2 && year.length === 4) {
      onChange(`${year}-${month}-${day}`);
    } else {
      onChange('');
    }
    // onChange register.tsx'te useCallback'siz bir state setter'a sarılı; her render'da kimlik
    // değiştirmiyor olsa da parent'ın kendi state'ini set etmesi yeterli — dependency'e eklemek
    // gereksiz yeniden çalıştırma riski taşır (ESLint istisnası bilinçli).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, month, year]);

  function onDayChange(raw: string) {
    const value = onlyDigits(raw).slice(0, 2);
    setDay(value);
    if (value.length === 2) monthRef.current?.focus();
  }

  function onMonthChange(raw: string) {
    const value = onlyDigits(raw).slice(0, 2);
    setMonth(value);
    if (value.length === 2) yearRef.current?.focus();
  }

  function onYearChange(raw: string) {
    setYear(onlyDigits(raw).slice(0, 4));
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {t('auth.birthDate')}
        <Text style={styles.required}> *</Text>
      </Text>
      <View style={styles.row}>
        <TextInput
          ref={dayRef}
          value={day}
          onChangeText={onDayChange}
          keyboardType="number-pad"
          maxLength={2}
          placeholder={t('mobile.register.birthDateDayPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, styles.segment]}
          accessibilityLabel={t('auth.birthDateDay')}
        />
        <TextInput
          ref={monthRef}
          value={month}
          onChangeText={onMonthChange}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && month.length === 0) {
              dayRef.current?.focus();
            }
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder={t('mobile.register.birthDateMonthPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, styles.segment]}
          accessibilityLabel={t('auth.birthDateMonth')}
        />
        <TextInput
          ref={yearRef}
          value={year}
          onChangeText={onYearChange}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && year.length === 0) {
              monthRef.current?.focus();
            }
          }}
          keyboardType="number-pad"
          maxLength={4}
          placeholder={t('mobile.register.birthDateYearPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, styles.segmentYear]}
          accessibilityLabel={t('auth.birthDateYear')}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.help}>{t('auth.birthDateHelp')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: theme.layout.panelGap,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: 6,
  },
  required: {
    color: theme.colors.danger,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  segment: {
    flex: 1,
  },
  segmentYear: {
    flex: 1.5,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginTop: 6,
  },
  help: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 6,
  },
});
