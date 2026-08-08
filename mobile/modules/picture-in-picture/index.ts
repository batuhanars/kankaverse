import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// M4p sözleşme §2 — Android PiP. `call-foreground-service`in JS bridge deseniyle BİREBİR aynı
// (`requireOptionalNativeModule`, no-op'a düşen web/iOS dalları — yalnız Android derlenir,
// `expo-module.config.json` "platforms": ["android"]).

type PictureInPictureModuleEvents = {
  onModeChanged(event: { isInPip: boolean }): void;
};

declare class NativePictureInPictureModule extends NativeModule<PictureInPictureModuleEvents> {
  setCallActive(active: boolean): Promise<void>;
  isSupported(): Promise<boolean>;
  /** 🔴 SENKRON (bkz. native taraf yorumu) — JS event sırasına güvenmeden native GERÇEĞİ okur. */
  isInPip(): boolean;
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativePictureInPictureModule>('PictureInPicture')
    : null;

/**
 * Arama bağlanır/ayrılırken çağrılır (`stores/voice.ts` `startOrJoin`/`leave`). `MainActivity`nin
 * `onUserLeaveHint`ini yalnız bu `true` iken PiP'e girmeyi DENEMESİ için — bkz. native taraf.
 */
export function setPipCallActive(active: boolean): Promise<void> {
  return native?.setCallActive(active) ?? Promise.resolve();
}

export function isPipSupported(): Promise<boolean> {
  return native?.isSupported() ?? Promise.resolve(false);
}

/**
 * 🔴 SENKRON — yalnız `stores/voice.ts` `handleAppStateChange`'in AppState 'background' dalında
 * kullanılır (§4: "PiP'e geçtiyse kamera DURDURULMAZ"). Native modül yoksa (iOS/web) ya da senkron
 * çağrı bir sebeple istisna fırlatırsa `false` döner — güvenli taraf: PiP YOK sayılır, kamera
 * bugünkü gibi durur.
 */
export function isPipCurrentlyActive(): boolean {
  if (!native) return false;
  try {
    return native.isInPip();
  } catch {
    return false;
  }
}

/** PiP mod değişimi — çağrı ekranı/overlay bu bilgiyle kompakt düzene geçer (sözleşme §2/§3). */
export function addPipModeChangeListener(
  listener: (event: { isInPip: boolean }) => void,
): { remove: () => void } {
  if (!native) return { remove: () => {} };
  return native.addListener('onModeChanged', listener);
}
