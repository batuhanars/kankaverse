import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceStore } from '@/stores/voice';
import { emergencyApi } from '@/api/emergency';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Feedback {
  reportId: string | null;
  failed: boolean;
}

/**
 * Sprint M4t §3 — A4 acil buton, mobil karşılığı `web/src/components/shared/EmergencyButton.vue`
 * (+ `stores/emergency.ts` + `api/emergency.ts`). Sözleşme: contracts/SPRINT_A4_EMERGENCY_CONTRACT.md.
 *
 * 🔴 Web'de geri-bildirim modalı GLOBAL bir store'da yaşıyor çünkü `leave()` ses çubuğunu (ve
 * içindeki butonu) unmount ediyor — modal component'in kendi ağacında olsaydı o da giderdi.
 * Mobilde AYNI riski FARKLI bir mekanizmayla kapatıyoruz: sunucu kicki geldiğinde `call.tsx`
 * normalde otomatik `router.back()` çağırır (bkz. o dosyadaki `goneRef` effect), ama
 * `stores/voice.ts`teki `emergencyPending` bayrağı TRUE olduğu sürece bu navigasyon ERTELENİR —
 * yani arama ekranı (ve bu component) mount'lu KALIR. Geri bildirim modalı bu yüzden YEREL state
 * olarak tutulabiliyor; global bir store gerekmiyor. `endEmergency()` çağrıldığında (kullanıcı
 * feedback'i kapatınca) ertelenen navigasyon devam eder.
 */
