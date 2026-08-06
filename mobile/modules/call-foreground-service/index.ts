import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// M4a-1 sözleşme §6 — Android'e özel mikrofon-tipi foreground service + kalıcı bildirim
// (Bağlantıyı Kes / Sustur). Yalnız Android derlenir (`expo-module.config.json` "platforms":
// ["android"]) — `requireOptionalNativeModule` web/iOS'ta null döner, `expo start --web` veya
// ileride bir iOS derlemesi bu dosyayı import ettiğinde ÇÖKMEZ (aşağıdaki no-op'lara düşer).

export type CallForegroundAction = 'disconnect' | 'toggleMute';

type CallForegroundModuleEvents = {
  onAction(event: { action: CallForegroundAction }): void;
};

declare class NativeCallForegroundServiceModule extends NativeModule<CallForegroundModuleEvents> {
  start(title: string, body: string, muteLabel: string, disconnectLabel: string, channelName: string): Promise<void>;
  update(body: string, muteLabel: string): Promise<void>;
  stop(): Promise<void>;
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeCallForegroundServiceModule>('CallForegroundService')
    : null;

/**
 * Servisi başlatır (bkz. `stores/voice.ts` `join()`) — tüm metinler çağıran taraftan (`t(...)`) gelir.
 * `channelName` — PM incelemesi (2026-08-06): Android bildirim kanalı adı Ayarlar > Bildirimler'de
 * kullanıcıya görünür, native tarafta sabit bir Türkçe dize olarak GÖMÜLEMEZ (kök CLAUDE.md i18n
 * kuralı) — kaynağı da `t('mobile.call.notifChannel')` olmalı.
 */
export function startCallForegroundService(
  title: string,
  body: string,
  muteLabel: string,
  disconnectLabel: string,
  channelName: string,
): Promise<void> {
  return native?.start(title, body, muteLabel, disconnectLabel, channelName) ?? Promise.resolve();
}

/** Mikrofon aç/kapa değiştiğinde gövde/eylem etiketini günceller (bkz. `toggleMute()`). */
export function updateCallForegroundService(body: string, muteLabel: string): Promise<void> {
  return native?.update(body, muteLabel) ?? Promise.resolve();
}

/** Arama biterken servis + bildirim kaldırılır (`leave()`), uygulama kapansa/çökse bile kalmaz. */
export function stopCallForegroundService(): Promise<void> {
  return native?.stop() ?? Promise.resolve();
}

/** Bildirim eylemine dokunma → JS'e geri bildirim ("Bağlantıyı Kes"/"Sustur"). */
export function addCallForegroundActionListener(
  listener: (event: { action: CallForegroundAction }) => void,
): { remove: () => void } {
  if (!native) return { remove: () => {} };
  return native.addListener('onAction', listener);
}
