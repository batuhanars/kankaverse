import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import {
  eventsApi,
  EventLocationType,
  EventRecurrence,
  type CreateEventBody,
} from '@/api/events';
import { extractErrorMessage } from '@/api/errors';
import { SelectSheet } from '@/components/guild/SelectSheet';
import { formatDateLabel, formatEventRange, formatTime } from '@/utils/eventDate';
import { t } from '@/i18n';
import { theme } from '@/theme';

const DESCRIPTION_MAX = 1000;
const RECURRENCE_OPTIONS: { value: EventRecurrence; labelKey: string }[] = [
  { value: EventRecurrence.NONE, labelKey: 'event.wizard.recurrenceNone' },
  { value: EventRecurrence.DAILY, labelKey: 'event.wizard.recurrenceDaily' },
  { value: EventRecurrence.WEEKLY, labelKey: 'event.wizard.recurrenceWeekly' },
  { value: EventRecurrence.MONTHLY, labelKey: 'event.wizard.recurrenceMonthly' },
];

/** Hangi alanın seçicisi açık: başlangıç/bitiş × tarih/saat. */
type PickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime';

const HOUR_MS = 60 * 60 * 1000;

/** Oluşturmada makul varsayılan: şu an + 1 saat (geçmiş-tarih reddine düşmez; web ile aynı). */
function nowPlusOneHour(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

/**
 * Sprint M1j §3.4 — etkinlik formu: **oluştur ve düzenle aynı ekran** (`eventId` parametresi
 * varsa düzenleme). Üç adım: konum → bilgi → önizleme; web `CreateEventWizard.vue` ve sahibin
 * verdiği Discord akışı ile aynı iskelet.
 *
 * 🔴 `coverImageId` HİÇBİR payload'a girmez — mobilde kapak yükleme yok ve alanı `null` göndermek
 * web'den yüklenmiş kapağı silerdi (sözleşme §2).
 *
 * 🔴 Düzenlemede `startAt` (ÇAPA) yüklenir, `occurrenceStartAt` değil: kullanıcı serinin
 * başlangıcını düzenler, hesaplanmış bir örneğini değil.
 */
export default function EventFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string; eventId?: string }>();
  const isEdit = !!params.eventId;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(isEdit);
  const [voiceChannels, setVoiceChannels] = useState<ChannelSummaryDto[]>([]);

  const [locationType, setLocationType] = useState<'' | EventLocationType>('');
  const [channelId, setChannelId] = useState('');
  const [externalLocation, setExternalLocation] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState<Date>(nowPlusOneHour);
  /**
   * Bitiş **zorunlu** (sahip kararı, R1-b). Backend `endAt`'ı opsiyonel kabul ediyor ama bitişsiz
   * etkinlikte `computeOccurrence` süreyi sıfır sayıyor → "şu an sürüyor" rozeti hiç yanmıyor.
   * Varsayılan: başlangıç + 1 saat. Eski (bitişsiz) etkinlik düzenlenirken de aynı kuralla dolar.
   */
  const [endAt, setEndAt] = useState<Date>(() => new Date(nowPlusOneHour().getTime() + HOUR_MS));
  const [recurrence, setRecurrence] = useState<EventRecurrence>(EventRecurrence.NONE);

  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [sheet, setSheet] = useState<'channel' | 'recurrence' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Ses kanalları — konum seçeneğinin veri kaynağı. M1a'daki GUILD_TEXT süzgeci burada geçerli
  // değil: etkinlik ses kanalına bağlanır, listeleme değil seçim yapıyoruz.
  useEffect(() => {
    channelsApi
      .listByGuild(params.guildId)
      .then((list) =>
        setVoiceChannels(
          list.filter((c) => c.type === ChannelType.GUILD_VOICE).sort((a, b) => a.position - b.position),
        ),
      )
      .catch(() => setVoiceChannels([]));
  }, [params.guildId]);

  useEffect(() => {
    const eventId = params.eventId;
    if (!eventId) return;
    eventsApi
      .get(eventId)
      .then((ev) => {
        setLocationType(ev.locationType);
        setChannelId(ev.channelId ?? '');
        setExternalLocation(ev.externalLocation ?? '');
        setName(ev.name);
        setDescription(ev.description ?? '');
        setStartAt(new Date(ev.startAt));
        setEndAt(
          ev.endAt ? new Date(ev.endAt) : new Date(new Date(ev.startAt).getTime() + HOUR_MS),
        );
        setRecurrence(ev.recurrence);
        setLoading(false);
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setLoading(false);
      });
  }, [params.eventId]);

  // Donanım geri tuşu adımlar arasında geri gider, ekranı kapatmaz (adım 1'de kapatır).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1) {
        setStep((s) => s - 1);
        setErrorMessage('');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  function chooseVoice() {
    setLocationType(EventLocationType.VOICE_CHANNEL);
    setErrorMessage('');
    if (!channelId && voiceChannels.length) setChannelId(voiceChannels[0].id);
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    const target = picker;
    setPicker(null);
    if (event.type !== 'set' || !selected || !target) return;

    const isEnd = target === 'endDate' || target === 'endTime';
    const next = new Date(isEnd ? endAt : startAt);

    if (target === 'startDate' || target === 'endDate') {
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }

    if (isEnd) {
      setEndAt(next);
    } else {
      // Başlangıç kayarsa bitiş de aynı kadar kayar — SÜRE korunur. Aksi hâlde başlangıcı ileri
      // alan kullanıcı her seferinde "bitiş başlangıçtan sonra olmalı" hatasına çarpardı.
      const delta = next.getTime() - startAt.getTime();
      setStartAt(next);
      if (delta) setEndAt(new Date(endAt.getTime() + delta));
    }
    setErrorMessage('');
  }

  // İstemci doğrulaması yalnız UX'tir; otorite backend (class-validator). İkisi de aynı kuralı
  // uygular: konum zorunlu · ad zorunlu · başlangıç gelecekte.
  function validateStep1(): boolean {
    if (!locationType) {
      setErrorMessage(t('event.wizard.errLocationType'));
      return false;
    }
    if (locationType === EventLocationType.VOICE_CHANNEL && !channelId) {
      setErrorMessage(t('event.wizard.errVoiceChannel'));
      return false;
    }
    if (locationType === EventLocationType.EXTERNAL && !externalLocation.trim()) {
      setErrorMessage(t('event.wizard.errExternalLocation'));
      return false;
    }
    setErrorMessage('');
    return true;
  }

  function validateStep2(): boolean {
    if (!name.trim()) {
      setErrorMessage(t('event.wizard.errName'));
      return false;
    }
    if (startAt.getTime() <= Date.now()) {
      setErrorMessage(t('event.wizard.errStartPast'));
      return false;
    }
    // Backend de reddediyor (endAt <= startAt → 400); istemci aynı kuralı önden uygular.
    if (endAt.getTime() <= startAt.getTime()) {
      setErrorMessage(t('event.wizard.errEndBeforeStart'));
      return false;
    }
    setErrorMessage('');
    return true;
  }

  function goNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => s + 1);
  }

  function goBack() {
    setErrorMessage('');
    if (step > 1) setStep((s) => s - 1);
    else router.back();
  }

  async function submit() {
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }
    const locType = locationType as EventLocationType;
    const body: CreateEventBody = {
      name: name.trim(),
      description: description.trim() || undefined,
      locationType: locType,
      channelId: locType === EventLocationType.VOICE_CHANNEL ? channelId : undefined,
      externalLocation:
        locType === EventLocationType.EXTERNAL ? externalLocation.trim() : undefined,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      recurrence,
    };

    setSubmitting(true);
    setErrorMessage('');
    try {
      if (params.eventId) await eventsApi.update(params.eventId, body);
      else await eventsApi.create(params.guildId, body);
      // Liste ekranı odaklanınca kendini tazeler (useFocusEffect) — burada bir şey döndürmeye gerek yok.
      router.back();
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const previewLocation =
    locationType === EventLocationType.VOICE_CHANNEL
      ? `🔊 ${voiceChannels.find((c) => c.id === channelId)?.name ?? ''}`
      : `📍 ${externalLocation.trim()}`;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen
        options={{
          // Başlık düzenlemede de adım göstergesi kalır: kullanıcının 3 adımın neresinde olduğunu
          // görmesi, ekranın adını tekrar okumasından daha değerli (Discord da böyle).
          title: t('mobile.events.stepOf', { current: String(step), total: '3' }),
          // Adım göstergesi ikincil bilgidir: ortalanmış, küçük ve kısık renkte. Ekranın asıl
          // başlığı gövdedeki sorudur (Discord'un hiyerarşisi).
          headerTitleAlign: 'center',
          // (native-stack `headerTitleStyle` yalnız fontSize/fontWeight/fontFamily/color kabul
          // ediyor — harf aralığı için özel bir başlık bileşeni gerekirdi, değmez.)
          headerTitleStyle: {
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            fontWeight: '700',
          },
          headerLeft: () => (
            <Pressable onPress={goBack} hitSlop={8} accessibilityRole="button">
              <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          ),
          // Vazgeçme yolu: geri okuna adım adım basmak yerine tek dokunuşla çıkış (sahip revizesi).
          headerRight: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('event.wizard.cancel')}
            >
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 1 && (
              <>
                <View style={styles.questionBlock}>
                  <Text style={styles.question}>{t('event.wizard.locationQuestion')}</Text>
                  <Text style={styles.questionHint}>{t('mobile.events.locationHint')}</Text>
                </View>

                <Pressable
                  onPress={chooseVoice}
                  style={[
                    styles.optionCard,
                    locationType === EventLocationType.VOICE_CHANNEL && styles.optionCardOn,
                  ]}
                >
                  <Text style={styles.optionIcon}>🔊</Text>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{t('event.wizard.locationVoice')}</Text>
                    <Text style={styles.optionDesc}>{t('event.wizard.locationVoiceDesc')}</Text>
                  </View>
                  <Ionicons
                    name={
                      locationType === EventLocationType.VOICE_CHANNEL
                        ? 'radio-button-on'
                        : 'radio-button-off'
                    }
                    size={20}
                    color={
                      locationType === EventLocationType.VOICE_CHANNEL
                        ? theme.colors.accent500
                        : theme.colors.textMuted
                    }
                  />
                </Pressable>

                {locationType === EventLocationType.VOICE_CHANNEL && (
                  <View style={styles.subBlock}>
                    <Text style={styles.label}>{t('event.wizard.voiceChannelLabel')}</Text>
                    {voiceChannels.length === 0 ? (
                      <Text style={styles.hint}>{t('event.wizard.noVoiceChannels')}</Text>
                    ) : (
                      <Pressable onPress={() => setSheet('channel')} style={styles.select}>
                        <Ionicons
                          name="volume-medium-outline"
                          size={16}
                          color={theme.colors.textMuted}
                        />
                        <Text style={styles.selectValue} numberOfLines={1}>
                          {voiceChannels.find((c) => c.id === channelId)?.name ??
                            t('event.wizard.voiceChannelPlaceholder')}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                )}

                <Pressable
                  onPress={() => {
                    setLocationType(EventLocationType.EXTERNAL);
                    setErrorMessage('');
                  }}
                  style={[
                    styles.optionCard,
                    locationType === EventLocationType.EXTERNAL && styles.optionCardOn,
                  ]}
                >
                  <Text style={styles.optionIcon}>📍</Text>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{t('event.wizard.locationExternal')}</Text>
                    <Text style={styles.optionDesc}>{t('event.wizard.locationExternalDesc')}</Text>
                  </View>
                  <Ionicons
                    name={
                      locationType === EventLocationType.EXTERNAL
                        ? 'radio-button-on'
                        : 'radio-button-off'
                    }
                    size={20}
                    color={
                      locationType === EventLocationType.EXTERNAL
                        ? theme.colors.accent500
                        : theme.colors.textMuted
                    }
                  />
                </Pressable>

                {locationType === EventLocationType.EXTERNAL && (
                  <View style={styles.subBlock}>
                    <Text style={styles.label}>{t('event.wizard.externalLabel')}</Text>
                    <TextInput
                      value={externalLocation}
                      onChangeText={(v) => {
                        setExternalLocation(v);
                        setErrorMessage('');
                      }}
                      placeholder={t('event.wizard.externalPlaceholder')}
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                    />
                  </View>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <View style={styles.questionBlock}>
                  <Text style={styles.question}>{t('mobile.events.infoQuestion')}</Text>
                  <Text style={styles.questionHint}>{t('mobile.events.infoHint')}</Text>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>{t('event.wizard.nameLabel')}</Text>
                  <TextInput
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      setErrorMessage('');
                    }}
                    placeholder={t('event.wizard.namePlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                  />
                </View>

                <View style={styles.dateRow}>
                  <View style={styles.dateCol}>
                    <Text style={styles.label}>{t('event.wizard.startDateLabel')}</Text>
                    <Pressable onPress={() => setPicker('startDate')} style={styles.input}>
                      <Text style={styles.inputValue}>{formatDateLabel(startAt)}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={styles.label}>{t('event.wizard.startTimeLabel')}</Text>
                    <Pressable onPress={() => setPicker('startTime')} style={styles.input}>
                      <Text style={styles.inputValue}>{formatTime(startAt)}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.dateRow}>
                  <View style={styles.dateCol}>
                    <Text style={styles.label}>{t('event.wizard.endDateLabel')}</Text>
                    <Pressable onPress={() => setPicker('endDate')} style={styles.input}>
                      <Text style={styles.inputValue}>{formatDateLabel(endAt)}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={styles.label}>{t('event.wizard.endTimeLabel')}</Text>
                    <Pressable onPress={() => setPicker('endTime')} style={styles.input}>
                      <Text style={styles.inputValue}>{formatTime(endAt)}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>{t('event.wizard.recurrenceLabel')}</Text>
                  <Pressable onPress={() => setSheet('recurrence')} style={styles.select}>
                    <Text style={styles.selectValue}>
                      {t(
                        RECURRENCE_OPTIONS.find((o) => o.value === recurrence)?.labelKey ??
                          'event.wizard.recurrenceNone',
                      )}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>{t('event.wizard.descriptionLabel')}</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t('event.wizard.descriptionPlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.input, styles.textarea]}
                    multiline
                    maxLength={DESCRIPTION_MAX}
                    textAlignVertical="top"
                  />
                  {/* Web'in "Markdown desteklenir" ipucu mobilde YOK: burada markdown render
                      edilmiyor (sözleşme §1 OUT), söz verilmeyen şey yazılmaz. */}
                  <Text style={styles.counter}>
                    {description.length}/{DESCRIPTION_MAX}
                  </Text>
                </View>
              </>
            )}

            {step === 3 && (
              <>
                <Text style={styles.question}>{t('event.wizard.reviewTitle')}</Text>
                <View style={styles.previewCard}>
                  <Text style={styles.previewDate}>
                    {formatEventRange(startAt.toISOString(), endAt.toISOString())}
                  </Text>
                  <Text style={styles.previewName}>{name.trim()}</Text>
                  <Text style={styles.previewLocation}>{previewLocation}</Text>
                  {recurrence !== EventRecurrence.NONE && (
                    <Text style={styles.previewRecurrence}>
                      🔁 {t(`event.recurrence.${recurrence.toLowerCase()}`)}
                    </Text>
                  )}
                  {description.trim() ? (
                    <Text style={styles.previewDescription} numberOfLines={6}>
                      {description.trim()}
                    </Text>
                  ) : null}
                </View>
              </>
            )}

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={step === 3 ? submit : goNext}
              disabled={submitting}
              style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {step === 3
                    ? isEdit
                      ? t('event.wizard.save')
                      : t('event.wizard.submit')
                    : t('event.wizard.next')}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      {picker ? (
        <DateTimePicker
          value={picker === 'endDate' || picker === 'endTime' ? endAt : startAt}
          mode={picker === 'startDate' || picker === 'endDate' ? 'date' : 'time'}
          is24Hour
          onChange={onPickerChange}
          minimumDate={
            picker === 'startDate' ? new Date() : picker === 'endDate' ? startAt : undefined
          }
        />
      ) : null}

      {sheet === 'channel' ? (
        <SelectSheet
          title={t('event.wizard.voiceChannelLabel')}
          options={voiceChannels.map((c) => ({
            value: c.id,
            label: c.name ?? '',
            icon: 'volume-medium-outline' as const,
          }))}
          selected={channelId}
          onSelect={(value) => {
            setChannelId(value);
            setSheet(null);
            setErrorMessage('');
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'recurrence' ? (
        <SelectSheet
          title={t('event.wizard.recurrenceLabel')}
          options={RECURRENCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          selected={recurrence}
          onSelect={(value) => {
            setRecurrence(value as EventRecurrence);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: theme.layout.panelGap, gap: 14 },
  questionBlock: { gap: 4, marginBottom: 2 },
  question: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
  },
  questionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  optionCardOn: { borderColor: theme.colors.accent500, backgroundColor: theme.colors.accentSubtle },
  optionIcon: { fontSize: theme.fontSize.xl },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  optionDesc: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
  subBlock: { gap: 6, paddingLeft: 4 },
  field: { gap: 6 },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  inputValue: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  selectValue: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  textarea: { minHeight: 110, paddingTop: 10, paddingBottom: 10 },
  counter: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, alignSelf: 'flex-end' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 3, gap: 6 },
  timeCol: { flex: 2, gap: 6 },
  previewCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
    padding: 14,
    gap: 4,
  },
  previewDate: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  previewName: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '700' },
  previewLocation: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  previewRecurrence: { color: theme.colors.accent500, fontSize: theme.fontSize.xs },
  previewDescription: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 19,
    marginTop: 4,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  footer: {
    padding: theme.layout.panelGap,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