export function EmergencyButton() {
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [statement, setStatement] = useState('');
  const [statementSending, setStatementSending] = useState(false);
  const [statementSent, setStatementSent] = useState(false);
  const [statementError, setStatementError] = useState(false);

  function handlePress() {
    // §3.2.1 — tek onay (yanlışlıkla basma gerçek bir risk). Metin sözleşmeden (tr.json'da hazır).
    Alert.alert(t('emergency.confirmTitle'), t('emergency.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('emergency.confirmAction'), style: 'destructive', onPress: () => void handleConfirm() },
    ]);
  }

  async function handleConfirm() {
    setSending(true);
    // 🔴 Sunucu kicki (LiveKit removeParticipant) bu isteğin SUNUCU TARAFINDAKİ işlenişinin bir
    // parçası — yani ancak `emergencyApi.trigger` gönderildikten SONRA gerçekleşebilir. Bayrak bu
    // satırda, istek gitmeden ÖNCE kurulduğu için yarış durumu yok: `wireRoom`daki
    // `RoomEvent.Disconnected` dinleyicisi her zaman bu bayrağı true bulacak (bkz. stores/voice.ts).
    useVoiceStore.getState().beginEmergency();
    const channelId = useVoiceStore.getState().connectedChannelId ?? undefined;
    let reportId: string | null = null;
    let failed = false;
    try {
      const res = await emergencyApi.trigger(channelId ? { channelId } : {});
      reportId = res.reportId;
    } catch {
      // §3.2.3 🔴 — sessiz başarısızlık YOK: aşağıda `failed: true` ile kullanıcıya açıkça
      // gösteriliyor (`emergency.feedbackError`), mağdur "gitti mi gitmedi mi" bilmeden kalmıyor.
      failed = true;
    }
    setSending(false);
    setFeedback({ reportId, failed });
    // Web pariteti (`EmergencyButton.vue` `finally` bloğu) — bildirim başarısız olsa bile mağduru
    // görüşmede bırakma, yerelde de çıkar (sunucu zaten çekmiş olabilir; `leave()` `leaving`
    // bayrağıyla idempotent, ikinci çağrı no-op). Hata fırlatmaz — `handleHangUp` ile AYNI
    // fire-and-forget desen (call.tsx).
    void useVoiceStore.getState().leave(true);
  }

  function closeFeedback() {
    setFeedback(null);
    setStatement('');
    setStatementSending(false);
    setStatementSent(false);
    setStatementError(false);
    // Ertelenen navigasyonu serbest bırakır — bkz. dosya başı yorumu.
    useVoiceStore.getState().endEmergency();
  }

  async function submitStatement() {
    const reportId = feedback?.reportId;
    const description = statement.trim();
    if (!reportId || !description || statementSending) return;
    setStatementSending(true);
    setStatementError(false);
    try {
      await emergencyApi.addStatement(reportId, description);
      setStatementSent(true);
    } catch {
      // §3.2.3 — burada da sessiz geçilmiyor: `statementError` metni gösterip tekrar denemeye izin verir.
      setStatementError(true);
    } finally {
      setStatementSending(false);
    }
  }

  const modalVisible = sending || feedback !== null;
  const canStatement = !!feedback && !feedback.failed && !!feedback.reportId;

  return (
    <>
      {/* §3.3 🔴 — otomatik gizlenmeye TABİ DEĞİL: bu buton `call.tsx`teki soluklaşan üst bar
          grubunun DIŞINDA, ayrı bir konteynerde render ediliyor (bkz. call.tsx yorumu). */}
      <Pressable
        onPress={handlePress}
        hitSlop={10}
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={t('emergency.button')}
      >
        <Ionicons name="shield" size={16} color={theme.colors.textPrimary} />
        <Text style={styles.pillText}>{t('emergency.button')}</Text>
      </Pressable>

      {/* 🔴 Kapalıyken Modal HİÇ kurulmaz (OutputPickerSheet/CameraNudgeModal ile AYNI ders —
          Fabric "child already has a parent" çökme sınıfı). */}
      {modalVisible && (
        <Modal transparent visible animationType="fade" onRequestClose={sending ? undefined : closeFeedback}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.backdrop}>
              <View style={styles.card}>
                {sending ? (
                  <View style={styles.sendingWrap}>
                    <ActivityIndicator color={theme.colors.accent500} size="large" />
                  </View>
                ) : (
                  <>
                    <Text style={styles.title}>{t('emergency.feedbackTitle')}</Text>
                    <Text style={styles.body}>
                      {feedback?.failed ? t('emergency.feedbackError') : t('emergency.feedbackReported')}
                    </Text>

                    <View style={styles.resourceBox}>
                      <Text style={styles.resourceTitle}>{t('emergency.resourcesTitle')}</Text>
                      <Text style={styles.resource}>{t('emergency.resourceEmergency')}</Text>
                      <Text style={styles.resource}>{t('emergency.resourceSupport')}</Text>
                    </View>

                    {canStatement && !statementSent && (
                      <>
                        <Text style={styles.statementLabel}>{t('emergency.statementLabel')}</Text>
                        <TextInput
                          value={statement}
                          onChangeText={setStatement}
                          placeholder={t('emergency.statementPlaceholder')}
                          placeholderTextColor={theme.colors.textMuted}
                          style={styles.input}
                          multiline
                          numberOfLines={3}
                        />
                        {statementError && <Text style={styles.errorText}>{t('emergency.statementError')}</Text>}
                        <Pressable
                          onPress={() => void submitStatement()}
                          disabled={statementSending || !statement.trim()}
                          style={[
                            styles.submitButton,
                            (statementSending || !statement.trim()) && styles.submitButtonDisabled,
                          ]}
                          accessibilityRole="button"
                        >
                          {statementSending ? (
                            <ActivityIndicator color={theme.colors.textPrimary} size="small" />
                          ) : (
                            <Text style={styles.submitText}>{t('emergency.statementSubmit')}</Text>
                          )}
                        </Pressable>
                      </>
                    )}
                    {statementSent && <Text style={styles.sentText}>{t('emergency.statementSent')}</Text>}

                    <Pressable onPress={closeFeedback} style={styles.closeButton} accessibilityRole="button">
                      <Text style={styles.closeText}>{t('emergency.close')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Sahip kararı 2026-08-10 — dolu (opak) kırmızı, çerçeveli-saydam DEĞİL. Gerekçe: buton
  // artık videonun üstünde de duruyor (tam ekran ekran paylaşımı); saydam zeminli ince çerçeve
  // açık renkli bir sahnede kayboluyordu. Dolu zemin ayrıca T&S yönünde doğru taraf: acil çıkış
  // yolu göze çarpmalı. İkon da dolu (`shield`), metin/ikon rengi zemine karşı `textPrimary`.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.danger,
  },
  pillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.layout.panelGap,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  sendingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.md,
    lineHeight: 20,
    marginBottom: 14,
  },
  resourceBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  resourceTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  resource: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
  },
  statementLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: 6,
  },
  input: {
    minHeight: 72,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.md,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: 8,
  },
  submitButton: {
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  sentText: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
    marginBottom: 8,
  },
  closeButton: {
    minHeight: theme.layout.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  closeText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
