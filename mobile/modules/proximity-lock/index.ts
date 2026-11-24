import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// Ahize aramasında yakınlık kilidi (sahip kararı 2026-11-24). `picture-in-picture` ile aynı desen:
// yalnız Android derlenir, modül yoksa (eski kabuk, iOS, web) no-op.

declare class NativeProximityLockModule extends NativeModule<Record<never, never>> {
  setEnabled(enabled: boolean): Promise<void>;
}

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeProximityLockModule>('ProximityLock') : null;

export function setProximityLock(enabled: boolean): Promise<void> {
  return native?.setEnabled(enabled).catch(() => undefined) ?? Promise.resolve();
}
