import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallAudioBusy } from '@/hooks/useCallAudioBusy';
import { readFileSize, type DraftAttachment } from '@/utils/attachmentUpload';
import { t } from '@/i18n';

/** Sprint M6b §3 — kayıt üst sınırı (sunucu `DURATION_TOO_LONG` sınırıyla aynı: 300000 ms). */
export const MAX_VOICE_MS = 5 * 60 * 1000;
/** 1 sn'den kısa kayıt yanlış dokunuş sayılır, sessizce atılır. */
const MIN_VOICE_MS = 1000;
const NOTICE_MS = 5000;

/** `idle` → `recording` → (5:00'da) `limit`: kayıt durdu, gönder/sil bekleniyor. */
export type VoicePhase = 'idle' | 'recording' | 'limit';

/**
 * Sprint M6b §3-§4 — sesli mesaj kaydı. Dokun-başlat (basılı tutma DEĞİL); biten kayıt
 * `DraftAttachment` olarak çıkar ve MEVCUT ek hattıyla (`onSend([draft])`) gider, yeni bir yükleme
 * yolu yok.
 *
 * 🔴 Ses oturumu: yalnız kayıt SÜRERKEN `allowsRecording` açılır ve bitince geri alınır. LiveKit'in
 * `AudioSession`ına dokunulmaz; zaten aramadayken kayıt hiç başlatılmaz (`inCall`).
 *
 * `channelId` değişirse ya da bileşen sökülürse kayıt iptal edilir (§3: başka sohbete geçilirse).
 */
export function useVoiceRecorder(channelId: string) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);
  const { inCall } = useCallAudioBusy();

  const [phase, setPhase] = useState<VoicePhase>('idle');
  /** Kullanıcıya kısa açıklama (izin yok, aramada); boşsa gösterilmez. */
  const [notice, setNotice] = useState('');
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Kayıt kendiliğinden (5:00) durunca dosya/süre burada bekler. */
  const finished = useRef<{ uri: string; durationMs: number } | null>(null);
  const phaseRef = useRef<VoicePhase>('idle');

  const setPhaseBoth = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const showNotice = useCallback((text: string, settings = false) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    setCanOpenSettings(settings);
    noticeTimer.current = setTimeout(() => {
      setNotice('');
      setCanOpenSettings(false);
    }, NOTICE_MS);
  }, []);

  const restoreAudioMode = useCallback(() => {
    // Kaydı bitirince mod geri alınır (iOS'ta `allowsRecording` açıkken çalma kısık kalır).
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, []);

  /** Kaydı durdurur; (uri, süre) döner, dosya yoksa null. Süre DURDURMADAN önce okunur. */
  const stopRecorder = useCallback(async () => {
    const durationMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
    } catch {
      // zaten durmuş olabilir
    }
    restoreAudioMode();
    const uri = recorder.uri;
    return uri ? { uri, durationMs } : null;
  }, [recorder, restoreAudioMode]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    // §3: aramadayken mikrofon arama tarafından kullanılıyor — kayıt KAPALI, sebebi söylenir.
    if (inCall) {
      showNotice(t('mobile.voice.inCall'));
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showNotice(t('mobile.voice.permissionDenied'), true);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      finished.current = null;
      setNotice('');
      setPhaseBoth('recording');
    } catch {
      restoreAudioMode();
      showNotice(t('mobile.voice.failed'));
    }
  }, [inCall, recorder, restoreAudioMode, setPhaseBoth, showNotice]);

  /** 🗑 — kayıt atılır, hiçbir şey gönderilmez. */
  const cancel = useCallback(async () => {
    if (phaseRef.current === 'idle') return;
    setPhaseBoth('idle');
    const wasLimit = finished.current !== null;
    finished.current = null;
    if (!wasLimit) await stopRecorder();
  }, [setPhaseBoth, stopRecorder]);

  /**
   * Gönder — kaydı bitirir ve taslağı döner (çağıran `onSend([draft])` ile yollar). 1 sn'den kısaysa
   * ya da dosya yoksa null (sessizce atılır).
   */
  const finish = useCallback(async (): Promise<DraftAttachment | null> => {
    if (phaseRef.current === 'idle') return null;
    // Çift dokunuş ikinci kez durdurmasın: faz hemen kapanır (durdurma beklenirken `phase` state'i sonra).
    phaseRef.current = 'idle';
    const result = finished.current ?? (await stopRecorder());
    finished.current = null;
    setPhaseBoth('idle');
    if (!result || result.durationMs < MIN_VOICE_MS) return null;
    const durationMs = Math.min(Math.round(result.durationMs), MAX_VOICE_MS);
    return {
      key: `voice-${Date.now()}`,
      uri: result.uri,
      filename: `sesli-mesaj-${Date.now()}.m4a`,
      contentType: 'audio/mp4',
      size: await readFileSize(result.uri),
      durationMs,
    };
  }, [setPhaseBoth, stopRecorder]);

  // 5:00'a ulaşınca kayıt kendiliğinden durur ve GÖNDERİLMEZ; şerit gönder/sil bekler.
  useEffect(() => {
    if (phase !== 'recording' || recState.durationMillis < MAX_VOICE_MS) return;
    setPhaseBoth('limit');
    void stopRecorder().then((result) => {
      finished.current = result ? { uri: result.uri, durationMs: MAX_VOICE_MS } : null;
    });
  }, [phase, recState.durationMillis, setPhaseBoth, stopRecorder]);

  // Başka sohbete geçildi ya da ekran söküldü: kayıt iptal. Aynı döngüde zamanlayıcı da temizlenir.
  useEffect(() => {
    return () => {
      if (phaseRef.current !== 'idle') {
        phaseRef.current = 'idle';
        finished.current = null;
        void recorder.stop().catch(() => {});
        restoreAudioMode();
      }
    };
  }, [channelId, recorder, restoreAudioMode]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Kayıt sürerken arama başlarsa (karşı taraf aradı, biz kabul ettik) kayıt atılır: mikrofon aramanın.
  useEffect(() => {
    if (inCall && phaseRef.current !== 'idle') void cancel();
  }, [inCall, cancel]);

  return {
    phase,
    elapsedMs: phase === 'limit' ? MAX_VOICE_MS : recState.durationMillis,
    /** Mikrofon düğmesi devre dışı görünür mü (aramada). Dokununca `start` açıklamayı gösterir. */
    disabled: inCall,
    notice,
    /** İzin reddedildiyse sistem ayarlarını açan eylem; yoksa null. */
    openSettings: canOpenSettings ? () => void Linking.openSettings() : null,
    start,
    cancel,
    finish,
  };
}
