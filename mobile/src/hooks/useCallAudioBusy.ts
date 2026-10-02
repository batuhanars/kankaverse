import { useVoiceStore } from '@/stores/voice';

/**
 * Sprint M6b — mikrofon/hoparlör şu an sesli aramaya mı ait?
 *
 * `inCall`: bağlı ya da bağlanıyor (mikrofonu arama tutuyor → sesli mesaj KAYDI kapalı).
 * `ringing`: uygulama-içi gelen arama şeridi açık (çalan sesli mesaj durur).
 *
 * Yalnız bileşenlerden okunur; `stores/*` bu dosyayı import etmez, dolayısıyla `stores/voice` import
 * döngüsüne yeni kenar eklemez (bkz. `audio/messageTone.ts` başlığındaki 2026-09-19 çökmesi).
 */
export function useCallAudioBusy(): { inCall: boolean; ringing: boolean } {
  const inCall = useVoiceStore((s) => s.connectedChannelId !== null || s.connecting);
  const ringing = useVoiceStore((s) => s.incomingCall !== null);
  return { inCall, ringing };
}
